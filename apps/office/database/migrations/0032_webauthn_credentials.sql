-- Alleen publieke WebAuthn-credentialdata. Biometrische data blijft altijd op het apparaat.
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  device_name TEXT NOT NULL,
  transports TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials(user_id, revoked_at);

ALTER TABLE user_sessions ADD COLUMN strong_auth_at TEXT;
ALTER TABLE user_sessions ADD COLUMN strong_auth_method TEXT;
ALTER TABLE user_sessions ADD COLUMN locked_at TEXT;
ALTER TABLE user_sessions ADD COLUMN last_activity_at TEXT;
