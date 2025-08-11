-- schema.sql
-- Invite & Ticket tracking database schema (generated July 7 2025)

-- NOTE: This schema is compatible with Supabase (PostgreSQL). Run it in the
-- Supabase SQL Editor. All tables, indexes and constraints used by the bot
-- are defined below. If you re-run, IF NOT EXISTS guards keep it idempotent.

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

-- === PayPal IPN Data Storage ===
CREATE TABLE IF NOT EXISTS paypal_ipn_notifications (
    id               SERIAL PRIMARY KEY,
    txn_id           TEXT NOT NULL UNIQUE,        -- PayPal transaction ID
    ipn_track_id     TEXT NOT NULL,               -- PayPal IPN tracking ID
    txn_type         TEXT NOT NULL,               -- transaction type (send_money = Friends & Family)
    payment_status   TEXT NOT NULL,               -- Completed, Pending, etc.
    payment_date     TEXT NOT NULL,               -- PayPal formatted timestamp
    
    -- Receiver info (our account)
    receiver_email   TEXT NOT NULL,               -- Our PayPal email
    receiver_id      TEXT NOT NULL,               -- Our PayPal account ID
    
    -- Amount info
    mc_gross         DECIMAL(10,2) NOT NULL,      -- Gross amount received
    mc_fee           DECIMAL(10,2) NOT NULL,      -- PayPal fee (0.00 for F&F)
    mc_currency      TEXT NOT NULL,               -- Currency code
    
    -- Sender info
    payer_email      TEXT NOT NULL,               -- Sender's PayPal email
    payer_id         TEXT NOT NULL,               -- Sender's PayPal account ID
    first_name       TEXT NOT NULL,               -- Sender first name
    last_name        TEXT NOT NULL,               -- Sender last name
    payer_status     TEXT NOT NULL,               -- verified/unverified
    
    -- Transaction details
    memo             TEXT,                        -- Note/memo (should be empty for F&F)
    transaction_subject TEXT,                     -- Subject line
    payment_type     TEXT NOT NULL,               -- instant/echeck
    pending_reason   TEXT,                        -- Why payment is pending
    
    -- Fraud/Risk flags
    has_fraud_filters BOOLEAN NOT NULL DEFAULT FALSE, -- Any fraud_management_pending_filters_* present
    fraud_filter_details TEXT,                   -- Details of fraud filters if any
    
    -- Metadata
    received_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    processed        BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether this IPN was used for verification
    ticket_channel_id TEXT,                      -- Channel ID where this was used for verification
    
    -- Raw IPN data for debugging
    raw_ipn_data     JSONB                       -- Full IPN payload as JSON
);

-- === Account Listings Indexes ===
CREATE INDEX IF NOT EXISTS idx_listings_status ON account_listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON account_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_message ON account_listings(message_id);

-- === PayPal IPN Indexes ===
-- Basic index for lookups by txn_id
CREATE INDEX IF NOT EXISTS idx_ipn_txn_id ON paypal_ipn_notifications(txn_id);

-- Ensure no duplicate PayPal transactions can ever be stored (Supabase-safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_paypal_txn'
      AND conrelid = 'paypal_ipn_notifications'::regclass
  ) THEN
    ALTER TABLE paypal_ipn_notifications
      ADD CONSTRAINT unique_paypal_txn UNIQUE(txn_id);
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_ipn_names ON paypal_ipn_notifications(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_ipn_processed ON paypal_ipn_notifications(processed);
CREATE INDEX IF NOT EXISTS idx_ipn_received_at ON paypal_ipn_notifications(received_at);
CREATE INDEX IF NOT EXISTS idx_listings_created ON account_listings(created_at);

-- === PayPal AI Verifications ===
CREATE TABLE IF NOT EXISTS paypal_ai_verifications (
    id                SERIAL PRIMARY KEY,
    user_id           TEXT NOT NULL,               -- Discord user ID
    channel_id        TEXT NOT NULL,               -- Ticket channel ID
    txn_id            TEXT NOT NULL,               -- PayPal transaction ID from IPN
    screenshot_url    TEXT NOT NULL,               -- URL of the screenshot provided by user
    ipn_data          JSONB NOT NULL,              -- IPN verification result data
    ai_result         JSONB,                       -- OpenAI verification result
    status            TEXT NOT NULL DEFAULT 'processing', -- processing | approved | rejected
    final_status      TEXT,                        -- approved | rejected (final decision)
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMP,                   -- When AI verification completed
    verified_by       TEXT,                        -- Staff member who manually overrode (if any)
    notes             TEXT                         -- Additional notes for manual overrides
);

-- === PayPal AI Verification Indexes ===
CREATE INDEX IF NOT EXISTS idx_ai_verifications_user ON paypal_ai_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_txn ON paypal_ai_verifications(txn_id);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_status ON paypal_ai_verifications(status);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_created ON paypal_ai_verifications(created_at);

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

-- === Automated Crypto Payment System ===
-- Track crypto payments for automated verification
CREATE TABLE IF NOT EXISTS crypto_payments (
    id SERIAL PRIMARY KEY,
    ticket_channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    crypto_type TEXT NOT NULL CHECK (crypto_type IN ('bitcoin', 'litecoin', 'solana')),
    
    -- Amount information
    eur_amount DECIMAL(10,2) NOT NULL,           -- Original EUR amount
    crypto_amount DECIMAL(20,8) NOT NULL,        -- Expected crypto amount (up to 8 decimals)
    exchange_rate DECIMAL(20,8) NOT NULL,        -- EUR to crypto rate when calculated
    
    -- Our receiving addresses
    our_address TEXT NOT NULL,                   -- Address we expect to receive payment to
    
    -- Transaction details (filled when user submits form)
    transaction_id TEXT UNIQUE,                  -- UNIQUE globally - prevents transaction reuse
    sender_address TEXT,                         -- Address user sent from
    actual_amount DECIMAL(20,8),                 -- Actual amount received
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirming', 'confirmed', 'failed', 'timeout', 'support_requested')),
    confirmation_count INTEGER DEFAULT 0,
    confirmation_target INTEGER NOT NULL,        -- Required confirmations for this crypto
    
    -- Timing
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMP,                      -- When user submitted payment completed form
    confirmed_at TIMESTAMP,                      -- When payment was fully confirmed
    timeout_at TIMESTAMP NOT NULL,               -- When payment times out (created_at + 30 minutes)
    
    -- Support system
    support_message_id TEXT,                     -- Message ID of support request embed
    support_resolved BOOLEAN DEFAULT FALSE
);

-- Track user rate limiting for payment verification attempts
CREATE TABLE IF NOT EXISTS crypto_rate_limits (
    user_id TEXT PRIMARY KEY,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMP NOT NULL DEFAULT NOW(),
    last_attempt TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Track pending confirmation checks (for the 5-minute checking system)
CREATE TABLE IF NOT EXISTS crypto_confirmations (
    payment_id INTEGER PRIMARY KEY REFERENCES crypto_payments(id) ON DELETE CASCADE,
    next_check_at TIMESTAMP NOT NULL DEFAULT NOW(),
    check_count INTEGER NOT NULL DEFAULT 0,
    max_checks INTEGER NOT NULL DEFAULT 12,      -- 12 checks = 1 hour (every 5 minutes)
    last_checked_at TIMESTAMP,
    api_data JSONB                               -- Store latest API response for debugging
);

-- Crypto payment indexes for performance
CREATE INDEX IF NOT EXISTS idx_crypto_payments_ticket ON crypto_payments(ticket_channel_id);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_user ON crypto_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_status ON crypto_payments(status);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_txid ON crypto_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_timeout ON crypto_payments(timeout_at);
CREATE INDEX IF NOT EXISTS idx_crypto_rate_limits_user ON crypto_rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_confirmations_next_check ON crypto_confirmations(next_check_at); 