#!/usr/bin/env node

console.log('🔧 Supabase Database Setup Instructions')
console.log('=====================================')
console.log('')
console.log('The uploads table is missing from your Supabase database.')
console.log('Please follow these steps to create it:')
console.log('')
console.log('1. 🌐 Open your Supabase dashboard:')
console.log('   https://app.supabase.com/project/rcxprvreaxrzfmumwtsv')
console.log('')
console.log('2. 📝 Go to SQL Editor (left sidebar)')
console.log('')
console.log('3. 📋 Copy and paste the following SQL:')
console.log('')

const createTableSQL = `-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create file type enum (if not exists)
DO $$ BEGIN
    CREATE TYPE file_type AS ENUM ('image', 'video');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create location source enum (if not exists)
DO $$ BEGIN
    CREATE TYPE location_source AS ENUM ('exif', 'user_location', 'manual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create uploads table
CREATE TABLE IF NOT EXISTS uploads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
    file_url TEXT NOT NULL,
    file_type file_type NOT NULL,
    description TEXT NOT NULL CHECK (char_length(description) <= 100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_source location_source DEFAULT 'user_location',
    ai_verified BOOLEAN DEFAULT FALSE,
    ai_verification_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS uploads_user_id_idx ON uploads(user_id);
CREATE INDEX IF NOT EXISTS uploads_created_at_idx ON uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_location_idx ON uploads(latitude, longitude) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS uploads_deleted_at_idx ON uploads(deleted_at) WHERE deleted_at IS NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

-- Create policies for uploads table
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
    USING (auth.uid() = user_id);`

console.log(createTableSQL)
console.log('')
console.log('4. ▶️  Click "Run" to execute the SQL')
console.log('')
console.log('5. 🔄 Refresh your app to test the connection')
console.log('')
console.log('This will create the uploads table with all necessary indexes and security policies.')
console.log('')

// Test current connection
const { createClient } = require('@supabase/supabase-js')

// Load environment variables manually since we're in scripts folder
const fs = require('fs')
const path = require('path')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  const envContent = fs.readFileSync(envPath, 'utf8')

  const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]
  const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]

  if (supabaseUrl && supabaseKey) {
    console.log('🧪 Testing current database connection...')

    const supabase = createClient(supabaseUrl, supabaseKey)

    supabase
      .from('uploads')
      .select('count', { count: 'exact', head: true })
      .then(({ data, error }) => {
        if (error) {
          if (error.code === 'PGRST205') {
            console.log('❌ Confirmed: uploads table does not exist')
          } else {
            console.log('❌ Connection error:', error.message)
          }
        } else {
          console.log('✅ uploads table exists! Record count:', data)
        }
      })
      .catch(err => {
        console.log('❌ Connection failed:', err.message)
      })
  }
} catch (error) {
  console.log('⚠️  Could not test connection automatically')
}