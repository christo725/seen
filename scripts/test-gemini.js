/**
 * Test script to verify Gemini API is working properly
 * Run with: GEMINI_API_KEY=your_key node scripts/test-gemini.js
 * Or set it in your shell before running
 */

const fs = require('fs');
const path = require('path');

// Try to load .env.local manually if it exists
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
    return true;
  }
  return false;
}

async function testGeminiAPI() {
  console.log('🔍 Testing Gemini API Configuration...\n');

  // Try to load .env.local
  const envLoaded = loadEnvFile();
  if (envLoaded) {
    console.log('✅ Loaded .env.local file');
  } else {
    console.log('⚠️  No .env.local file found - checking environment variables directly');
  }

  // Check if API key is configured
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not set in .env.local');
    console.log('\n📝 To fix this:');
    console.log('1. Create a .env.local file in the seen-app directory');
    console.log('2. Add: GEMINI_API_KEY=your_api_key_here');
    console.log('3. Get your API key from: https://makersuite.google.com/app/apikey');
    process.exit(1);
  }

  console.log('✅ GEMINI_API_KEY is configured');
  console.log(`   Key length: ${apiKey.length} characters`);
  console.log(`   Key prefix: ${apiKey.substring(0, 10)}...`);

  // Test the API with a simple request
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    console.log('\n🧪 Testing API connection with gemini-2.5-flash (with Google Search grounding)...');
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      tools: [{
        googleSearch: {}
      }]
    });
    
    console.log('📤 Sending test prompt...');
    const result = await model.generateContent('Say "Hello, Gemini API is working!" in exactly 5 words.');
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ API Response received:');
    console.log(`   "${text}"`);
    console.log('\n🎉 Gemini API is working correctly!');
    
    // Test with vision (optional - if you want to test image analysis)
    console.log('\n🌐 Google Search Grounding Enabled!');
    console.log('   Gemini can now search the web for fact verification');
    console.log('   This enables historical weather, news events, and real-time data verification');
    console.log('\n🖼️  Vision capabilities: gemini-2.5-flash supports vision + web search');
    
    return true;
  } catch (error) {
    console.error('\n❌ Gemini API Error:');
    console.error('   Error message:', error.message);
    console.error('   Error type:', error.constructor.name);
    
    if (error.message?.includes('API key')) {
      console.error('\n💡 This looks like an API key issue.');
      console.error('   - Check that your API key is valid');
      console.error('   - Verify it\'s enabled for the Gemini API');
      console.error('   - Make sure there are no extra spaces');
    } else if (error.message?.includes('model')) {
      console.error('\n💡 This looks like a model name issue.');
      console.error('   - The model "gemini-2.5-flash" may not be available yet');
      console.error('   - Try "gemini-1.5-flash" or "gemini-2.0-flash-lite" as fallback');
    } else if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
      console.error('\n💡 API quota or rate limit exceeded.');
      console.error('   - Wait a few minutes and try again');
      console.error('   - Check your API quota in Google AI Studio');
    }
    
    console.error('\nFull error details:', error);
    return false;
  }
}

// Run the test
testGeminiAPI()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

