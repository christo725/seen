'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import exifr from 'exifr'
import ExifReader from 'exifreader'
import { Upload, MapPin, Video, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react'
import { User } from '@supabase/supabase-js'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css'

// Set Mapbox access token - you'll need to add this to your .env.local
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

interface LocationData {
  latitude: number
  longitude: number
  source: 'exif' | 'user_location' | 'manual' | 'address'
  address?: string
}

interface MetadataStatus {
  hasLocation: boolean
  source?: 'exif' | 'video_metadata'
  message: string
  captureDate?: Date
  captureDateSource?: 'exif' | 'video_metadata'
}

interface FileUpload {
  id: string
  file: File
  processedFile?: File
  preview: string
  description: string
  location: LocationData | null
  metadataStatus: MetadataStatus | null
  captureDate: Date | null
  isProcessing: boolean
  error?: string
  showAddressInput?: boolean
}

export default function UploadPage() {
  const [user, setUser] = useState<User | null>(null)
  const [files, setFiles] = useState<FileUpload[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
      } else {
        setUser(user)
      }
    }
    getUser()
  }, [router, supabase.auth])

  // Initialize per-file geocoders
  useEffect(() => {
    if (!mapboxgl.accessToken) return

    const filesWithAddressInput = files.filter(f => f.showAddressInput)
    
    filesWithAddressInput.forEach(file => {
      const containerId = `geocoder-${file.id}`
      const container = document.getElementById(containerId)
      
      if (!container || container.querySelector('.mapboxgl-ctrl-geocoder')) return

      // Create geocoder element
      const geocoderElement = document.createElement('div')
      geocoderElement.className = 'mapboxgl-ctrl-geocoder mapboxgl-ctrl'

      const inputElement = document.createElement('input')
      inputElement.className = 'mapbox-gl-geocoder--input'
      inputElement.type = 'text'
      inputElement.placeholder = 'Enter address or place name'

      const iconElement = document.createElement('div')
      iconElement.className = 'mapbox-gl-geocoder--pin-right'
      iconElement.innerHTML = `<button class="mapbox-gl-geocoder--button" type="button" aria-label="Search"><svg class="mapbox-gl-geocoder--icon mapbox-gl-geocoder--icon-search" viewBox="0 0 18 18" width="18" height="18"><path fill-rule="evenodd" d="m6.5 11.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5zm6-3l3 3-1 1-3-3c-1 1-2 1-3 1-3 0-5-2-5-5s2-5 5-5 5 2 5 5c0 1 0 2-1 3z"></path></svg></button>`

      geocoderElement.appendChild(inputElement)
      geocoderElement.appendChild(iconElement)
      container.appendChild(geocoderElement)

      // Set up search functionality
      let searchTimeout: NodeJS.Timeout
      inputElement.addEventListener('input', (e) => {
        const query = (e.target as HTMLInputElement).value

        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(async () => {
          if (query.length > 2) {
            try {
              const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&types=address,poi&limit=5`
              )
              const data = await response.json()

              let suggestionsContainer = geocoderElement.querySelector('.mapbox-gl-geocoder--suggestions')
              if (!suggestionsContainer) {
                suggestionsContainer = document.createElement('div')
                suggestionsContainer.className = 'mapbox-gl-geocoder--suggestions'
                geocoderElement.appendChild(suggestionsContainer)
              }

              suggestionsContainer.innerHTML = ''

              data.features?.forEach((feature: any) => {
                const suggestion = document.createElement('div')
                suggestion.className = 'mapbox-gl-geocoder--suggestion'
                suggestion.innerHTML = `
                  <div class="mapbox-gl-geocoder--suggest-title">${feature.text}</div>
                  <div class="mapbox-gl-geocoder--suggest-description">${feature.place_name}</div>
                `

                suggestion.addEventListener('click', () => {
                  inputElement.value = feature.place_name
                  suggestionsContainer!.innerHTML = ''

                  const [lng, lat] = feature.center
                  const locationData: LocationData = {
                    latitude: lat,
                    longitude: lng,
                    source: 'address',
                    address: feature.place_name
                  }
                  
                  // Update this specific file's location
                  updateFileLocation(file.id, locationData)
                })

                suggestionsContainer.appendChild(suggestion)
              })
            } catch (error) {
              console.error('Geocoding error:', error)
            }
          }
        }, 300)
      })

      // Hide suggestions when clicking outside
      const clickHandler = (e: MouseEvent) => {
        if (!geocoderElement.contains(e.target as Node)) {
          const suggestionsContainer = geocoderElement.querySelector('.mapbox-gl-geocoder--suggestions')
          if (suggestionsContainer) {
            suggestionsContainer.innerHTML = ''
          }
        }
      }
      document.addEventListener('click', clickHandler)

      // Clean up on unmount
      return () => {
        document.removeEventListener('click', clickHandler)
      }
    })
  }, [files])

  const convertHeicToJpeg = async (heicFile: File): Promise<File> => {
    try {
      const heicConvert = (await import('heic-convert')).default
      const buffer = await heicFile.arrayBuffer()
      const outputBuffer = await heicConvert({
        buffer: Buffer.from(buffer),
        format: 'JPEG',
        quality: 0.9
      })

      const blob = new Blob([outputBuffer.buffer as ArrayBuffer], { type: 'image/jpeg' })
      return new File([blob], heicFile.name.replace(/\\.heic$/i, '.jpg'), { type: 'image/jpeg' })
    } catch (err) {
      console.error('Error converting HEIC:', err)
      throw new Error('Failed to convert HEIC image')
    }
  }

  const extractDateTimeFromMetadata = (metadata: any): Date | null => {
    // Try various datetime fields in order of preference
    const dateFields = [
      'DateTimeOriginal',      // EXIF: Original capture time
      'CreateDate',            // EXIF/Video: Creation date
      'CreationDate',          // Video metadata
      'DateTime',              // EXIF: File modification time
      'DateCreated',           // IPTC
      'ModifyDate',            // EXIF: Modification time
    ]

    for (const field of dateFields) {
      if (metadata[field]) {
        try {
          // Handle different date formats
          let dateValue = metadata[field]
          
          // If it's already a Date object
          if (dateValue instanceof Date) {
            return dateValue
          }
          
          // If it's a string, try to parse it
          if (typeof dateValue === 'string') {
            // EXIF dates are often in format: "2024:01:15 14:30:45"
            const exifDateMatch = dateValue.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
            if (exifDateMatch) {
              const [, year, month, day, hour, minute, second] = exifDateMatch
              return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
            }
            
            // Try standard Date parsing
            const parsedDate = new Date(dateValue)
            if (!isNaN(parsedDate.getTime())) {
              return parsedDate
            }
          }
          
          // If it's a number (timestamp)
          if (typeof dateValue === 'number') {
            return new Date(dateValue)
          }
        } catch (err) {
          console.log(`Failed to parse date from ${field}:`, err)
        }
      }
    }
    
    return null
  }

  const extractLocationFromFile = async (file: File): Promise<{ location: LocationData | null, status: MetadataStatus }> => {
    console.log('🔍 Starting metadata extraction for:', file.name, file.type)
    console.log('   File size:', (file.size / 1024 / 1024).toFixed(2), 'MB')
    
    // Check if it's an image (including HEIC which might not have proper MIME type)
    const isImage = file.type.startsWith('image/') || 
                    file.name.toLowerCase().endsWith('.heic') ||
                    file.name.toLowerCase().endsWith('.heif')
    
    // Check if it's a video (including iPhone MOV/HEVC which might not have proper MIME type)
    const fileName = file.name.toLowerCase()
    const isVideo = file.type.startsWith('video/') ||
                    fileName.endsWith('.mov') ||
                    fileName.endsWith('.mp4') ||
                    fileName.endsWith('.m4v') ||
                    fileName.endsWith('.avi') ||
                    fileName.endsWith('.webm') ||
                    fileName.endsWith('.prores')
    
    console.log('   Detection results: isImage =', isImage, ', isVideo =', isVideo)
    
    if (isImage) {
      try {
        // Try multiple EXIF extraction methods for maximum compatibility

        // Method 1: exifr GPS extraction
        try {
          console.log('Trying Method 1: exifr.gps()')
          const exifData = await exifr.gps(file)
          console.log('Method 1 result:', exifData)

          if (exifData && exifData.latitude && exifData.longitude) {
            // Also get full metadata to extract capture date
            let captureDate: Date | null = null
            try {
              const allMetadata = await exifr.parse(file)
              if (allMetadata) {
                captureDate = extractDateTimeFromMetadata(allMetadata)
                console.log('Method 1 - Extracted capture date:', captureDate)
              }
            } catch (dateError) {
              console.log('Method 1 - Could not extract capture date:', dateError)
            }

            return {
              location: {
                latitude: exifData.latitude,
                longitude: exifData.longitude,
                source: 'exif'
              },
              status: {
                hasLocation: true,
                source: 'exif',
                message: 'Location found in image metadata (exifr GPS)',
                captureDate: captureDate || undefined,
                captureDateSource: captureDate ? 'exif' : undefined
              }
            }
          }
        } catch (exifrError) {
          console.log('❌ Method 1 failed:', exifrError)
        }

        // Method 2: exifr with all metadata
        try {
          console.log('Trying Method 2: exifr.parse() with all metadata')
          const allExifData = await exifr.parse(file)
          console.log('Method 2 - Got metadata?', !!allExifData)
          if (allExifData) {
            // Debug: Log all metadata to see what's available
            console.log('All EXIF metadata found:', allExifData)
            console.log('Available date fields:', {
              DateTimeOriginal: allExifData.DateTimeOriginal,
              CreateDate: allExifData.CreateDate,
              CreationDate: allExifData.CreationDate,
              DateTime: allExifData.DateTime,
              DateCreated: allExifData.DateCreated,
              ModifyDate: allExifData.ModifyDate
            })
            
            // Check various GPS fields that might exist
            const lat = allExifData.GPSLatitude || allExifData.latitude
            const lng = allExifData.GPSLongitude || allExifData.longitude
            
            // Extract datetime
            const captureDate = extractDateTimeFromMetadata(allExifData)
            console.log('Extracted capture date:', captureDate)

            if (lat && lng && typeof lat === 'number' && typeof lng === 'number') {
              return {
                location: {
                  latitude: lat,
                  longitude: lng,
                  source: 'exif'
                },
                status: {
                  hasLocation: true,
                  source: 'exif',
                  message: 'Location found in image metadata (full parse)',
                  captureDate: captureDate || undefined,
                  captureDateSource: captureDate ? 'exif' : undefined
                }
              }
            }
            
            // If no GPS but has datetime, still return success with metadata
            if (captureDate) {
              return {
                location: null,
                status: {
                  hasLocation: false,
                  message: 'Image contains metadata with date/time but no GPS location data',
                  captureDate,
                  captureDateSource: 'exif'
                }
              }
            }
          }
        } catch (exifrFullError) {
          console.log('❌ Method 2 failed:', exifrFullError)
        }

        // Method 3: ExifReader as fallback
        try {
          console.log('Trying Method 3: ExifReader.load()')
          const tags = await ExifReader.load(file, {
            expanded: true,
            includeUnknown: true
          })

          if (tags.gps && tags.gps.Latitude && tags.gps.Longitude) {
            // Handle different types of GPS data formats
            let lat: number, lng: number

            if (typeof tags.gps.Latitude === 'number') {
              lat = tags.gps.Latitude
            } else if (tags.gps.Latitude && 'description' in tags.gps.Latitude) {
              lat = parseFloat((tags.gps.Latitude as any).description as string)
            } else {
              lat = parseFloat(String(tags.gps.Latitude))
            }

            if (typeof tags.gps.Longitude === 'number') {
              lng = tags.gps.Longitude
            } else if (tags.gps.Longitude && 'description' in tags.gps.Longitude) {
              lng = parseFloat((tags.gps.Longitude as any).description as string)
            } else {
              lng = parseFloat(String(tags.gps.Longitude))
            }

            if (!isNaN(lat) && !isNaN(lng)) {
              return {
                location: {
                  latitude: lat,
                  longitude: lng,
                  source: 'exif'
                },
                status: {
                  hasLocation: true,
                  source: 'exif',
                  message: 'Location found in image metadata (ExifReader)'
                }
              }
            }
          }

          // Check if image has other metadata even without GPS
          console.log('Method 3 - ExifReader tags:', tags)
          const hasOtherMetadata = tags.exif || tags.file || Object.keys(tags).length > 0
          if (hasOtherMetadata) {
            console.log('Method 3 - Found other metadata, checking for datetime...')
            console.log('tags.exif:', tags.exif)
            // Try to extract datetime from ExifReader tags
            const captureDate = extractDateTimeFromMetadata(tags.exif || {})
            console.log('Method 3 - Extracted capture date:', captureDate)
            
            return {
              location: null,
              status: {
                hasLocation: false,
                message: captureDate 
                  ? 'Image contains metadata with date/time but no GPS location data'
                  : 'Image contains metadata but no GPS location data',
                captureDate: captureDate || undefined,
                captureDateSource: captureDate ? 'exif' : undefined
              }
            }
          }
        } catch (exifReaderError) {
          console.log('❌ Method 3 failed:', exifReaderError)
        }

        console.log('⚠️ All methods completed - no GPS data found')
        return {
          location: null,
          status: {
            hasLocation: false,
            message: 'No GPS location data found in image metadata'
          }
        }
      } catch (err) {
        console.error('Error reading image EXIF data:', err)
        return {
          location: null,
          status: {
            hasLocation: false,
            message: 'Could not read image metadata'
          }
        }
      }
    } else if (isVideo) {
      // Handle video files (iPhone MOV/HEVC, ProRes, H264, MP4, etc.)
      console.log('📹 Attempting to extract metadata from video...')
      
      try {
        // Try to extract GPS from video metadata using exifr
        let videoMetadata = null
        try {
          videoMetadata = await exifr.gps(file)
          console.log('   GPS extraction result:', videoMetadata ? 'Found data' : 'No GPS data')
        } catch (gpsError) {
          console.log('   GPS extraction failed (format may not be supported):', gpsError instanceof Error ? gpsError.message : 'Unknown error')
          // Continue to try other metadata extraction methods
        }
        
        if (videoMetadata && videoMetadata.latitude && videoMetadata.longitude) {
          console.log('   ✅ GPS coordinates found in video metadata')
          return {
            location: {
              latitude: videoMetadata.latitude,
              longitude: videoMetadata.longitude,
              source: 'exif'
            },
            status: {
              hasLocation: true,
              source: 'video_metadata',
              message: 'Location found in video metadata'
            }
          }
        }

        // Try to get any metadata from the video file
        let allMetadata = null
        try {
          allMetadata = await exifr.parse(file)
          console.log('   Metadata parsing result:', allMetadata ? 'Found metadata' : 'No metadata')
        } catch (parseError) {
          console.log('   Metadata parsing failed:', parseError instanceof Error ? parseError.message : 'Unknown error')
          // This is okay - some video formats don't support metadata extraction
        }
        
        if (allMetadata) {
          // Extract datetime
          const captureDate = extractDateTimeFromMetadata(allMetadata)
          
          // Check for creation date or other useful metadata
          const hasOtherMetadata = allMetadata.CreateDate || allMetadata.CreationDate ||
                                 allMetadata.DateTime || allMetadata.DateTimeOriginal

          if (hasOtherMetadata || captureDate) {
            console.log('   ℹ️ Found timestamp metadata but no GPS')
            return {
              location: null,
              status: {
                hasLocation: false,
                message: captureDate
                  ? 'Video contains metadata with date/time but no GPS location data'
                  : 'Video contains metadata but no GPS location data',
                captureDate: captureDate || undefined,
                captureDateSource: captureDate ? 'video_metadata' : undefined
              }
            }
          }
        }

        // No metadata found, but that's okay for videos
        console.log('   ℹ️ No metadata found in video (this is normal for some iPhone videos)')
        return {
          location: null,
          status: {
            hasLocation: false,
            message: 'No GPS location data found in video metadata (you can set location manually)'
          }
        }
      } catch (err) {
        // Catch-all error handler - should rarely be reached now
        console.error('Unexpected error reading video metadata:', err)
        return {
          location: null,
          status: {
            hasLocation: false,
            message: 'Video accepted - metadata extraction not supported for this format (you can set location manually)'
          }
        }
      }
    }

    // This shouldn't be reached if isImage or isVideo checks are comprehensive
    console.error('❌ File not recognized as image or video!')
    console.error('   File name:', file.name)
    console.error('   File type (MIME):', file.type || '(empty/undefined)')
    console.error('   File extension:', file.name.split('.').pop())
    console.error('   isImage:', isImage)
    console.error('   isVideo:', isVideo)
    
    return {
      location: null,
      status: {
        hasLocation: false,
        message: `File type not recognized: ${file.type || 'unknown'} (${file.name}). Supported: images and videos.`
      }
    }
  }

  const processFile = async (file: File): Promise<FileUpload> => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

    let fileToProcess = file
    let preview = ''

    try {
      // Extract metadata from ORIGINAL file BEFORE any conversion
      // This is critical for HEIC files to preserve EXIF data
      const { location, status } = await extractLocationFromFile(file)

      // Handle HEIC conversion AFTER metadata extraction
      if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        console.log('📸 Converting HEIC to JPEG (metadata already extracted)')
        fileToProcess = await convertHeicToJpeg(file)
      }

      // Create preview
      preview = URL.createObjectURL(fileToProcess)

      return {
        id,
        file,
        processedFile: fileToProcess !== file ? fileToProcess : undefined,
        preview,
        description: '',
        location: location || null,
        metadataStatus: status,
        captureDate: status?.captureDate || null,
        isProcessing: false
      }
    } catch (err: any) {
      console.error('File processing error:', err)
      return {
        id,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        description: '',
        location: null,
        metadataStatus: null,
        captureDate: null,
        isProcessing: false,
        error: err.message || 'Failed to process file'
      }
    }
  }

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles = Array.from(fileList)

    // Process files one by one
    for (const file of newFiles) {
      setFiles(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        description: '',
        location: null,
        metadataStatus: null,
        captureDate: null,
        isProcessing: true
      }])

      // Process the file
      const processedFile = await processFile(file)
      setFiles(prev => prev.map(f =>
        f.file === file ? processedFile : f
      ))
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const removeFile = (id: string) => {
    setFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id)
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.preview)
      }
      return prev.filter(f => f.id !== id)
    })
  }

  const updateFileDescription = (id: string, description: string) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, description } : f
    ))
  }

  const updateFileCaptureDate = (id: string, captureDate: Date | null) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, captureDate } : f
    ))
  }

  const updateFileLocation = (id: string, location: LocationData) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, location, showAddressInput: false } : f
    ))
  }

  const toggleFileAddressInput = (id: string) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, showAddressInput: !f.showAddressInput } : f
    ))
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || files.length === 0) {
      setError('Please add at least one file')
      return
    }

    // Check that all files have locations (description is optional)
    const invalidFiles = files.filter(f => !f.location)
    if (invalidFiles.length > 0) {
      setError('Please set locations for all files')
      return
    }

    setLoading(true)
    setError(null)

    try {
      for (const fileUpload of files) {
        const fileToUpload = fileUpload.processedFile || fileUpload.file

        // Upload file to Supabase Storage
        const fileExt = fileToUpload.name.split('.').pop()
        const fileName = `${user.id}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${fileExt}`
        const filePath = `uploads/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, fileToUpload)

        if (uploadError) throw uploadError

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(filePath)

        // Determine file type more robustly (handles iPhone HEVC/MOV files with no MIME type)
        const uploadFileName = fileToUpload.name.toLowerCase()
        const isImageFile = fileToUpload.type.startsWith('image/') || 
                           uploadFileName.endsWith('.heic') || 
                           uploadFileName.endsWith('.heif') ||
                           uploadFileName.endsWith('.jpg') ||
                           uploadFileName.endsWith('.jpeg') ||
                           uploadFileName.endsWith('.png') ||
                           uploadFileName.endsWith('.gif') ||
                           uploadFileName.endsWith('.webp')
        const fileType = isImageFile ? 'image' : 'video'

        // Save upload metadata to database
        const { error: dbError } = await (supabase as any)
          .from('uploads')
          .insert({
            user_id: user.id,
            file_url: publicUrl,
            file_type: fileType,
            description: fileUpload.description.trim() || '',
            latitude: fileUpload.location!.latitude,
            longitude: fileUpload.location!.longitude,
            location_source: fileUpload.location!.source === 'address' ? 'manual' : fileUpload.location!.source,
            capture_date: fileUpload.captureDate?.toISOString() || null
          })

        if (dbError) throw dbError

        // Get the created upload ID for AI verification
        const { data: newUpload } = await supabase
          .from('uploads')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single() as any

        // Trigger AI verification (don't wait for it)
        if (newUpload) {
          fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: newUpload.id })
          }).catch(console.error)
        }
      }

      // Clean up object URLs
      files.forEach(f => URL.revokeObjectURL(f.preview))

      // Redirect to map and scroll to top
      router.push('/map')
      // Ensure page scrolls to top after navigation
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (err: any) {
      console.error('Upload error:', err)
      console.error('Error details:', JSON.stringify(err, null, 2))
      console.error('Error message:', err?.message)
      console.error('Error code:', err?.code)
      console.error('Error status:', err?.status)
      setError(err?.message || err?.error_description || err?.error || 'Failed to upload files')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 bg-gray-950 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-100 mb-8">Upload Media</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* File Upload Area */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver
              ? 'border-purple-500 bg-purple-900/20'
              : 'border-gray-600 hover:border-purple-400 bg-gray-900/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <div className="space-y-2">
            <p className="text-lg font-medium text-gray-200">
              Drop files here or click to browse
            </p>
            <p className="text-sm text-gray-400">
              Supports: JPEG, PNG, GIF, HEIC (iPhone), MP4, MOV (including iPhone HEVC), ProRes, H.264/H.265 (up to 100MB each)
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-lg"
            >
              Choose Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,.heic,.HEIC,.mov,.MOV,.mp4,.MP4,.m4v,.prores"
              onChange={handleFileChange}
              multiple
            />
          </div>
        </div>


        {/* File Previews */}
        {files.length > 0 && (
          <div className="bg-gray-900/50 border border-purple-900/30 shadow-lg rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-100 mb-4">Files to Upload ({files.length})</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {files.map((fileUpload) => (
                <div key={fileUpload.id} className="border border-purple-900/30 bg-gray-800/50 rounded-lg p-4">
                  {/* Preview */}
                  <div className="relative mb-3">
                    {fileUpload.file.type.startsWith('image/') ? (
                      <img
                        src={fileUpload.preview}
                        alt="Preview"
                        className="w-full h-40 object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-40 flex items-center justify-center bg-gray-800 rounded">
                        <Video className="h-16 w-16 text-gray-400" />
                        <span className="ml-2 text-sm text-gray-300">{fileUpload.file.name}</span>
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeFile(fileUpload.id)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>

                    {/* Processing indicator */}
                    {fileUpload.isProcessing && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded">
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Error */}
                  {fileUpload.error && (
                    <div className="bg-red-900/50 border border-red-500/50 text-red-400 p-2 rounded text-sm mb-3">
                      {fileUpload.error}
                    </div>
                  )}

                  {/* Metadata Status */}
                  {fileUpload.metadataStatus && (
                    <div className={`mb-3 p-3 rounded text-sm ${
                      fileUpload.metadataStatus.hasLocation
                        ? 'bg-green-900/50 border border-green-600/50'
                        : 'bg-yellow-900/50 border border-yellow-600/50'
                    }`}>
                      <div className="flex items-start gap-2">
                        {fileUpload.metadataStatus.hasLocation ? (
                          <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={fileUpload.metadataStatus.hasLocation ? 'text-green-300' : 'text-yellow-300'}>
                          {fileUpload.metadataStatus.message}
                        </span>
                      </div>
                      {fileUpload.metadataStatus.captureDate && (
                        <div className="mt-2 pl-6 text-sm text-gray-300">
                          <strong>Capture Date:</strong> {fileUpload.metadataStatus.captureDate.toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            timeZoneName: 'short'
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="block text-base font-medium text-gray-200 mb-1">
                      Description (optional, max 100 characters)
                    </label>
                    <textarea
                      value={fileUpload.description}
                      onChange={(e) => updateFileDescription(fileUpload.id, e.target.value)}
                      maxLength={100}
                      rows={4}
                      className="w-full text-lg bg-gray-800 border border-gray-600 text-gray-200 rounded-md p-3 focus:ring-purple-500 focus:border-purple-500 resize-y"
                      placeholder="What's happening here? (optional)"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                      {fileUpload.description.length}/100 characters
                    </p>
                  </div>

                  {/* Capture Date/Time */}
                  <div className="mt-4">
                    <label className="block text-base font-medium text-gray-200 mb-1">
                      Capture Date & Time
                      {fileUpload.metadataStatus?.captureDate && (
                        <span className="ml-2 text-sm text-green-400">✓ From metadata</span>
                      )}
                    </label>
                    <input
                      type="datetime-local"
                      value={fileUpload.captureDate ? new Date(fileUpload.captureDate.getTime() - fileUpload.captureDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                      onChange={(e) => {
                        const newDate = e.target.value ? new Date(e.target.value) : null
                        updateFileCaptureDate(fileUpload.id, newDate)
                      }}
                      className="w-full text-lg bg-gray-800 border border-gray-600 text-gray-200 rounded-md p-3 focus:ring-purple-500 focus:border-purple-500"
                    />
                    <p className="text-sm text-gray-400 mt-1">
                      {fileUpload.captureDate 
                        ? `Currently set to: ${new Date(fileUpload.captureDate).toLocaleString()}`
                        : 'Optional - when was this media captured?'}
                    </p>
                  </div>

                  {/* Location status */}
                  <div className="mt-4">
                    <label className="block text-base font-medium text-gray-200 mb-2">
                      Location
                    </label>
                    
                    {fileUpload.location ? (
                      <div className="bg-gray-800 border border-gray-600 rounded-md p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center text-sm text-gray-300 mb-1">
                              <MapPin className="h-4 w-4 inline mr-2 text-green-400" />
                              <span className="font-medium">
                                {fileUpload.location.source === 'exif' ? 'From metadata' :
                                 fileUpload.location.source === 'user_location' ? 'Your current location' :
                                 fileUpload.location.source === 'address' ? 'From address' : 
                                 fileUpload.location.source === 'manual' ? 'Manually set' : 'Set'}
                              </span>
                            </div>
                            {fileUpload.location.address && (
                              <p className="text-sm text-gray-400 mb-1">{fileUpload.location.address}</p>
                            )}
                            <p className="text-xs text-gray-500">
                              {fileUpload.location.latitude.toFixed(6)}, {fileUpload.location.longitude.toFixed(6)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleFileAddressInput(fileUpload.id)}
                            className="ml-2 text-sm text-purple-400 hover:text-purple-300"
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-800 border border-gray-600 rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-sm text-gray-400">
                            <MapPin className="h-4 w-4 inline mr-2" />
                            <span>Location: Unknown</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleFileAddressInput(fileUpload.id)}
                            className="text-sm text-purple-400 hover:text-purple-300"
                          >
                            Set Location
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Per-file address input */}
                    {fileUpload.showAddressInput && (
                      <div className="mt-3 p-3 bg-gray-800/50 border border-purple-900/30 rounded-md">
                        <div 
                          id={`geocoder-${fileUpload.id}`}
                          className="per-file-geocoder"
                        ></div>
                        <p className="text-sm text-gray-400 mt-2">Start typing to search for an address</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Submit Button */}
        {files.length > 0 && (
          <button
            type="submit"
            disabled={loading || files.some(f => f.isProcessing) || files.some(f => !f.location)}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Uploading {files.length} file{files.length > 1 ? 's' : ''}...
              </>
            ) : (
              `Upload ${files.length} file${files.length > 1 ? 's' : ''}`
            )}
          </button>
        )}
      </form>

      {/* Custom styles for geocoder */}
      <style jsx global>{`
        .mapboxgl-ctrl-geocoder {
          width: 100%;
          max-width: none;
          margin: 0;
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
        }

        .mapbox-gl-geocoder--input {
          width: 100%;
          height: 48px;
          padding: 12px 48px 12px 16px;
          border-radius: 8px;
          border: 2px solid #4b5563;
          background-color: #1f2937;
          color: #e5e7eb;
          font-size: 18px;
          transition: all 0.2s ease;
          cursor: text;
          pointer-events: auto;
          touch-action: manipulation;
          box-sizing: border-box;
        }

        .mapbox-gl-geocoder--input:hover {
          border-color: #6b7280;
        }

        .mapbox-gl-geocoder--input:focus,
        .mapbox-gl-geocoder--input:active {
          border-color: #a855f7;
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.1);
          outline: none;
        }

        .mapbox-gl-geocoder--input::placeholder {
          color: #9ca3af;
          opacity: 1;
        }

        .mapbox-gl-geocoder--pin-right {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 2;
        }

        .mapbox-gl-geocoder--button {
          background-color: transparent;
          border: none;
          pointer-events: auto;
          cursor: pointer;
          padding: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mapbox-gl-geocoder--icon-search {
          fill: #9ca3af;
          width: 18px;
          height: 18px;
        }

        .mapbox-gl-geocoder--suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background-color: #1f2937;
          border: 1px solid #374151;
          border-radius: 8px;
          margin-top: 4px;
          z-index: 10;
          max-height: 200px;
          overflow-y: auto;
        }

        .mapbox-gl-geocoder--suggestion {
          background-color: #1f2937;
          border-bottom: 1px solid #374151;
          color: #e5e7eb;
          padding: 12px 16px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .mapbox-gl-geocoder--suggestion:last-child {
          border-bottom: none;
        }

        .mapbox-gl-geocoder--suggestion:hover,
        .mapbox-gl-geocoder--suggestion.mapbox-gl-geocoder--selected {
          background-color: #374151;
        }

        .mapbox-gl-geocoder--suggest-title {
          color: #e5e7eb;
          font-weight: 500;
          font-size: 16px;
          margin-bottom: 2px;
        }

        .mapbox-gl-geocoder--suggest-description {
          color: #9ca3af;
          font-size: 14px;
        }

        /* Per-file geocoder styling */
        .per-file-geocoder .mapboxgl-ctrl-geocoder {
          width: 100%;
        }

        .per-file-geocoder .mapbox-gl-geocoder--input {
          font-size: 16px;
          height: 44px;
        }
      `}</style>
    </div>
  )
}