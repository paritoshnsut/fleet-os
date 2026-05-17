-- ============================================================
-- 002_fleet_alerts.sql
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE TABLE IF NOT EXISTS fleet_alerts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_key   text,                              -- dedup key (e.g. "live-1748449234")
  bus_id       text,
  route_no     text,
  driver_name  text,
  type         text,
  message      text        NOT NULL,
  severity     text        NOT NULL DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  status       text        NOT NULL DEFAULT 'new',     -- 'new' | 'acknowledged' | 'in_progress' | 'resolved'
  timeline     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operator_id, source_key)
);

ALTER TABLE fleet_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators_alerts" ON fleet_alerts;
CREATE POLICY "operators_alerts"
  ON fleet_alerts FOR ALL
  USING      (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);
