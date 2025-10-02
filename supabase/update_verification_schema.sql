-- Add verification_status column to uploads table
-- Possible values: 'unverified', 'verified', 'potential_issues'

ALTER TABLE uploads 
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'potential_issues'));

-- Add location_name column for storing address/place name (if not already exists)
ALTER TABLE uploads 
ADD COLUMN IF NOT EXISTS location_name TEXT;

-- Update existing records to set verification_status based on ai_verified
UPDATE uploads 
SET verification_status = CASE 
  WHEN ai_verified = true THEN 'verified'
  WHEN ai_verification_result IS NOT NULL THEN 'potential_issues'
  ELSE 'unverified'
END
WHERE verification_status = 'unverified';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS uploads_verification_status_idx ON uploads(verification_status) WHERE deleted_at IS NULL;

