-- Migration: Add Coinbase Commerce support for crypto payments
-- This enables crypto payments for performance fees as an alternative to Stripe

-- Table to track Coinbase Commerce charges
CREATE TABLE IF NOT EXISTS coinbase_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charge_id VARCHAR(255) UNIQUE NOT NULL,      -- Coinbase charge ID
    charge_code VARCHAR(50) NOT NULL,            -- Short code for reference
    user_id UUID NOT NULL REFERENCES users(id),
    amount_usd DECIMAL(12, 2) NOT NULL,          -- Amount in USD
    fee_ids UUID[] NOT NULL,                     -- Array of performance_fee IDs
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    hosted_url TEXT NOT NULL,                    -- Payment page URL
    expires_at TIMESTAMP WITH TIME ZONE,
    payment_network VARCHAR(50),                 -- e.g., 'ethereum', 'polygon', 'bitcoin'
    payment_transaction_id VARCHAR(255),         -- Blockchain transaction ID
    confirmed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_coinbase_charges_user_id ON coinbase_charges(user_id);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_coinbase_charges_status ON coinbase_charges(status);

-- Index for charge_code lookups (used in emails/receipts)
CREATE INDEX IF NOT EXISTS idx_coinbase_charges_code ON coinbase_charges(charge_code);

-- Add coinbase_charge_id column to performance_fees if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'performance_fees' AND column_name = 'coinbase_charge_id'
    ) THEN
        ALTER TABLE performance_fees ADD COLUMN coinbase_charge_id VARCHAR(255);
    END IF;
END $$;

-- Index for finding fees by Coinbase charge
CREATE INDEX IF NOT EXISTS idx_performance_fees_coinbase_charge
ON performance_fees(coinbase_charge_id)
WHERE coinbase_charge_id IS NOT NULL;

-- Comment for documentation
COMMENT ON TABLE coinbase_charges IS 'Tracks Coinbase Commerce charges for crypto performance fee payments';
COMMENT ON COLUMN coinbase_charges.charge_id IS 'Coinbase Commerce charge ID (unique identifier)';
COMMENT ON COLUMN coinbase_charges.charge_code IS 'Short alphanumeric code for customer reference';
COMMENT ON COLUMN coinbase_charges.fee_ids IS 'Array of performance_fee UUIDs included in this charge';
COMMENT ON COLUMN coinbase_charges.payment_network IS 'Blockchain network used for payment (ethereum, polygon, bitcoin, etc.)';
COMMENT ON COLUMN coinbase_charges.payment_transaction_id IS 'Blockchain transaction hash/ID';
