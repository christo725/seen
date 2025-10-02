#!/usr/bin/env node

/**
 * Check recent verification results to debug issues
 */

const fs = require('fs')
const path = require('path')

// Load .env.local
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
      }
    })
  }
}

loadEnvFile()

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkRecentVerifications() {
  console.log('Checking recent verification results...\n')

  const { data: uploads, error } = await supabase
    .from('uploads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching uploads:', error)
    process.exit(1)
  }

  uploads.forEach((upload, index) => {
    console.log(`\n========== Upload ${index + 1} ==========`)
    console.log(`ID: ${upload.id}`)
    console.log(`Created: ${new Date(upload.created_at).toLocaleString()}`)
    console.log(`File Type: ${upload.file_type}`)
    console.log(`Description: ${upload.description || '(none)'}`)
    console.log(`Location: ${upload.latitude}, ${upload.longitude}`)
    console.log(`Capture Date: ${upload.capture_date ? new Date(upload.capture_date).toLocaleString() : '(none)'}`)
    console.log(`\nVerification Status: ${upload.verification_status || 'null'}`)
    console.log(`AI Verified: ${upload.ai_verified}`)
    console.log(`\nVerification Result:`)
    console.log(upload.ai_verification_result || '(pending)')
    console.log('=====================================')
  })

  console.log(`\n\nTotal uploads checked: ${uploads.length}`)
  
  // Count by status
  const pending = uploads.filter(u => u.ai_verification_result === null).length
  const verified = uploads.filter(u => u.verification_status === 'verified').length
  const potentialIssues = uploads.filter(u => u.verification_status === 'potential_issues').length
  const unverified = uploads.filter(u => u.verification_status === 'unverified').length
  const failed = uploads.filter(u => u.ai_verification_result && u.ai_verification_result.includes('Verification failed')).length

  console.log(`\nStatus Summary:`)
  console.log(`- Pending: ${pending}`)
  console.log(`- Verified: ${verified}`)
  console.log(`- Potential Issues: ${potentialIssues}`)
  console.log(`- Unverified: ${unverified}`)
  console.log(`- Failed/Errors: ${failed}`)
}

checkRecentVerifications().catch(console.error)

