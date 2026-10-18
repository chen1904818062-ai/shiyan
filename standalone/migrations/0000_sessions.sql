CREATE TABLE shiyan_sessions (
  token_hash TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX shiyan_sessions_expiry_idx ON shiyan_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE shiyan_login_attempts (
  source_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
