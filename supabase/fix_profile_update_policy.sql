-- Fix profile update policy to ensure users can update their own profiles
-- This adds a WITH CHECK clause to the UPDATE policy

-- Drop existing update policy if it exists
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Ensure the trigger exists for updating updated_at timestamp
-- This should already exist from schema.sql, but we'll recreate it to be safe
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

