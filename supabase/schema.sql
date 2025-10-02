-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create file type enum
CREATE TYPE file_type AS ENUM ('image', 'video');

-- Create location source enum
CREATE TYPE location_source AS ENUM ('exif', 'user_location', 'manual');

-- Create uploads table
CREATE TABLE uploads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type file_type NOT NULL,
    description TEXT NOT NULL CHECK (char_length(description) <= 100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_source location_source DEFAULT 'user_location',
    capture_date TIMESTAMP WITH TIME ZONE,
    ai_verified BOOLEAN DEFAULT FALSE,
    ai_verification_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better query performance
CREATE INDEX uploads_user_id_idx ON uploads(user_id);
CREATE INDEX uploads_created_at_idx ON uploads(created_at DESC);
CREATE INDEX uploads_capture_date_idx ON uploads(capture_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX uploads_location_idx ON uploads(latitude, longitude) WHERE deleted_at IS NULL;
CREATE INDEX uploads_deleted_at_idx ON uploads(deleted_at) WHERE deleted_at IS NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Create policies for uploads table
CREATE POLICY "Uploads are viewable by everyone"
    ON uploads FOR SELECT
    USING (deleted_at IS NULL);

CREATE POLICY "Users can insert their own uploads"
    ON uploads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own uploads"
    ON uploads FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can soft delete their own uploads"
    ON uploads FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (deleted_at IS NOT NULL);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating profiles updated_at
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();