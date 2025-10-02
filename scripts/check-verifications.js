/**
 * Check verification status of uploads in the database
 * This helps diagnose if the verification API is being called properly
 * 
 * Run with: node scripts/check-verifications.js
 */

const fs = require('fs');
const path = require('path');

// Load .env.local
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  }
}

loadEnvFile();

async function checkVerifications() {
  console.log('🔍 Checking upload verification status...\n');

  const { createClient } = require('@supabase/supabase-js');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not configured');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all uploads
  const { data: uploads, error } = await supabase
    .from('uploads')
    .select('id, description, ai_verification_result, verification_status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error fetching uploads:', error);
    process.exit(1);
  }

  if (!uploads || uploads.length === 0) {
    console.log('📭 No uploads found in database');
    console.log('\n💡 Upload some media to test the verification system');
    return;
  }

  console.log(`📊 Found ${uploads.length} recent uploads:\n`);

  uploads.forEach((upload, index) => {
    const date = new Date(upload.created_at).toLocaleString();
    console.log(`${index + 1}. ${upload.description.substring(0, 50)}...`);
    console.log(`   Created: ${date}`);
    console.log(`   ID: ${upload.id}`);
    
    if (upload.ai_verification_result === null) {
      console.log(`   Status: ⏳ Verification Pending (not verified yet)`);
    } else {
      const statusEmoji = {
        'verified': '✅',
        'potential_issues': '⚠️',
        'unverified': '❌'
      }[upload.verification_status] || '❓';
      
      console.log(`   Status: ${statusEmoji} ${upload.verification_status}`);
      console.log(`   Result: ${upload.ai_verification_result.substring(0, 100)}...`);
    }
    console.log('');
  });

  // Count statuses
  const pending = uploads.filter(u => u.ai_verification_result === null).length;
  const verified = uploads.filter(u => u.verification_status === 'verified').length;
  const issues = uploads.filter(u => u.verification_status === 'potential_issues').length;
  const unverified = uploads.filter(u => u.verification_status === 'unverified' && u.ai_verification_result !== null).length;

  console.log('📈 Summary:');
  console.log(`   ⏳ Pending: ${pending}`);
  console.log(`   ✅ Verified: ${verified}`);
  console.log(`   ⚠️  Potential Issues: ${issues}`);
  console.log(`   ❌ Unverified: ${unverified}`);

  if (pending > 0) {
    console.log('\n💡 Tips for pending verifications:');
    console.log('   - Check your Next.js server console for errors');
    console.log('   - Verification runs asynchronously in the background');
    console.log('   - You can manually trigger verification with:');
    console.log('     curl -X GET http://localhost:3000/api/verify');
  }
}

checkVerifications()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

