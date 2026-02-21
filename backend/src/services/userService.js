// =============================================
// VoidPark - User Service
// =============================================

const { query, getClient } = require('../config/database');
const { deleteFirebaseUser } = require('../config/firebase');

const UserService = {
  /**
   * Create a new user (first-time Firebase user → local DB)
   */
  async createUser({ firebaseUid, name, phone, email }) {
    const result = await query(
      `INSERT INTO users (firebase_uid, name, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING id, firebase_uid, name, phone, email, created_at, updated_at`,
      [firebaseUid, name, phone, email]
    );
    return result.rows[0];
  },

  /**
   * Get user by internal ID
   */
  async getUserById(id) {
    const result = await query(
      'SELECT id, firebase_uid, name, phone, email, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Get user by Firebase UID
   */
  async getUserByFirebaseUid(firebaseUid) {
    const result = await query(
      'SELECT id, firebase_uid, name, phone, email, created_at, updated_at FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );
    return result.rows[0] || null;
  },

  /**
   * Update user profile
   */
  async updateUser(id, { name, phone, email }) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(email);
    }

    if (fields.length === 0) return this.getUserById(id);

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, firebase_uid, name, phone, email, created_at, updated_at`,
      values
    );
    return result.rows[0];
  },

  /**
   * Delete user account — transactional:
   *   1. Delete bookings
   *   2. Delete parking slots (via cascade from parking_spaces)
   *   3. Delete parking spaces
   *   4. Delete user record
   *   5. Delete Firebase account
   */
  async deleteUser(id, firebaseUid) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Cancel active bookings
      await client.query(
        `UPDATE bookings SET booking_status = 'cancelled'
         WHERE user_id = $1 AND booking_status IN ('pending', 'confirmed')`,
        [id]
      );

      // Delete bookings
      await client.query('DELETE FROM bookings WHERE user_id = $1', [id]);

      // Delete parking spaces (slots cascade)
      await client.query('DELETE FROM parking_spaces WHERE owner_id = $1', [id]);

      // Delete user record
      await client.query('DELETE FROM users WHERE id = $1', [id]);

      // Delete Firebase account
      try {
        await deleteFirebaseUser(firebaseUid);
      } catch (firebaseErr) {
        console.warn('Firebase user deletion failed or already deleted:', firebaseErr.message);
      }

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = UserService;
