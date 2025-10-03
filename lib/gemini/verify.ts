import { GoogleGenerativeAI } from '@google/generative-ai'
import { 
  getSunriseSunset, 
  getWeatherData, 
  getReverseGeocode, 
  fetchImageAsBase64,
  uploadVideoToGemini,
  deleteGeminiFile
} from './verification-helpers'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export interface VerificationResult {
  status: 'unverified' | 'verified' | 'potential_issues'
  verified: boolean
  result: string
  issues?: string[]
  verificationFactors?: string[]
}

export async function verifyContent(
  description: string,
  imageUrl: string,
  fileType: 'image' | 'video',
  latitude?: number | null,
  longitude?: number | null,
  captureDate?: string | null
): Promise<VerificationResult> {
  // Declare videoUri outside try block for cleanup access in catch
  let videoUri: string | null = null
  
  try {
    const issues: string[] = []
    const verificationFactors: string[] = []
    
    // Gather contextual data
    let sunriseSunsetData: any = null
    let weatherData: any = null
    let locationName: string | null = null
    
    if (latitude && longitude && captureDate) {
      const date = new Date(captureDate)
      
      // Get sunrise/sunset data
      sunriseSunsetData = await getSunriseSunset(latitude, longitude, date)
      
      // Get weather data
      weatherData = await getWeatherData(latitude, longitude, date)
      
      // Get location name
      locationName = await getReverseGeocode(latitude, longitude)
    }

    // Check for daylight/darkness mismatch
    if (sunriseSunsetData && !sunriseSunsetData.error) {
      const descLower = description ? description.toLowerCase() : ''
      const mentionsDaytime = descLower.includes('sunny') || descLower.includes('daylight') || 
                              descLower.includes('afternoon') || descLower.includes('morning') ||
                              descLower.includes('day')
      const mentionsNighttime = descLower.includes('night') || descLower.includes('dark') || 
                                descLower.includes('evening') || descLower.includes('midnight')
      
      // Only flag description-based mismatches if there is a description
      if (description) {
        if (mentionsDaytime && !sunriseSunsetData.isDaytime) {
          issues.push(`Description mentions daytime, but timestamp (${new Date(captureDate!).toLocaleTimeString()}) indicates it was after sunset at this location`)
        }
        
        if (mentionsNighttime && sunriseSunsetData.isDaytime) {
          issues.push(`Description mentions nighttime, but timestamp (${new Date(captureDate!).toLocaleTimeString()}) indicates it was during daylight hours`)
        }
      }

      // Always provide this as a verification factor for Gemini to check against image
      verificationFactors.push(
        `Expected lighting at ${new Date(captureDate!).toLocaleTimeString()}: ${sunriseSunsetData.isDaytime ? 'Daytime/Daylight' : 'Nighttime/Dark'} (Sunrise: ${new Date(sunriseSunsetData.sunrise).toLocaleTimeString()}, Sunset: ${new Date(sunriseSunsetData.sunset).toLocaleTimeString()})`
      )
    }

    // Determine video MIME type from file extension
    const fileExtension = imageUrl.split('.').pop()?.toLowerCase()
    const videoMimeTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'm4v': 'video/mp4',
      'avi': 'video/x-msvideo',
      'webm': 'video/webm'
    }
    const videoMimeType = fileExtension ? videoMimeTypes[fileExtension] || 'video/mp4' : 'video/mp4'

    // Use Gemini Vision to analyze media (image or video)
    let imageBase64: string | null = null
    
    if (fileType === 'image') {
      imageBase64 = await fetchImageAsBase64(imageUrl)
      if (!imageBase64) {
        throw new Error(`Failed to fetch image from URL: ${imageUrl}`)
      }
    } else if (fileType === 'video') {
      // Upload video to Gemini (throws error if upload fails)
      videoUri = await uploadVideoToGemini(imageUrl, videoMimeType)
    }

    // Use gemini-2.5-flash for vision + text analysis with Google Search grounding
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash'
    })

    const contextInfo = `
TRUSTED SOURCE DATA (Use this for PRIMARY verification):
==========================================
📍 LOCATION DATA (Geocoding API):
- Location Name: ${locationName || 'Unknown'}
- Coordinates: ${latitude && longitude ? `${latitude}, ${longitude}` : 'Not provided'}

📅 TIMESTAMP DATA:
- Capture Date/Time: ${captureDate ? new Date(captureDate).toLocaleString() : 'Not provided'}

${sunriseSunsetData && !sunriseSunsetData.error ? `☀️ ASTRONOMICAL DATA (Sunrise-Sunset.org API):
- Lighting at Capture Time: ${sunriseSunsetData.isDaytime ? 'Daytime/Daylight' : 'Nighttime/Dark'}
- Sunrise Time: ${new Date(sunriseSunsetData.sunrise).toLocaleTimeString()}
- Sunset Time: ${new Date(sunriseSunsetData.sunset).toLocaleTimeString()}
- Authority: Calculated astronomical data - DEFINITIVE for time-of-day verification` : ''}

${weatherData ? `🌤️ WEATHER DATA (OpenWeatherMap API):
- Conditions: ${weatherData.description}
- Temperature: ${weatherData.temperature}°C
- Weather Type: ${weatherData.conditions.join(', ')}
- Authority: Meteorological data - DEFINITIVE for weather verification` : ''}

${issues.length > 0 ? `⚠️ PRE-VERIFICATION ALERTS:
${issues.map(i => '- ' + i).join('\n')}` : ''}
    `.trim()

    const hasDescription = description && description.trim().length > 0
    const descriptionNote = hasDescription 
      ? `User's Description: "${description}"`
      : `⚠️ NO DESCRIPTION PROVIDED - You must analyze the media itself and verify against available contextual data.`
    
    const mediaTypeNote = fileType === 'video' 
      ? `\n\n📹 VIDEO ANALYSIS: This is a video file. Analyze key frames (sampled at 0.5 FPS) to verify claims about events, actions, locations, lighting conditions, and consistency with provided metadata. Look for patterns across frames and any inconsistencies.`
      : ''

    const prompt = `You are an AUTONOMOUS FACT-CHECKING AI with expertise in media verification, logic, science, geography, and current events.

${descriptionNote}${mediaTypeNote}

${contextInfo}

CRITICAL: VERIFICATION HIERARCHY WITH GOOGLE SEARCH
====================================================
You have access to Google Search for fact-checking. Use it strategically!

🌐 GOOGLE SEARCH CAPABILITY (Use for ENHANCED verification):
- You can search the web for real-time and historical information
- Use this to verify claims that go beyond the provided API data
- ESPECIALLY important for: historical weather, news events, public incidents, disasters
- Search queries should be specific: "weather [location] [date]", "[event] [location] [date]"
- PRIORITIZE MAINSTREAM TRUSTED SOURCES: news outlets (BBC, Reuters, AP, CNN, local news), 
  government weather services (NOAA, Met Office), official reports
- CITE YOUR SOURCES: Include URLs and source names in your findings
- When searching, prefer: weather.com, wunderground.com, timeanddate.com for weather/time data

Your verification MUST follow this priority order:

LEVEL 1 (PRIMARY): TEXT-BASED FACT-CHECKING AGAINST TRUSTED SOURCES
- This is your FIRST and MOST IMPORTANT verification layer
- Check ALL text claims against:
  a) PROVIDED API data (weather, astronomical, geographic) - use this first
  b) GOOGLE SEARCH (when API data is insufficient or for historical data)
- Weather claims → Weather API data FIRST, then Google Search for historical weather if needed
- Time-of-day claims → Astronomical data (sunrise/sunset times)
- Location claims → Geographic data (coordinates, place names)
- Date/time claims → Timestamp verification
- News events, disasters, public incidents → MUST use Google Search
- Historical claims → MUST use Google Search for verification
- This verification is DEFINITIVE - trusted sources are authoritative

LEVEL 2 (SECONDARY): IMAGE ANALYSIS
- Use image analysis to SUPPORT or provide ADDITIONAL CONTEXT to text-based findings
- Check if visual elements align with verified facts from Level 1
- Identify visual inconsistencies that may contradict Level 1 findings
- Image analysis should COMPLEMENT, not replace, text-based verification

YOUR MISSION:
1. IDENTIFY all factual claims in the text/description
2. VERIFY claims against trusted data sources (weather, astronomical, geographic)
3. DOCUMENT findings from trusted sources (this is your primary evidence)
4. ANALYZE image to support or contradict text-based findings
5. SYNTHESIZE both levels into final assessment

VERIFICATION PROCESS:
${hasDescription ? `
STEP 1 - TEXT FACT-CHECKING (PRIMARY):
- Extract all verifiable claims from description
- Check provided API data first (weather, astronomical, geographic)
- IF API data is current but you need historical data → USE GOOGLE SEARCH
- Weather claim? → Check API data, then search "weather [location] [exact date]"
- News event claim? → SEARCH "[event name] [location] [date]" and verify with news sources
- Historical incident? → SEARCH for authoritative sources (news, government reports)
- Time claim? → Check against sunrise/sunset data
- Location claim? → Verify coordinates and place name accuracy
${fileType === 'video' ? '- For videos: Verify claims about events, actions, and conditions shown across frames' : ''}
- DOCUMENT EXACT data from trusted sources WITH SOURCE CITATIONS

STEP 2 - ${fileType === 'video' ? 'VIDEO' : 'IMAGE'} ANALYSIS (SECONDARY):
${fileType === 'video' 
  ? `- What events/actions occur in the video across frames?
- Are there consistency issues or anomalies across frames?
- Does the video lighting match the expected time-of-day from astronomical data?
- Does the video match the timestamp and location data?
- Are there visual contradictions with verified facts?`
  : `- Does image support the verified facts from Step 1?
- Are there visual elements that contradict trusted source data?
- Does image lighting match astronomical predictions?
- Do visible weather conditions align with verified weather data?`}
` : `
STEP 1 - CONTEXTUAL VERIFICATION (PRIMARY):
- Check provided API data (sunrise/sunset, current weather, location)
- IF capture date is in the past → USE GOOGLE SEARCH for historical weather
- Search "weather [location] [exact date]" for historical verification
- Verify any visible events or incidents through web search
- Document findings WITH SOURCE CITATIONS

STEP 2 - ${fileType === 'video' ? 'VIDEO' : 'IMAGE'} ANALYSIS (SECONDARY):
${fileType === 'video'
  ? `- What does the video actually show across frames?
- Does it align with trusted source data?
- Are there contradictions with astronomical/weather data?
- Does location appear plausible given coordinates?
- Are there any anomalies or inconsistencies across frames?`
  : `- What does the image actually show?
- Does it align with trusted source data?
- Are there contradictions with astronomical/weather data?
- Does location appear plausible given coordinates?`}
`}

IMPORTANT: DISPLAY VERIFICATION RESULTS IN PRIORITY ORDER
===========================================================
When reporting your findings, ALWAYS present them as:
1. FIRST: Text-based verification against trusted sources (with specific data cited)
2. SECOND: Image analysis findings (in context of trusted data)

Example format:
"Weather claim verification: User claims 'sunny day'. Weather API shows 'clear sky, 22°C' at timestamp. ✓ VERIFIED against trusted source.
Image analysis: Visual confirms clear skies and bright sunlight, consistent with weather data."

TRUSTED SOURCES YOU HAVE ACCESS TO:
- Sunrise/Sunset API: Authoritative astronomical data (provided)
- Weather API: Current meteorological conditions (provided - use Google Search for historical)
- Geocoding API: Location name verification (provided)
- Timestamp: Exact date/time of capture (provided)
- Google Search: For historical data, news events, fact verification

WHEN TO USE GOOGLE SEARCH:
✓ Capture date is in the PAST (need historical weather)
✓ Claims about news events, disasters, public incidents
✓ Verifiable facts about specific dates/times/locations
✓ Weather data when provided API shows current conditions but capture date is old
✓ Any factual claim that needs authoritative verification

BE THOROUGH BUT FAIR:
- USE GOOGLE SEARCH for historical verification and news events
- Prioritize mainstream trusted sources (major news outlets, government agencies, weather services)
- ALWAYS cite your sources with URLs when you use web search
- Weather reports are MORE authoritative than visual weather assessment
- Astronomical data is DEFINITIVE for sunrise/sunset claims
- Minor subjective descriptions are okay ("beautiful", "amazing")
- Focus on FACTUAL discrepancies between claims and trusted sources

Respond with a JSON object:
{
  "status": "verified" | "potential_issues" | "unverified",
  "result": "Brief summary starting with text-based verification findings",
  "confidence": "high" | "medium" | "low",
  "analysis": "Detailed analysis with TEXT VERIFICATION FIRST, then image analysis",
  "claimsIdentified": ["List claims from text with [TEXT] or [VISUAL] prefix"],
  "verificationsPerformed": ["List with [API], [WEB SEARCH], or [IMAGE] prefix"],
  "textBasedFindings": ["Findings from APIs and web sources - MUST include source citations"],
  "webSearchResults": ["IMPORTANT: Include findings from Google Search with source URLs"],
  "sourcesUsed": ["List of URLs and source names used for verification"],
  "imageAnalysisFindings": ["Visual findings that support/contradict text verification"],
  "additionalIssues": ["Array of specific issues found"],
  "recommendedActions": ["If newsworthy, what additional verification is needed"]
}

Status guide:
- "verified": Text claims verified against trusted sources AND image supports findings
- "potential_issues": Discrepancies found between claims and trusted sources OR image contradicts data
- "unverified": Cannot verify claims or significant contradictions with trusted sources

CRITICAL: Respond ONLY with valid, well-formed JSON. Ensure:
- All strings are properly escaped (use \\" for quotes inside strings)
- No trailing commas in arrays or objects
- All brackets and braces are properly closed
- No line breaks inside string values (use \\n instead)

Respond with the JSON object only, no additional text before or after.`

    // Retry mechanism for JSON parsing failures
    const MAX_RETRIES = 3
    let parsed
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Gemini verification attempt ${attempt}/${MAX_RETRIES}`)
        
        // Call Gemini API
        let result
        if (imageBase64) {
          // Image analysis
          result = await model.generateContent([
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64
              }
            },
            prompt
          ])
        } else if (videoUri) {
          // Video analysis with optimized frame sampling (0.5 FPS for speed)
          result = await model.generateContent([
            {
              fileData: {
                fileUri: videoUri,
                mimeType: videoMimeType
              }
            },
            prompt
          ])
        } else {
          // Text-only analysis
          result = await model.generateContent(prompt)
        }

        const response = await result.response
        const text = response.text()

        // Parse the JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          console.error('No JSON found in Gemini response:', text)
          throw new Error('Gemini response did not contain valid JSON. Raw response: ' + text.substring(0, 200))
        }

        let rawJsonString = jsonMatch[0]
        
        try {
          parsed = JSON.parse(rawJsonString)
          console.log(`Successfully parsed JSON on attempt ${attempt}`)
          break // Success! Exit retry loop
        } catch (parseError) {
          console.error(`Attempt ${attempt}: Error parsing Gemini JSON:`, parseError)
          console.error('Raw JSON string (first 500 chars):', rawJsonString.substring(0, 500))
          
          // Try to fix common JSON issues
          let fixedJson = rawJsonString
            // Remove trailing commas before closing braces/brackets
            .replace(/,(\s*[}\]])/g, '$1')
            // Remove any markdown code block markers
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            // Fix newlines inside strings by replacing them with \n
            .replace(/"([^"]*\n[^"]*?)"/g, (match) => {
              return match.replace(/\n/g, '\\n')
            })
          
          try {
            parsed = JSON.parse(fixedJson)
            console.log(`Successfully parsed after automatic fixes on attempt ${attempt}`)
            break // Success! Exit retry loop
          } catch (secondError) {
            // If this is the last attempt, log full details
            if (attempt === MAX_RETRIES) {
              console.error('Full raw JSON response:', rawJsonString)
            }
            throw new Error(`Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. JSON excerpt: ${rawJsonString.substring(Math.max(0, 1700), 1850)}`)
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error during verification')
        console.error(`Attempt ${attempt} failed:`, lastError.message)
        
        // If this is the last attempt, throw the error
        if (attempt === MAX_RETRIES) {
          // Clean up video file from Gemini after all attempts
          if (videoUri) {
            deleteGeminiFile(videoUri).catch(err => 
              console.error('Failed to cleanup video file:', err)
            )
          }
          throw lastError
        }
        
        // Wait before retrying (exponential backoff: 1s, 2s, 4s)
        const waitTime = Math.pow(2, attempt - 1) * 1000
        console.log(`Waiting ${waitTime}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    
    // Clean up video file from Gemini after successful analysis
    if (videoUri) {
      deleteGeminiFile(videoUri).catch(err => 
        console.error('Failed to cleanup video file:', err)
      )
    }
    
    // If we somehow got here without parsed data, throw error
    if (!parsed) {
      throw lastError || new Error('Failed to get valid response from Gemini after all retries')
    }
    
    // Helper function to ensure array format
    const ensureArray = (value: any): any[] => {
      if (Array.isArray(value)) return value
      if (typeof value === 'string') return [value]
      return []
    }

    // Combine issues from automated checks and Gemini analysis
    const allIssues = [
      ...issues,
      ...ensureArray(parsed.additionalIssues)
    ]

    // Add verification details
    const allVerificationFactors = [
      ...verificationFactors,
      ...ensureArray(parsed.verificationsPerformed)
    ]

    // Build comprehensive result text with VERIFICATION HIERARCHY
    let resultText = parsed.result || parsed.analysis || 'Verification complete'
    
    // LEVEL 1: Text-based findings from trusted sources (PRIORITY)
    const textBasedFindings = ensureArray(parsed.textBasedFindings)
    if (textBasedFindings.length > 0) {
      resultText += `\n\n📊 LEVEL 1 - Trusted Source Verification:\n${textBasedFindings.map((f: string) => `✓ ${f}`).join('\n')}`
    }

    // Web Search Results (if used)
    const webSearchResults = ensureArray(parsed.webSearchResults)
    if (webSearchResults.length > 0) {
      resultText += `\n\n🌐 Web Search Findings:\n${webSearchResults.map((r: string) => `• ${r}`).join('\n')}`
    }

    // Sources Used (filter out raw URLs, keep only descriptive sources)
    const sourcesUsed = ensureArray(parsed.sourcesUsed)
    if (sourcesUsed.length > 0) {
      const descriptiveSources = sourcesUsed.filter((s: string) => 
        !s.startsWith('http://') && !s.startsWith('https://')
      )
      if (descriptiveSources.length > 0) {
        resultText += `\n\n📚 Sources:\n${descriptiveSources.map((s: string) => `• ${s}`).join('\n')}`
      }
    }

    // LEVEL 2: Image/Video analysis findings (SECONDARY)
    const analysisFindings = ensureArray(parsed.imageAnalysisFindings)
    if (analysisFindings.length > 0) {
      const label = fileType === 'video' ? 'VIDEO' : 'IMAGE'
      resultText += `\n\n🖼️ LEVEL 2 - ${label} Analysis:\n${analysisFindings.map((f: string) => `• ${f}`).join('\n')}`
    }

    // Add claims identified if present
    const claimsIdentified = ensureArray(parsed.claimsIdentified)
    if (claimsIdentified.length > 0) {
      resultText += `\n\nClaims Identified:\n${claimsIdentified.map((c: string) => `• ${c}`).join('\n')}`
    }

    // Add recommended actions if newsworthy
    const recommendedActions = ensureArray(parsed.recommendedActions)
    if (recommendedActions.length > 0) {
      resultText += `\n\n⚠️ Recommended Additional Verification:\n${recommendedActions.map((r: string) => `• ${r}`).join('\n')}`
    }

    // Add detailed analysis if available (and different from result)
    if (parsed.analysis && parsed.analysis !== parsed.result) {
      resultText += `\n\nDetailed Analysis:\n${parsed.analysis}`
    }

    return {
      status: parsed.status || 'unverified',
      verified: parsed.status === 'verified',
      result: resultText,
      issues: allIssues.length > 0 ? allIssues : undefined,
      verificationFactors: allVerificationFactors.length > 0 ? allVerificationFactors : undefined
    }
  } catch (error) {
    console.error('Gemini API error:', error)
    
    // Clean up video file from Gemini if upload was successful but verification failed
    if (videoUri) {
      deleteGeminiFile(videoUri).catch(err => 
        console.error('Failed to cleanup video file after error:', err)
      )
    }
    
    // Re-throw the error instead of returning a fallback
    throw new Error(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}