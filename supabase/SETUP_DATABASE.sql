-- ============================================
-- COMPLETE DATABASE SETUP FOR SEEN APP
-- ============================================
-- Run this entire file in Supabase SQL Editor
-- This will create all tables, policies, and triggers
-- ============================================

-- Step 1: Enable necessary extensions
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 2: Create profiles table
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Step 3: Create enums
-- ============================================
DO $$ BEGIN
    CREATE TYPE file_type AS ENUM ('image', 'video');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE location_source AS ENUM ('exif', 'user_location', 'manual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 4: Create uploads table
-- ============================================
CREATE TABLE IF NOT EXISTS uploads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type file_type NOT NULL,
    description TEXT NOT NULL CHECK (char_length(description) <= 100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_source location_source DEFAULT 'user_location',
    location_name TEXT,
    capture_date TIMESTAMP WITH TIME ZONE,
    ai_verified BOOLEAN DEFAULT FALSE,
    ai_verification_result TEXT,
    verification_status TEXT DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'potential_issues')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Step 5: Create indexes
-- ============================================
CREATE INDEX IF NOT EXISTS uploads_user_id_idx ON uploads(user_id);
CREATE INDEX IF NOT EXISTS uploads_created_at_idx ON uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_capture_date_idx ON uploads(capture_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS uploads_location_idx ON uploads(latitude, longitude) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS uploads_deleted_at_idx ON uploads(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS uploads_verification_status_idx ON uploads(verification_status) WHERE deleted_at IS NULL;

-- Step 6: Enable Row Level Security
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

-- Step 7: Create policies for profiles table
-- ============================================
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Step 8: Create policies for uploads table
-- ============================================
DROP POLICY IF EXISTS "Uploads are viewable by everyone" ON uploads;
CREATE POLICY "Uploads are viewable by everyone"
    ON uploads FOR SELECT
    USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can insert their own uploads" ON uploads;
CREATE POLICY "Users can insert their own uploads"
    ON uploads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own uploads" ON uploads;
CREATE POLICY "Users can update their own uploads"
    ON uploads FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can soft delete their own uploads" ON uploads;
CREATE POLICY "Users can soft delete their own uploads"
    ON uploads FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (deleted_at IS NOT NULL);

-- Step 9: Create function to handle new user creation
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create trigger for new user creation
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 11: Create function to update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 12: Create trigger for updating profiles updated_at
-- ============================================
DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Your database is now ready for the Seen app
-- Next steps:
-- 1. Go to Storage and create a bucket called "media"
-- 2. Make the bucket public (Settings > Public bucket: ON)
-- 3. You can now start using the app!
-- ============================================

