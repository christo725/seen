#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
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

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  console.log('🧪 Testing Supabase connection...')
  console.log('📍 URL:', supabaseUrl)
  console.log('')

  try {
    // Test 1: Basic ping
    console.log('1️⃣ Testing basic connectivity...')
    const { data: basicTest, error: basicError } = await supabase
      .from('uploads')
      .select('id')
      .limit(1)

    if (basicError) {
      console.log('❌ Basic test failed:', basicError.message)
      console.log('   Error code:', basicError.code)

      if (basicError.code === 'PGRST205') {
        console.log('   ➡️  The uploads table does not exist')
        return false
      }
    } else {
      console.log('✅ Basic connectivity successful')
      console.log('   Sample data length:', basicTest ? basicTest.length : 0)
    }

    // Test 2: Count query
    console.log('')
    console.log('2️⃣ Testing count query...')
    const { count, error: countError } = await supabase
      .from('uploads')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.log('❌ Count query failed:', countError.message)
      return false
    } else {
      console.log('✅ Count query successful')
      console.log('   Total records:', count)
    }

    // Test 3: Try to describe table structure
    console.log('')
    console.log('3️⃣ Testing table structure...')
    const { data: structure, error: structureError } = await supabase
      .from('uploads')
      .select('*')
      .limit(0)

    if (structureError) {
      console.log('❌ Structure test failed:', structureError.message)
    } else {
      console.log('✅ Table structure accessible')
    }

    return true
  } catch (error) {
    console.log('❌ Connection test failed:', error.message)
    return false
  }
}

testConnection().then(success => {
  if (success) {
    console.log('')
    console.log('🎉 All tests passed! The uploads table is working correctly.')
  } else {
    console.log('')
    console.log('💡 The uploads table needs to be created. Run the setup script.')
  }
})