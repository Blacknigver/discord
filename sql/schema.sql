-- schema.sql
-- Invite & Ticket tracking database schema (generated July 7 2025)

-- === Invite-Tracking ===
CREATE TABLE IF NOT EXISTS guild_invites (
    guild_id     TEXT NOT NULL,
    invite_code  TEXT NOT NULL,
    uses         INTEGER NOT NULL DEFAULT 0,
    inviter_id   TEXT,
    PRIMARY KEY (guild_id, invite_code)
);

CREATE TABLE IF NOT EXISTS inviters (
    inviter_id  TEXT PRIMARY KEY,
    regular     INTEGER NOT NULL DEFAULT 0,
    fake        INTEGER NOT NULL DEFAULT 0,
    bonus       INTEGER NOT NULL DEFAULT 0,
    leaves      INTEGER NOT NULL DEFAULT 0
);

-- FIXED: Make fields nullable where appropriate to match invite tracking data structure
CREATE TABLE IF NOT EXISTS members (
    member_id     TEXT PRIMARY KEY,
    joined_at     TIMESTAMP,               -- Allow NULL for partial data
    left_at       TIMESTAMP,
    inviter_id    TEXT,                   -- Allow NULL for unknown inviters
    inviter_name  TEXT,                   -- Allow NULL for unknown inviter names
    invite_code   TEXT,                   -- Allow NULL for unknown invite codes
    is_alt        BOOLEAN NOT NULL DEFAULT FALSE,
    guild_id      TEXT                    -- Add guild_id to support multi-guild
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_members_inviter   ON members(inviter_id);
CREATE INDEX IF NOT EXISTS idx_members_guild     ON members(guild_id);
CREATE INDEX IF NOT EXISTS idx_invites_inviter   ON guild_invites(inviter_id);

-- === Account Listings System ===
CREATE TABLE IF NOT EXISTS account_listings (
    listing_id       SERIAL PRIMARY KEY,
    message_id       TEXT NOT NULL UNIQUE,
    channel_id       TEXT NOT NULL,
    seller_id        TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'available', -- 'available', 'sold', 'removed'
    price            TEXT NOT NULL,
    
    -- Basic listing fields
    description      TEXT NOT NULL,
    trophies         TEXT NOT NULL,
    p11              TEXT NOT NULL,
    tier_max         TEXT NOT NULL,
    
    -- Extended details
    rare_skins       TEXT NOT NULL,
    super_rare_skins TEXT NOT NULL,
    epic_skins       TEXT NOT NULL,
    mythic_skins     TEXT NOT NULL,
    legendary_skins  TEXT NOT NULL,
    titles           TEXT NOT NULL,
    hypercharges     TEXT NOT NULL,
    power_10s        TEXT NOT NULL,
    power_9s         TEXT NOT NULL,
    old_ranked_rank  TEXT NOT NULL,
    new_ranked_rank  TEXT NOT NULL,
    
    -- Images
    main_image       TEXT,              -- Main listing image URL
    secondary_image  TEXT,              -- Secondary image URL for more info
    
    -- Metadata
    ping_choice      TEXT NOT NULL,     -- 'everyone', 'here', 'none'
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    sold_at          TIMESTAMP,
    sold_by          TEXT               -- Staff member ID who marked as sold
);

-- === Ticket System ===
CREATE TABLE IF NOT EXISTS tickets (
    ticket_id      SERIAL PRIMARY KEY,
    channel_id     TEXT UNIQUE NOT NULL,
    user_id        TEXT NOT NULL,
    status         TEXT NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at      TIMESTAMP,
    last_activity  TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata       JSONB,
    listing_id     INTEGER REFERENCES account_listings(listing_id) ON DELETE CASCADE,  -- Link to account listing with cascade delete
    booster_image_url TEXT,            -- URL/attachment link of image uploaded by booster for boost completion proof
    boost_type     TEXT,               -- Type of boost (ranked, trophies, bulk)
    desired_rank   TEXT,               -- Desired rank for ranked boosts
    desired_trophies TEXT              -- Desired trophies for trophy boosts
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_listing ON tickets(listing_id);

-- === Account Listings Indexes ===
CREATE INDEX IF NOT EXISTS idx_listings_status ON account_listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON account_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_message ON account_listings(message_id);
CREATE INDEX IF NOT EXISTS idx_listings_created ON account_listings(created_at);

-- === House-keeping ===
-- You can run this file once (or every deploy) to ensure tables exist:
--   psql "$DATABASE_URL" -f schema.sql 

-- === Affiliate System ===
CREATE TABLE IF NOT EXISTS affiliate_links (
    user_id      TEXT PRIMARY KEY,
    invite_code  TEXT NOT NULL UNIQUE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    balance      NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- Earnings per completed order (for reporting / top-5 calculations)
CREATE TABLE IF NOT EXISTS affiliate_earnings (
    referrer_id   TEXT NOT NULL,
    referred_id   TEXT NOT NULL,
    earning_type  TEXT NOT NULL,   -- Ranked, Trophies, etc.
    amount        NUMERIC(10,2) NOT NULL,
    order_id      TEXT,            -- ticket/channel id or other identifier
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Withdrawal requests
CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
    withdrawal_id SERIAL PRIMARY KEY,
    user_id       TEXT NOT NULL,
    amount        NUMERIC(10,2) NOT NULL,
    method        TEXT NOT NULL,         -- PayPal | Crypto-<coin> | IBAN
    details       JSONB NOT NULL,        -- {email:"..."} or {wallet:"..."}
    status        TEXT NOT NULL DEFAULT 'pending',
    requested_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_referrals (
    referrer_id  TEXT NOT NULL,
    referred_id  TEXT NOT NULL PRIMARY KEY,
    invite_code  TEXT NOT NULL,
    joined_at    TIMESTAMP NOT NULL,
    FOREIGN KEY (referrer_id) REFERENCES affiliate_links(user_id)
); 

-- After affiliate_links create add alter
ALTER TABLE affiliate_links ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Migration: Update existing members table to allow NULLs and add guild_id
ALTER TABLE members ALTER COLUMN joined_at DROP NOT NULL;
ALTER TABLE members ALTER COLUMN inviter_id DROP NOT NULL;
ALTER TABLE members ALTER COLUMN inviter_name DROP NOT NULL;
ALTER TABLE members ALTER COLUMN invite_code DROP NOT NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS guild_id TEXT; 

-- Migration: Add listing_id to existing tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS listing_id INTEGER REFERENCES account_listings(listing_id) ON DELETE CASCADE;

-- Migration: Add booster image and boost information fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS booster_image_url TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS boost_type TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS desired_rank TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS desired_trophies TEXT; 

-- Migration: Add discount tracking fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_offer_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_message_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_expires_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_claimed BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0; 

-- Migration: Add completion auto-close tracking fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_auto_close_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_type TEXT; -- 'boost' or 'profile'
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_notified BOOLEAN DEFAULT FALSE;

-- Migration: Add auto-close reminder tracking fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reminder_message_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_completed BOOLEAN DEFAULT FALSE;
-- Migration: Add auto-close reminder flag fields (6h, 12h, 24h) to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reminder_6h BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reminder_12h BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reminder_24h BOOLEAN DEFAULT FALSE;

-- === Rate Limiting System ===
-- Track button interaction rate limits per user
CREATE TABLE IF NOT EXISTS user_rate_limits (
    user_id TEXT PRIMARY KEY,
    last_interaction_at TIMESTAMP NOT NULL DEFAULT NOW(),
    interaction_count INTEGER NOT NULL DEFAULT 0,
    timeout_level INTEGER NOT NULL DEFAULT 0,  -- 0=none, 1=15s, 2=30s, 3=60s, 4=60s+
    timeout_until TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for efficient rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user ON user_rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_timeout ON user_rate_limits(timeout_until); 

-- Table for tracking scheduled embeds
CREATE TABLE IF NOT EXISTS scheduled_embeds (
    id SERIAL PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    embed_type TEXT NOT NULL,
    last_sent_at TIMESTAMP DEFAULT NOW(),
    next_send_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for scheduled embeds
CREATE INDEX IF NOT EXISTS idx_scheduled_embeds_channel ON scheduled_embeds(channel_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_embeds_next_send ON scheduled_embeds(next_send_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_embeds_type ON scheduled_embeds(embed_type); 