-- ============================================================
-- 001_fleet_onboarding.sql
-- Run once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Extend profiles with onboarding state and fleet config
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name        text,
  ADD COLUMN IF NOT EXISTS depot_city          text,
  ADD COLUMN IF NOT EXISTS contract_type       text         NOT NULL DEFAULT 'gcc';
  -- contract_type: 'gcc' | 'private' | 'both'

-- 2. Bus registry (one row per physical bus)
CREATE TABLE IF NOT EXISTS fleet_buses (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bus_number    text        NOT NULL,
  license_plate text,
  seats         int         NOT NULL DEFAULT 36,
  fuel_type     text        NOT NULL DEFAULT 'Electric',   -- 'Electric' | 'CNG'
  battery_type  text,                                      -- '3 Batt' | '4 Batt' (null for CNG)
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. Driver registry (one row per driver)
CREATE TABLE IF NOT EXISTS fleet_drivers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  phone          text,
  license_number text,
  experience_yrs int         NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 4. Row-level security — operators only see their own records
ALTER TABLE fleet_buses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators_buses"   ON fleet_buses;
DROP POLICY IF EXISTS "operators_drivers" ON fleet_drivers;

CREATE POLICY "operators_buses"
  ON fleet_buses FOR ALL
  USING      (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);

CREATE POLICY "operators_drivers"
  ON fleet_drivers FOR ALL
  USING      (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);
