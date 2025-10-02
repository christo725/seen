-- Migration: Make description optional in uploads table
-- Run this in your Supabase SQL Editor to update your existing database

-- Remove the NOT NULL constraint from description
-- We'll allow empty strings (default to empty string if null)
ALTER TABLE uploads 
ALTER COLUMN description SET DEFAULT '',
ALTER COLUMN description DROP NOT NULL;

-- Update the check constraint to allow empty strings but limit to 100 characters
ALTER TABLE uploads 
DROP CONSTRAINT IF EXISTS uploads_description_check;

ALTER TABLE uploads 
ADD CONSTRAINT uploads_description_check 
CHECK (char_length(description) <= 100);

-- Optional: Update any NULL descriptions to empty string
UPDATE uploads 
SET description = '' 
WHERE description IS NULL;

-- Add a comment to document the change
COMMENT ON COLUMN uploads.description IS 'Optional description of the upload (max 100 characters, defaults to empty string)';


