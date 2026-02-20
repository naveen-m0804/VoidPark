// =============================================
// ParkEase - Booking Service
// =============================================
// Handles all booking logic WITHOUT payment gateway.
// Users book directly; payment is handled offline
// between user and owner.
// =============================================
const { pool, withTransaction } = require('../config/database');

// ─────────────────────────────────────────────
// Helper: get hourly rate by vehicle type
// ─────────────────────────────────────────────
function getHourlyRateField(vehicleType) {
  const map = {
    car: 'price_per_hour_car',
    bike: 'price_per_hour_bike',
    other: 'price_per_hour_other',
  };
  return map[vehicleType] || 'price_per_hour_car';
}

// ─────────────────────────────────────────────
// Helper: calculate total amount from rate + times
// Returns null if endTime is not provided
// ─────────────────────────────────────────────
function calculateAmount(hourlyRate, startTime, endTime) {
  if (!endTime) return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const hours = Math.max((end - start) / (1000 * 60 * 60), 0.5); // Minimum 30 minutes
  return parseFloat((hourlyRate * hours).toFixed(2));
}

// ─────────────────────────────────────────────
// 1. CREATE BOOKING
// ─────────────────────────────────────────────
// - Finds available slot with row-level locking
// - Calculates price server-side
// - Creates booking as 'confirmed' immediately
// - end_time is optional (null = open-ended)
// ─────────────────────────────────────────────
async function createBooking(userId, data) {
  return withTransaction(async (client) => {
    const startTime = new Date(data.startTime);
    const endTime = data.endTime ? new Date(data.endTime) : null;

    // Validate times
    // Relaxed validation: start time can be in the past (e.g., booking started "just now").
    // We only strictly ensure that if endTime exists, it is > startTime.

    if (endTime && endTime <= startTime) {
      throw Object.assign(new Error('End time must be after start time.'), { statusCode: 400 });
    }

    // 1. Lock and verify the parking space
    const parkingResult = await client.query(
      `SELECT id, ${getHourlyRateField(data.vehicleType)} AS hourly_rate, is_active
       FROM parking_spaces
       WHERE id = $1
       FOR SHARE`,
      [data.parkingId]
    );

    if (parkingResult.rows.length === 0) {
      throw Object.assign(new Error('Parking space not found.'), { statusCode: 404 });
    }

    const parking = parkingResult.rows[0];

    if (!parking.is_active) {
      throw Object.assign(new Error('This parking space is currently unavailable.'), { statusCode: 400 });
    }

    const hourlyRate = parseFloat(parking.hourly_rate);

    // 2. Find an available slot with row-level lock
    // A slot is occupied if there's a confirmed booking where:
    //   existing.start_time < COALESCE(new.end_time, 'infinity')
    //   AND COALESCE(existing.end_time, 'infinity') > new.start_time
    const endTimeParam = endTime ? endTime.toISOString() : '9999-12-31T23:59:59Z';
    
    let slotQuery = `
       SELECT sl.id, sl.slot_number
       FROM parking_slots sl
       WHERE sl.parking_id = $1
         AND sl.vehicle_type = $4
         AND sl.is_active = true
    `;

    const queryParams = [data.parkingId, startTime.toISOString(), endTimeParam, data.vehicleType];
    
    // If specific slot requested
    if (data.slotId) {
      slotQuery += ` AND sl.id = $5`;
      queryParams.push(data.slotId);
    }
    
    slotQuery += `
         AND sl.id NOT IN (
           SELECT b.slot_id FROM bookings b
           WHERE b.slot_id = sl.id
             AND b.booking_status = 'confirmed'
             AND b.start_time < $3::timestamptz
             AND COALESCE(b.end_time, '9999-12-31T23:59:59Z'::timestamptz) > $2::timestamptz
         )
       ORDER BY sl.slot_number
       LIMIT 1
       FOR UPDATE OF sl
    `;

    const slotResult = await client.query(slotQuery, queryParams);

    if (slotResult.rows.length === 0) {
      throw Object.assign(
        new Error('No available slots for the selected time period.'),
        { statusCode: 409 }
      );
    }

    const slot = slotResult.rows[0];
    const totalAmount = calculateAmount(hourlyRate, startTime, endTime);

    // 3. Create the booking — confirmed immediately
    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, parking_id, slot_id, vehicle_type, start_time, end_time, hourly_rate, total_amount, booking_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
       RETURNING *`,
      [
        userId,
        data.parkingId,
        slot.id,
        data.vehicleType,
        startTime.toISOString(),
        endTime ? endTime.toISOString() : null,
        hourlyRate,
        totalAmount,
      ]
    );

    const booking = bookingResult.rows[0];

    return {
      booking,
      slot: {
        id: slot.id,
        slotNumber: slot.slot_number,
      },
      pricing: {
        hourlyRate,
        totalAmount,
        isOpenEnded: endTime === null,
      },
    };
  });
}

// ─────────────────────────────────────────────
// 2. END BOOKING (set end time for open-ended)
// ─────────────────────────────────────────────
async function endBooking(bookingId, userId, endTime) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [bookingId, userId]
    );

    if (result.rows.length === 0) {
      throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    }

    const booking = result.rows[0];

    if (booking.booking_status !== 'confirmed') {
      throw Object.assign(
        new Error(`Cannot end a booking with status "${booking.booking_status}".`),
        { statusCode: 400 }
      );
    }

    const end = new Date(endTime);
    const start = new Date(booking.start_time);

    if (end <= start) {
      throw Object.assign(new Error('End time must be after start time.'), { statusCode: 400 });
    }

    const totalAmount = calculateAmount(parseFloat(booking.hourly_rate), start, end);

    const updateResult = await client.query(
      `UPDATE bookings
       SET end_time = $1, total_amount = $2, booking_status = 'completed'
       WHERE id = $3
       RETURNING *`,
      [end.toISOString(), totalAmount, bookingId]
    );

    return updateResult.rows[0];
  });
}

// ─────────────────────────────────────────────
// 3. CANCEL BOOKING (by user)
// ─────────────────────────────────────────────
async function cancelBooking(bookingId, userId) {
  const result = await pool.query(
    `UPDATE bookings
     SET booking_status = 'cancelled', cancelled_by = 'user'
     WHERE id = $1 AND user_id = $2 AND booking_status = 'confirmed'
     RETURNING *`,
    [bookingId, userId]
  );

  if (result.rows.length === 0) {
    throw Object.assign(
      new Error('Booking not found or cannot be cancelled.'),
      { statusCode: 404 }
    );
  }

  return result.rows[0];
}

// ─────────────────────────────────────────────
// 4. CANCEL BOOKING (by owner)
// Owner must own the parking space of the booking
// ─────────────────────────────────────────────
async function ownerCancelBooking(bookingId, ownerId) {
  return withTransaction(async (client) => {
    // Verify the owner owns the parking space
    const bookingResult = await client.query(
      `SELECT b.*, ps.owner_id
       FROM bookings b
       JOIN parking_spaces ps ON b.parking_id = ps.id
       WHERE b.id = $1
       FOR UPDATE OF b`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    }

    const booking = bookingResult.rows[0];

    if (booking.owner_id !== ownerId) {
      throw Object.assign(
        new Error('You are not authorized to cancel this booking.'),
        { statusCode: 403 }
      );
    }

    if (booking.booking_status !== 'confirmed') {
      throw Object.assign(
        new Error(`Cannot cancel a booking with status "${booking.booking_status}".`),
        { statusCode: 400 }
      );
    }

    const updateResult = await client.query(
      `UPDATE bookings
       SET booking_status = 'cancelled', cancelled_by = 'owner'
       WHERE id = $1
       RETURNING *`,
      [bookingId]
    );

    return updateResult.rows[0];
  });
}

// ─────────────────────────────────────────────
// 5. GET USER'S BOOKINGS
// ─────────────────────────────────────────────
async function getUserBookings(userId) {
  const result = await pool.query(
    `SELECT b.*,
            ps.place_name, ps.address,
            ST_Y(ps.location::geometry) AS latitude,
            ST_X(ps.location::geometry) AS longitude,
            ps.price_per_hour_car, ps.price_per_hour_bike, ps.price_per_hour_other,
            ps.is_active AS parking_is_active,
            sl.slot_number,
            u_owner.name AS owner_name, u_owner.phone AS owner_phone
     FROM bookings b
     JOIN parking_spaces ps ON b.parking_id = ps.id
     JOIN parking_slots sl ON b.slot_id = sl.id
     JOIN users u_owner ON ps.owner_id = u_owner.id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`,
    [userId]
  );

  return result.rows;
}

// ─────────────────────────────────────────────
// 6. GET OWNER'S BOOKINGS (on their spaces)
// Shows user details: name, phone, vehicle type
// ─────────────────────────────────────────────
async function getOwnerBookings(ownerId) {
  const result = await pool.query(
    `SELECT b.*,
            ps.place_name, ps.address,
            ST_Y(ps.location::geometry) AS latitude,
            ST_X(ps.location::geometry) AS longitude,
            sl.slot_number,
            u.name AS user_name, u.phone AS user_phone, u.email AS user_email
     FROM bookings b
     JOIN parking_spaces ps ON b.parking_id = ps.id
     JOIN parking_slots sl ON b.slot_id = sl.id
     JOIN users u ON b.user_id = u.id
     WHERE ps.owner_id = $1
     ORDER BY b.created_at DESC`,
    [ownerId]
  );

  return result.rows;
}

// ─────────────────────────────────────────────
// 7. GET SINGLE BOOKING BY ID
// ─────────────────────────────────────────────
async function getBookingById(bookingId, userId) {
  const result = await pool.query(
    `SELECT b.*,
            ps.place_name, ps.address,
            ST_Y(ps.location::geometry) AS latitude,
            ST_X(ps.location::geometry) AS longitude,
            ps.price_per_hour_car, ps.price_per_hour_bike, ps.price_per_hour_other,
            ps.is_active AS parking_is_active,
            sl.slot_number,
            u_owner.name AS owner_name, u_owner.phone AS owner_phone
     FROM bookings b
     JOIN parking_spaces ps ON b.parking_id = ps.id
     JOIN parking_slots sl ON b.slot_id = sl.id
     JOIN users u_owner ON ps.owner_id = u_owner.id
     WHERE b.id = $1 AND (b.user_id = $2 OR ps.owner_id = $2)`,
    [bookingId, userId]
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
  }

  return result.rows[0];
}

module.exports = {
  createBooking,
  endBooking,
  cancelBooking,
  ownerCancelBooking,
  getUserBookings,
  getOwnerBookings,
  getBookingById,
};
