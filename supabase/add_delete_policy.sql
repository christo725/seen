-- Add RLS policy to allow users to soft-delete their own uploads
-- Run this in your Supabase SQL Editor

-- Drop existing policy if it exists (in case it's incorrectly configured)
DROP POLICY IF EXISTS "Users can soft delete their own uploads" ON uploads;

-- Create a specific policy for soft deletes (setting deleted_at)
CREATE POLICY "Users can soft delete their own uploads"
ON uploads FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND deleted_at IS NULL)
WITH CHECK (auth.uid() = user_id AND deleted_at IS NOT NULL);

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'uploads' AND policyname LIKE '%delete%';

