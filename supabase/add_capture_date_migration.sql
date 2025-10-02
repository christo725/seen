-- Migration: Add capture_date column to uploads table
-- Run this in your Supabase SQL Editor to update your existing database

-- Add the capture_date column
ALTER TABLE uploads 
ADD COLUMN IF NOT EXISTS capture_date TIMESTAMP WITH TIME ZONE;

-- Add index for capture_date for better query performance
CREATE INDEX IF NOT EXISTS uploads_capture_date_idx 
ON uploads(capture_date DESC) 
WHERE deleted_at IS NULL;

-- Optional: Add a comment to document the column
COMMENT ON COLUMN uploads.capture_date IS 'Original capture date/time extracted from media EXIF/metadata';

