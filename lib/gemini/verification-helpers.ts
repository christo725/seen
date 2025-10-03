/**
 * Helper functions for AI verification
 * These functions provide contextual data for verification
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

export interface SunriseSunsetData {
  sunrise: string
  sunset: string
  isDaytime: boolean
  error?: string
}

export interface WeatherData {
  description: string
  temperature: number
  conditions: string[]
  error?: string
}

/**
 * Get sunrise/sunset times for a location and date
 */
export async function getSunriseSunset(
  latitude: number,
  longitude: number,
  date: Date
): Promise<SunriseSunsetData> {
  try {
    const dateStr = date.toISOString().split('T')[0]
    const response = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&date=${dateStr}&formatted=0`
    )
    
    if (!response.ok) {
      throw new Error('Failed to fetch sunrise/sunset data')
    }

    const data = await response.json()
    
    if (data.status !== 'OK') {
      throw new Error('Invalid sunrise/sunset response')
    }

    const sunrise = new Date(data.results.sunrise)
    const sunset = new Date(data.results.sunset)

    // For local datetime strings, we need to compare the time portion only
    // Extract time components for comparison
    const captureTime = date.getHours() * 60 + date.getMinutes()
    const sunriseTime = sunrise.getUTCHours() * 60 + sunrise.getUTCMinutes()
    const sunsetTime = sunset.getUTCHours() * 60 + sunset.getUTCMinutes()

    // Account for day rollover in sunrise/sunset times
    let isDaytime
    if (sunsetTime > sunriseTime) {
      // Normal day (sunrise before sunset)
      isDaytime = captureTime >= sunriseTime && captureTime <= sunsetTime
    } else {
      // Day spans midnight (sunset after midnight)
      isDaytime = captureTime >= sunriseTime || captureTime <= sunsetTime
    }

    return {
      sunrise: sunrise.toISOString(),
      sunset: sunset.toISOString(),
      isDaytime
    }
  } catch (error) {
    console.error('Error fetching sunrise/sunset:', error)
    return {
      sunrise: '',
      sunset: '',
      isDaytime: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get weather data for a location and time
 * Using OpenWeatherMap API (requires API key)
 */
export async function getWeatherData(
  latitude: number,
  longitude: number,
  date?: Date
): Promise<WeatherData | null> {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
      console.log('OpenWeatherMap API key not configured')
      return null
    }

    // Note: For historical weather, we'd need a paid tier
    // For now, we'll get current weather as a reference
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch weather data')
    }

    const data = await response.json()

    return {
      description: data.weather[0]?.description || 'Unknown',
      temperature: data.main?.temp || 0,
      conditions: data.weather?.map((w: any) => w.main) || []
    }
  } catch (error) {
    console.error('Error fetching weather:', error)
    return null
  }
}

/**
 * Get reverse geocoding data (address from coordinates)
 */
export async function getReverseGeocode(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!mapboxToken) {
      return null
    }

    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxToken}`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch geocoding data')
    }

    const data = await response.json()
    return data.features?.[0]?.place_name || null
  } catch (error) {
    console.error('Error with reverse geocoding:', error)
    return null
  }
}

/**
 * Fetch and convert image to base64 for Gemini Vision API
 */
export async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error('Failed to fetch image')
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return buffer.toString('base64')
  } catch (error) {
    console.error('Error fetching image:', error)
    return null
  }
}

/**
 * Upload video to Gemini File API and return file URI
 * Uses optimized settings for speed (0.5 FPS frame sampling)
 */
export async function uploadVideoToGemini(videoUrl: string, mimeType: string = 'video/mp4'): Promise<string> {
  const fs = await import('fs')
  const path = await import('path')
  const os = await import('os')
  const { GoogleAIFileManager } = await import('@google/generative-ai/server')
  
  console.log(`📤 Uploading video to Gemini File API...`)
  console.log(`   URL: ${videoUrl}`)
  console.log(`   MIME type: ${mimeType}`)
  
  // Fetch video from Supabase storage
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch video from storage: ${response.status} ${response.statusText}`)
  }
  
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2)
  
  console.log(`   Video size: ${fileSizeMB} MB`)
  
  // Create temporary file
  const fileExtension = mimeType.split('/')[1] || 'mp4'
  const tempFilePath = path.join(os.tmpdir(), `gemini-video-${Date.now()}.${fileExtension}`)
  
  try {
    // Write buffer to temporary file
    fs.writeFileSync(tempFilePath, buffer)
    console.log(`   Wrote to temp file: ${tempFilePath}`)
    
    // Upload to Gemini File API
    const { GoogleAIFileManager } = await import('@google/generative-ai/server')
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: mimeType,
      displayName: `verification-video-${Date.now()}`
    })
    
    console.log(`   ✅ Video uploaded successfully: ${uploadResponse.file.name}`)
    console.log(`   File URI: ${uploadResponse.file.uri}`)
    console.log(`   File state: ${uploadResponse.file.state}`)
    
    // Wait for file to be processed and become ACTIVE
    let file = uploadResponse.file
    const maxWaitTime = 30000 // 30 seconds max
    const startTime = Date.now()
    
    while (file.state === 'PROCESSING') {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error('Video processing timeout - file did not become active within 30 seconds')
      }
      
      console.log(`   ⏳ Waiting for file to be processed... (${file.state})`)
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      
      // Check file status
      file = await fileManager.getFile(uploadResponse.file.name)
    }
    
    if (file.state !== 'ACTIVE') {
      throw new Error(`Video file failed to process. State: ${file.state}`)
    }
    
    console.log(`   ✅ Video file is now ACTIVE and ready for analysis`)
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFilePath)
      console.log(`   🗑️ Cleaned up temp file`)
    } catch (cleanupError) {
      console.warn(`   ⚠️ Could not delete temp file: ${cleanupError}`)
    }
    
    return file.uri
  } catch (uploadError) {
    // Clean up temp file on error
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath)
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    console.error('❌ Gemini File API error:', uploadError)
    throw new Error(`Gemini File API upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`)
  }
}

/**
 * Delete a file from Gemini File API after analysis
 */
export async function deleteGeminiFile(fileUri: string): Promise<void> {
  try {
    const { GoogleAIFileManager } = await import('@google/generative-ai/server')
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)

    // Extract file name from URI (format: files/filename)
    const fileName = fileUri.split('/').pop()
    if (fileName) {
      await fileManager.deleteFile(fileName)
      console.log(`Deleted Gemini file: ${fileName}`)
    }
  } catch (error) {
    console.error('Error deleting Gemini file:', error)
    // Don't throw - cleanup errors shouldn't break verification
  }
}

