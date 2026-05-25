-- Client Analysis Portal: session management for external clients
CREATE TABLE IF NOT EXISTS client_sessions (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id    uuid         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_name    text         NOT NULL,
  client_email   text,
  token          text         UNIQUE NOT NULL,
  status         text         NOT NULL DEFAULT 'pending',  -- pending | active | completed
  conversation   jsonb        NOT NULL DEFAULT '[]',
  results        jsonb        NOT NULL DEFAULT '{}',
  created_at     timestamptz  NOT NULL DEFAULT now(),
  expires_at     timestamptz  NOT NULL DEFAULT (now() + interval '30 days'),
  last_active_at timestamptz
);

ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;

-- Operators fully manage their own sessions
DROP POLICY IF EXISTS "operator_manage_sessions" ON client_sessions;
CREATE POLICY "operator_manage_sessions" ON client_sessions
  FOR ALL
  USING  (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);

-- Anyone may read a session by token (token IS the credential)
DROP POLICY IF EXISTS "public_token_read" ON client_sessions;
CREATE POLICY "public_token_read" ON client_sessions
  FOR SELECT USING (true);

-- Anyone may update conversation / results (client writes without auth)
DROP POLICY IF EXISTS "public_session_update" ON client_sessions;
CREATE POLICY "public_session_update" ON client_sessions
  FOR UPDATE USING (true) WITH CHECK (true);
