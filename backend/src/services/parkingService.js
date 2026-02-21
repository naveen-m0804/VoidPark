// =============================================
// VoidPark - Parking Service
// =============================================

const { pool, withTransaction } = require('../config/database');

// ─────────────────────────────────────────────
// Shared: availability sub-queries per type
// ─────────────────────────────────────────────
const countTotal = (type) => `
  (SELECT COUNT(*) FROM parking_slots s
   WHERE s.parking_id = ps.id AND s.is_active = true AND s.vehicle_type = '${type}')
`;

const countAvailable = (type) => `
  (SELECT COUNT(*) FROM parking_slots s
   WHERE s.parking_id = ps.id AND s.is_active = true AND s.vehicle_type = '${type}'
   AND s.id NOT IN (
     SELECT b.slot_id FROM bookings b
     WHERE b.slot_id = s.id
       AND b.booking_status = 'confirmed'
       AND b.start_time <= NOW()
       AND (b.end_time IS NULL OR b.end_time > NOW())
   ))
`;

const VEHICLE_COUNTS_SQL = `
  ${countTotal('car')} AS total_slots_car,
  ${countAvailable('car')} AS available_slots_car,
  ${countTotal('bike')} AS total_slots_bike,
  ${countAvailable('bike')} AS available_slots_bike,
  ${countTotal('other')} AS total_slots_other,
  ${countAvailable('other')} AS available_slots_other
`;

// ── 1. GET ALL PARKING SORTED BY DISTANCE ──
async function getNearbyParking(lat, lng, userId) {
  const query = `
    SELECT ps.*,
           ST_Y(ps.location::geometry) AS latitude,
           ST_X(ps.location::geometry) AS longitude,
           ST_Distance(ps.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_meters,
           u.name AS owner_name,
           u.phone AS owner_phone,
           ${VEHICLE_COUNTS_SQL}
    FROM parking_spaces ps
    JOIN users u ON ps.owner_id = u.id
    WHERE ps.is_active = true
      ${userId ? 'AND ps.owner_id != $3' : ''}
    ORDER BY distance_meters ASC
  `;
  
  const params = [lat, lng];
  if (userId) params.push(userId);
  
  const result = await pool.query(query, params);
  return result.rows;
}

// ── 2. SEARCH BY PLACE NAME OR ADDRESS ──
async function searchParking(term, userId) {
  const searchTerm = `%${term}%`;
  const query = `
    SELECT ps.*,
           ST_Y(ps.location::geometry) AS latitude,
           ST_X(ps.location::geometry) AS longitude,
           u.name AS owner_name,
           u.phone AS owner_phone,
           ${VEHICLE_COUNTS_SQL}
    FROM parking_spaces ps
    JOIN users u ON ps.owner_id = u.id
    WHERE ps.is_active = true
      AND (ps.place_name ILIKE $1 OR ps.address ILIKE $1)
      ${userId ? 'AND ps.owner_id != $2' : ''}
    ORDER BY ps.created_at DESC
  `;
  
  const params = [searchTerm];
  if (userId) params.push(userId);

  const result = await pool.query(query, params);
  return result.rows;
}

// ─────────────────────────────────────────────
// 3. GET MY PARKING SPACES (owner)
// ─────────────────────────────────────────────
async function getMyParkingSpaces(ownerId) {
  const result = await pool.query(
    `SELECT ps.*,
            ST_Y(ps.location::geometry) AS latitude,
            ST_X(ps.location::geometry) AS longitude,
            ${VEHICLE_COUNTS_SQL}
     FROM parking_spaces ps
     WHERE ps.owner_id = $1
     ORDER BY ps.created_at DESC`,
    [ownerId]
  );
  return result.rows;
}

// ─────────────────────────────────────────────
// 4. GET PARKING SPACE BY ID
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 4. GET PARKING SPACE BY ID
// ─────────────────────────────────────────────
async function getParkingById(parkingId, startTime, endTime) {
  const spaceResult = await pool.query(
    `SELECT ps.*,
            ST_Y(ps.location::geometry) AS latitude,
            ST_X(ps.location::geometry) AS longitude,
            u.name AS owner_name,
            u.phone AS owner_phone,
            ${VEHICLE_COUNTS_SQL}
     FROM parking_spaces ps
     JOIN users u ON ps.owner_id = u.id
     WHERE ps.id = $1`,
    [parkingId]
  );

  if (spaceResult.rows.length === 0) {
    throw Object.assign(new Error('Parking space not found.'), { statusCode: 404 });
  }

  const space = spaceResult.rows[0];

  // Prepare time range for checking availability
  // If not provided, defaults to NOW() -> Infinity (checks current status)
  const start = startTime ? new Date(startTime).toISOString() : new Date().toISOString();
  const end = endTime ? new Date(endTime).toISOString() : '9999-12-31T23:59:59Z';

  // Get slots with dynamic status based on time range
  const slotsResult = await pool.query(
    `SELECT sl.id, sl.slot_number, sl.vehicle_type, sl.is_active,
            CASE
              WHEN b.id IS NOT NULL THEN 'occupied'
              ELSE 'available'
            END AS status,
            b.start_time AS occupied_start,
            b.end_time AS occupied_end
     FROM parking_slots sl
     LEFT JOIN LATERAL (
       SELECT id, start_time, end_time
       FROM bookings b
       WHERE b.slot_id = sl.id
         AND b.booking_status = 'confirmed'
         AND b.start_time < $3::timestamptz
         AND COALESCE(b.end_time, '9999-12-31T23:59:59Z'::timestamptz) > $2::timestamptz
       ORDER BY b.start_time ASC
       LIMIT 1
     ) b ON true
     WHERE sl.parking_id = $1
     ORDER BY sl.vehicle_type, sl.slot_number`,
    [parkingId, start, end]
  );

  space.slots = slotsResult.rows;
  return space;
}

// ─────────────────────────────────────────────
// 5. CREATE PARKING SPACE
// ─────────────────────────────────────────────
async function createParkingSpace(ownerId, data) {
  return withTransaction(async (client) => {
    // defaults
    const slotsCar = parseInt(data.totalSlotsCar) || 0;
    const slotsBike = parseInt(data.totalSlotsBike) || 0;
    const slotsOther = parseInt(data.totalSlotsOther) || 0;

    const spaceResult = await client.query(
      `INSERT INTO parking_spaces
         (owner_id, place_name, address, location, 
          price_per_hour_car, total_slots_car,
          price_per_hour_bike, total_slots_bike,
          price_per_hour_other, total_slots_other,
          description)
       VALUES
         ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, 
          $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        ownerId,
        data.placeName,
        data.address,
        data.latitude,
        data.longitude,
        data.pricePerHourCar || 0, slotsCar,
        data.pricePerHourBike || 0, slotsBike,
        data.pricePerHourOther || 0, slotsOther,
        data.description || null,
      ]
    );

    const space = spaceResult.rows[0];

    // Helper to generate slots
    const createSlots = async (type, count, startNum) => {
      if (count <= 0) return startNum;
      const values = [];
      const params = [space.id];
      let pIdx = 2; // $1 is parking_id
      
      for (let i = 0; i < count; i++) {
        values.push(`($1, $${pIdx}, $${pIdx + 1})`); // (parking_id, slot_number, vehicle_type)
        params.push(startNum + i, type);
        pIdx += 2;
      }
      
      await client.query(
        `INSERT INTO parking_slots (parking_id, slot_number, vehicle_type) VALUES ${values.join(', ')}`,
        params
      );
      return startNum + count;
    };

    let currentSlotNum = 1;
    currentSlotNum = await createSlots('car', slotsCar, currentSlotNum);
    currentSlotNum = await createSlots('bike', slotsBike, currentSlotNum);
    currentSlotNum = await createSlots('other', slotsOther, currentSlotNum);

    return getParkingByIdWithClient(client, space.id);
  });
}

// Internal helper using a transaction client
async function getParkingByIdWithClient(client, parkingId) {
  const spaceResult = await client.query(
    `SELECT ps.*,
            ST_Y(ps.location::geometry) AS latitude,
            ST_X(ps.location::geometry) AS longitude,
            u.name AS owner_name,
            u.phone AS owner_phone
     FROM parking_spaces ps
     JOIN users u ON ps.owner_id = u.id
     WHERE ps.id = $1`,
    [parkingId]
  );
  const space = spaceResult.rows[0];
  // Note: Skipping full slot queries for simple return to avoid clutter
  return space;
}

// ─────────────────────────────────────────────
// 6. UPDATE PARKING SPACE (owner only)
// ─────────────────────────────────────────────
async function updateParkingSpace(parkingId, ownerId, data) {
  return withTransaction(async (client) => {
    // Verify ownership
    const existing = await client.query(
      `SELECT * FROM parking_spaces WHERE id = $1 FOR UPDATE`,
      [parkingId]
    );

    if (existing.rows.length === 0) throw { message: 'Parking space not found', statusCode: 404 };
    if (existing.rows[0].owner_id !== ownerId) throw { message: 'Unauthorized', statusCode: 403 };

    const current = existing.rows[0];

    // Build updates
    const updates = [];
    const values = [];
    let idx = 1;

    const fieldMap = {
      placeName: 'place_name',
      address: 'address',
      pricePerHourCar: 'price_per_hour_car',
      pricePerHourBike: 'price_per_hour_bike',
      pricePerHourOther: 'price_per_hour_other',
      totalSlotsCar: 'total_slots_car',
      totalSlotsBike: 'total_slots_bike',
      totalSlotsOther: 'total_slots_other',
      description: 'description',
      isActive: 'is_active',
    };

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (data[jsKey] !== undefined) {
        updates.push(`${dbKey} = $${idx}`);
        values.push(data[jsKey]);
        idx++;
      }
    }

    if (data.latitude !== undefined && data.longitude !== undefined) {
      updates.push(`location = ST_SetSRID(ST_MakePoint($${idx + 1}, $${idx}), 4326)::geography`);
      values.push(data.latitude, data.longitude);
      idx += 2;
    }

    if (updates.length > 0) {
      values.push(parkingId);
      await client.query(
        `UPDATE parking_spaces SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );
    }

    // Handle slot resizing - strict approach: if count changes, we adjust slots. 
    // This is complex if slots are occupied. Simplification: Only allow increasing slots securely. 
    // Decreasing slots requires checking if they are empty.
    
    const handleSlotResize = async (type, newCount, currentCount) => {
      if (newCount === undefined || newCount === currentCount) return;
      
      const diff = newCount - currentCount;
      if (diff > 0) {
        // Add slots
        const maxSlotResult = await client.query('SELECT MAX(slot_number) as max_num FROM parking_slots WHERE parking_id = $1', [parkingId]);
        let startNum = (maxSlotResult.rows[0].max_num || 0) + 1;
        
        const values = [];
        const params = [parkingId];
        let pIdx = 2;
        for (let i = 0; i < diff; i++) {
          values.push(`($1, $${pIdx}, $${pIdx+1})`);
          params.push(startNum + i, type);
          pIdx += 2;
        }
        await client.query(`INSERT INTO parking_slots (parking_id, slot_number, vehicle_type) VALUES ${values.join(', ')}`, params);
      } 
      // Handling decrease is skipped for safety/simplicity in this iteration unless requested.
    };

    await handleSlotResize('car', data.totalSlotsCar, current.total_slots_car);
    await handleSlotResize('bike', data.totalSlotsBike, current.total_slots_bike);
    await handleSlotResize('other', data.totalSlotsOther, current.total_slots_other);

    return getParkingByIdWithClient(client, parkingId);
  });
}

// ─────────────────────────────────────────────
// 7. DELETE PARKING SPACE
// ─────────────────────────────────────────────
async function deleteParkingSpace(parkingId, ownerId) {
  return withTransaction(async (client) => {
    // Update active bookings to cancelled before deleting
    await client.query(
      `UPDATE bookings SET booking_status = 'cancelled'
       WHERE parking_id = $1 AND booking_status IN ('pending', 'confirmed')`,
      [parkingId]
    );

    await client.query('DELETE FROM parking_spaces WHERE id = $1 AND owner_id = $2', [parkingId, ownerId]);
    return { deleted: true };
  });
}

module.exports = {
  getNearbyParking,
  searchParking,
  getMyParkingSpaces,
  getParkingById,
  createParkingSpace,
  updateParkingSpace,
  deleteParkingSpace,
};
