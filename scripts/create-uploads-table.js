#!/usr/bin/env node

const https = require('https')
const fs = require('fs')
const path = require('path')

// Load environment variables manually
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration')
  process.exit(1)
}

// Extract project reference from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

if (!projectRef) {
  console.error('❌ Could not extract project reference from URL')
  process.exit(1)
}

console.log('🔧 Creating uploads table directly...')
console.log('📍 Project:', projectRef)

// SQL to create the uploads table with safe IF NOT EXISTS checks
const createTableSQL = `
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create file type enum (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_type') THEN
        CREATE TYPE file_type AS ENUM ('image', 'video');
    END IF;
END$$;

-- Create location source enum (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_source') THEN
        CREATE TYPE location_source AS ENUM ('exif', 'user_location', 'manual');
    END IF;
END$$;

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

-- Create policies for uploads table (drop existing first)
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
`.trim()

// Try to execute SQL using Supabase REST API
function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sql: sql
    })

    const options = {
      hostname: `${projectRef}.supabase.co`,
      port: 443,
      path: '/rest/v1/rpc/sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Length': data.length
      }
    }

    const req = https.request(options, (res) => {
      let responseData = ''

      res.on('data', (chunk) => {
        responseData += chunk
      })

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseData)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.write(data)
    req.end()
  })
}

async function createTable() {
  try {
    console.log('🚀 Attempting to create uploads table...')
    const result = await executeSQL(createTableSQL)
    console.log('✅ Table creation successful!')
    console.log('📊 Response:', result)

    // Test the table
    console.log('')
    console.log('🧪 Testing new table...')
    const testScript = require('./test-connection.js')

  } catch (error) {
    console.error('❌ Failed to create table via API:', error.message)
    console.log('')
    console.log('📝 Manual Setup Required:')
    console.log('=====================================')
    console.log('')
    console.log('1. 🌐 Open your Supabase dashboard:')
    console.log(`   https://app.supabase.com/project/${projectRef}`)
    console.log('')
    console.log('2. 📝 Go to SQL Editor (left sidebar)')
    console.log('')
    console.log('3. 📋 Copy and paste the following SQL:')
    console.log('')
    console.log(createTableSQL)
    console.log('')
    console.log('4. ▶️  Click "Run" to execute the SQL')
    console.log('')
    console.log('5. 🔄 Refresh your app to test the connection')
  }
}

createTable()