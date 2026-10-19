CREATE TABLE shiyan_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE shiyan_identities (
  channel TEXT NOT NULL CHECK(channel IN ('email', 'phone')),
  address TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES shiyan_users(id),
  verified_at INTEGER NOT NULL,
  PRIMARY KEY(channel, address),
  UNIQUE(user_id, channel)
);
--> statement-breakpoint
CREATE TABLE shiyan_auth_challenges (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  address TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  binding_hash TEXT NOT NULL,
  owner_id TEXT,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ready INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX shiyan_challenges_identity_idx ON shiyan_auth_challenges(identity_hash, created_at);
--> statement-breakpoint
CREATE TABLE shiyan_auth_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
