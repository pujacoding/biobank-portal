-- ANIVORA VETERINARY BIOSPECIMEN MANAGEMENT MIGRATION
-- 04_veterinary_anivora.sql

-- 1. Create Animals master table
CREATE TABLE IF NOT EXISTS animals (
  animal_id VARCHAR(64) PRIMARY KEY,
  species VARCHAR(64) NOT NULL,
  breed VARCHAR(128),
  sex VARCHAR(32) NOT NULL,
  age INTEGER,
  date_of_birth VARCHAR(32),
  owner_custodian_id VARCHAR(128),
  veterinary_diagnosis TEXT,
  collection_facility VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add additive columns to samples
ALTER TABLE samples ADD COLUMN IF NOT EXISTS animal_id VARCHAR(64) REFERENCES animals(animal_id);
ALTER TABLE samples ADD COLUMN IF NOT EXISTS species VARCHAR(64);
ALTER TABLE samples ADD COLUMN IF NOT EXISTS breed VARCHAR(128);
ALTER TABLE samples ADD COLUMN IF NOT EXISTS owner_custodian_id VARCHAR(128);
ALTER TABLE samples ADD COLUMN IF NOT EXISTS collection_facility VARCHAR(255);

-- 3. Add additive columns to consent
ALTER TABLE consent ADD COLUMN IF NOT EXISTS animal_id VARCHAR(64);
ALTER TABLE consent ADD COLUMN IF NOT EXISTS owner_custodian_name VARCHAR(255);
ALTER TABLE consent ADD COLUMN IF NOT EXISTS ethics_permit_ref VARCHAR(128);
ALTER TABLE consent ADD COLUMN IF NOT EXISTS authorization_type VARCHAR(64) DEFAULT 'Owner Custodian Consent';

-- 4. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_samples_animal_id ON samples(animal_id);
CREATE INDEX IF NOT EXISTS idx_samples_species ON samples(species);
CREATE INDEX IF NOT EXISTS idx_animals_species ON animals(species);
CREATE INDEX IF NOT EXISTS idx_consent_animal_id ON consent(animal_id);
