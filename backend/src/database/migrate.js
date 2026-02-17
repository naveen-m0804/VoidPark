// =============================================
// ParkEase - Database Migration Script
// =============================================
// Run with: npm run db:migrate
// =============================================
const { pool, testConnection } = require('../config/database');

const migrationSQL = `
-- ================================================
-- DROP EXISTING TABLES (Clean Slate)
-- ================================================
-- DROP TABLE IF EXISTS bookings CASCADE;
-- DROP TABLE IF EXISTS parking_slots CASCADE;
-- DROP TABLE IF EXISTS parking_spaces CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- ================================================
-- Enable Extensions
-- ================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- 1. USERS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid  VARCHAR(128) UNIQUE NOT NULL,
  name          VARCHAR(255),
  phone         VARCHAR(20) NOT NULL, -- Make phone mandatory
  email         VARCHAR(255),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

-- ================================================
-- 2. PARKING SPACES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS parking_spaces (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_name           VARCHAR(255) NOT NULL,
  address              TEXT NOT NULL,
  location             GEOGRAPHY(Point, 4326) NOT NULL,
  
  -- Price & Capacity per vehicle type
  price_per_hour_car   NUMERIC(10, 2) DEFAULT 0,
  total_slots_car      INTEGER NOT NULL DEFAULT 0,

  price_per_hour_bike  NUMERIC(10, 2) DEFAULT 0,
  total_slots_bike     INTEGER NOT NULL DEFAULT 0,

  price_per_hour_other NUMERIC(10, 2) DEFAULT 0,
  total_slots_other    INTEGER NOT NULL DEFAULT 0,

  description          TEXT,
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_spaces_location ON parking_spaces USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_parking_spaces_place_name ON parking_spaces(place_name);
CREATE INDEX IF NOT EXISTS idx_parking_spaces_owner ON parking_spaces(owner_id);

-- ================================================
-- 3. PARKING SLOTS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS parking_slots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parking_id    UUID NOT NULL REFERENCES parking_spaces(id) ON DELETE CASCADE,
  slot_number   INTEGER NOT NULL,
  vehicle_type  VARCHAR(50) NOT NULL DEFAULT 'car', -- distinguish slot type
  is_active     BOOLEAN DEFAULT TRUE,
  UNIQUE(parking_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_parking_slots_parking ON parking_slots(parking_id);
CREATE INDEX IF NOT EXISTS idx_parking_slots_type ON parking_slots(vehicle_type);

-- ================================================
-- 4. BOOKINGS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parking_id      UUID NOT NULL REFERENCES parking_spaces(id) ON DELETE CASCADE,
  slot_id         UUID NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
  vehicle_type    VARCHAR(50) NOT NULL DEFAULT 'car',
  start_time      TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time        TIMESTAMP WITH TIME ZONE,
  hourly_rate     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(10, 2),
  booking_status  VARCHAR(30) DEFAULT 'confirmed',
  cancelled_by    VARCHAR(10),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_parking ON bookings(parking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(booking_status);

-- ================================================
-- 5. TRIGGER: auto-update updated_at
-- ================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_parking_spaces_updated_at ON parking_spaces;
CREATE TRIGGER set_parking_spaces_updated_at
  BEFORE UPDATE ON parking_spaces
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
`;

async function runMigration() {
  console.log('🚀 Starting ParkEase database migration...\n');

  try {
    await testConnection();
    console.log('\n📄 Running migration SQL...');
    await pool.query(migrationSQL);
    console.log('\n✅ Migration completed successfully!');
    console.log('   Tables reset: users, parking_spaces, parking_slots, bookings');
    console.log('   Schema updated with vehicle-specific slots.');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigration();
