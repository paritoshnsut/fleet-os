-- ============================================================
-- 003_fleet_defects.sql
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Add grounded state to fleet_buses
ALTER TABLE fleet_buses
  ADD COLUMN IF NOT EXISTS is_grounded     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grounded_reason text;

-- 2. Defect log table
CREATE TABLE IF NOT EXISTS fleet_defects (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id   uuid        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  bus_id        uuid        NOT NULL REFERENCES fleet_buses(id) ON DELETE CASCADE,
  defect_types  text[]      NOT NULL DEFAULT '{}',
  severity      text        NOT NULL DEFAULT 'minor',   -- 'minor' | 'critical'
  notes         text,
  status        text        NOT NULL DEFAULT 'active',  -- 'active' | 'resolved'
  is_grounded   boolean     NOT NULL DEFAULT false,
  reported_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

ALTER TABLE fleet_defects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators_defects" ON fleet_defects;
CREATE POLICY "operators_defects"
  ON fleet_defects FOR ALL
  USING      (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);
