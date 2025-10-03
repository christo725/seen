'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Upload } from '@/types/database'
import { format } from 'date-fns'
import * as Slider from '@radix-ui/react-slider'
import { Calendar, CheckCircle, XCircle, Loader2, Filter, Search, Navigation, X, AlertTriangle } from 'lucide-react'

// Helper function to parse local datetime string without timezone conversion
const parseLocalDate = (dateString: string): Date => {
  // Parse "YYYY-MM-DD HH:MM:SS" format directly without timezone conversion
  const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/)
  if (!parts) return new Date(dateString) // fallback for unexpected format
  
  const [, year, month, day, hour, minute, second] = parts
  return new Date(
    parseInt(year),
    parseInt(month) - 1, // months are 0-indexed
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  )
}

// Helper function to format local datetime string without timezone conversion
const formatLocalDate = (dateString: string, formatPattern: string): string => {
  const date = parseLocalDate(dateString)
  return format(date, formatPattern)
}

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })

// Create custom blue icon for search pin
const createBlueIcon = () => {
  if (typeof window === 'undefined') return null
  const L = require('leaflet')

  return L.divIcon({
    className: 'custom-search-pin',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: #3b82f6;
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  })
}

// Create custom red icon for upload pins - larger and easy to click
const createRedIcon = (count?: number) => {
  if (typeof window === 'undefined') return null
  const L = require('leaflet')

  const showCount = count && count > 1
  const size = showCount ? 48 : 40
  const countBadge = showCount ? `
    <div style="
      position: absolute;
      top: -8px;
      right: -8px;
      background: white;
      color: #ef4444;
      border: 2px solid #ef4444;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      transform: rotate(45deg);
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${count}</div>
  ` : ''

  return L.divIcon({
    className: 'custom-upload-pin',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: #ef4444;
        border: 4px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        position: relative;
        cursor: pointer;
        transition: transform 0.2s;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
        "></div>
        ${countBadge}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size]
  })
}

// Custom map component to get map instance and handle auto-zoom
const MapEvents = dynamic(() => {
  return Promise.resolve(({ mapRef, autoZoomTo }: { mapRef: any; autoZoomTo?: { lat: number; lng: number } }) => {
    const React = require('react')
    const { useMapEvents, useMap } = require('react-leaflet')
    const map = useMapEvents({})
    const mapInstance = useMap()
    
    // Store the map instance for geocoder use
    if (mapRef && mapRef.current) {
      mapRef.current.leafletElement = mapInstance
    }
    
    // Auto-zoom to location if provided (only once on initial mount)
    React.useEffect(() => {
      let hasZoomed = false
      
      if (autoZoomTo && mapInstance && !hasZoomed) {
        console.log('Auto-zooming to:', autoZoomTo)
        hasZoomed = true
        // Small delay to ensure map is fully loaded
        setTimeout(() => {
          mapInstance.setView([autoZoomTo.lat, autoZoomTo.lng], 16, {
            animate: true,
            duration: 1.5
          })
        }, 500)
      }
    }, []) // Empty dependency array - only run once on mount
    
    return null
  })
}, { ssr: false })

interface MapViewProps {
  initialUploads?: Upload[]
}

type TimeRange = 'last24hours' | 'last7days' | 'last30days' | 'last365days' | 'all' | 'custom'
type MapStyle = 'standard' | 'satellite' | 'terrain' | 'topographic' | 'dark'

const MAP_STYLES = {
  standard: {
    name: 'Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  satellite: {
    name: 'Satellite',
    url: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`,
    attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a>'
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
  },
  topographic: {
    name: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
  }
}

export default function MapView({ initialUploads = [] }: MapViewProps) {
  const [uploads, setUploads] = useState<Upload[]>(initialUploads)
  const [filteredUploads, setFilteredUploads] = useState<Upload[]>(initialUploads)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [sliderValue, setSliderValue] = useState([100])
  const [minDate, setMinDate] = useState<Date>(new Date())
  const [maxDate, setMaxDate] = useState<Date>(new Date())
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyle>('standard')
  const mapRef = useRef<any>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false)
  
  // Current index for multi-upload popups
  const [popupIndex, setPopupIndex] = useState<Record<string, number>>({})

  const supabase = createClient()
  
  // Group uploads by location (lat, lng)
  const groupedUploads = filteredUploads.reduce((acc, upload) => {
    if (!upload.latitude || !upload.longitude) return acc
    
    const key = `${upload.latitude.toFixed(6)},${upload.longitude.toFixed(6)}`
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(upload)
    return acc
  }, {} as Record<string, Upload[]>)

  // Determine auto-zoom location from latest upload (only used on initial mount)
  const autoZoomLocation = initialUploads.length > 0 && initialUploads[0].latitude && initialUploads[0].longitude
    ? { lat: initialUploads[0].latitude, lng: initialUploads[0].longitude }
    : undefined

  // Test Supabase connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log('=== SUPABASE DIAGNOSTICS ===')
        console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
        console.log('Anon Key configured:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
        console.log('Anon Key length:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0)
        console.log('Supabase client created:', !!supabase)

        // Test 1: Basic ping to see if Supabase is reachable
        console.log('Testing basic Supabase connectivity...')

        // Try to perform a very basic query first
        const { data: basicTest, error: basicError } = await supabase
          .from('uploads')
          .select('id')
          .limit(1)
          .single()

        if (basicError) {
          console.error('Basic connectivity test failed:')
          console.error('Full error object:', JSON.stringify(basicError, null, 2))
          console.error('Error message:', basicError.message)
          console.error('Error code:', basicError.code)
          console.error('Error details:', basicError.details)
          console.error('Error hint:', basicError.hint)

          // Try to get more info about what's wrong
          if (basicError.code === '42P01') {
            console.error('❌ The "uploads" table does not exist in your Supabase database')
          } else if (basicError.code === 'PGRST116') {
            console.error('❌ No rows found - the table exists but is empty')
          } else if (basicError.message?.includes('JWT')) {
            console.error('❌ Authentication issue with anon key')
          } else if (basicError.message?.includes('permission')) {
            console.error('❌ Permission denied - check Row Level Security policies')
          }
        } else {
          console.log('✅ Basic Supabase connectivity successful')
          console.log('Sample data:', basicTest)
        }

        // Test 2: Try a count query which should work even on empty tables
        const { count, error: countError } = await supabase
          .from('uploads')
          .select('*', { count: 'exact', head: true })

        if (countError) {
          console.error('Count query failed:')
          console.error('Full error object:', JSON.stringify(countError, null, 2))
        } else {
          console.log('✅ Table exists, record count:', count)
        }

      } catch (err) {
        console.error('❌ Failed to test Supabase connection:')
        console.error('Caught error:', JSON.stringify(err, null, 2))
        console.error('Error message:', err instanceof Error ? err.message : 'Unknown error')
        console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace')
      }
    }

    testConnection()
  }, [supabase])

  // Custom search functions
  const searchLocations = async (query: string) => {
    if (!query.trim() || !process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return

    setSearchLoading(true)
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&types=address,poi,place&limit=5`
      )

      if (!response.ok) throw new Error('Search failed')

      const data = await response.json()
      setSearchSuggestions(data.features || [])
      setShowSuggestions(true)
    } catch (error) {
      console.error('Search error:', error)
      setSearchSuggestions([])
    } finally {
      setSearchLoading(false)
    }
  }

  const selectLocation = (feature: any) => {
    const [lng, lat] = feature.center

    // Set the search pin
    setSearchPin({
      lat,
      lng,
      name: feature.place_name
    })

    if (mapRef.current && mapRef.current.leafletElement) {
      const leafletMap = mapRef.current.leafletElement
      leafletMap.setView([lat, lng], 18) // Increased zoom level from 16 to 18
    } else if (mapInstance) {
      mapInstance.setView([lat, lng], 18) // Increased zoom level from 16 to 18
    }

    setSearchQuery(feature.place_name)
    setShowSuggestions(false)
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)

    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Clear search pin if input is cleared
    if (value.trim() === '') {
      setSearchPin(null)
    }

    if (value.length > 2) {
      searchTimeoutRef.current = setTimeout(() => searchLocations(value), 300)
    } else {
      setSearchSuggestions([])
      setShowSuggestions(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchSuggestions.length > 0) {
      selectLocation(searchSuggestions[0])
    }
  }

  // Get user's current location and center map
  const centerOnUserLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude

          if (mapRef.current && mapRef.current.leafletElement) {
            const leafletMap = mapRef.current.leafletElement
            leafletMap.setView([lat, lng], 18)
          } else if (mapInstance) {
            mapInstance.setView([lat, lng], 18)
          }
        },
        (error) => {
          console.error('Error getting location:', error)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )
    }
  }

  useEffect(() => {
    fetchUploads()
    // Scroll to top when component mounts (e.g., after upload redirect)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    filterUploadsByTime()
  }, [uploads, timeRange, sliderValue, customStartDate, customEndDate])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const fetchUploads = async () => {
    setLoading(true)
    try {
      console.log('Fetching uploads...')
      console.log('Supabase URL configured:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
      console.log('Supabase Anon Key configured:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

      const { data, error } = await supabase
        .from('uploads')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error fetching uploads:')
        console.error('Full error object:', JSON.stringify(error, null, 2))
        console.error('Error message:', error.message)
        console.error('Error code:', error.code)
        console.error('Error details:', error.details)
        console.error('Error hint:', error.hint)
        console.error('Error status:', (error as any).status)
        console.error('Error statusCode:', (error as any).statusCode)

        // Check if it's an authentication error
        if (error.code === 'PGRST301' || (error as any).statusCode === 401) {
          console.error('Authentication error: Check your Supabase anon key and RLS policies')
        }

        // Check for table not found
        if (error.code === '42P01') {
          console.error('Table "uploads" does not exist. Please create the table in your Supabase database.')
        }

        throw error
      }

      console.log('Fetched data successfully:', data ? `${data.length} uploads` : 'null data')

      if (data && data.length > 0) {
        setUploads(data as Upload[])
        setFilteredUploads(data as Upload[])

        // Set min and max dates for the slider - use capture_date if available, otherwise created_at
        const dates = (data as Upload[]).map(u => 
          u.capture_date ? parseLocalDate(u.capture_date) : new Date(u.created_at)
        )
        setMinDate(new Date(Math.min(...dates.map(d => d.getTime()))))
        setMaxDate(new Date(Math.max(...dates.map(d => d.getTime()))))
      } else {
        console.log('No uploads found in database')
        setUploads([])
        setFilteredUploads([])
      }
    } catch (error) {
      console.error('Error in fetchUploads:')
      console.error('Caught error:', JSON.stringify(error, null, 2))
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      console.error('Error name:', error instanceof Error ? error.name : 'No error name')
    } finally {
      setLoading(false)
    }
  }

  const filterUploadsByTime = () => {
    if (timeRange === 'all') {
      setFilteredUploads(uploads)
      return
    }

    const now = new Date()
    const sliderPercentage = sliderValue[0] / 100

    let startDate: Date
    let endDate: Date

    if (timeRange === 'custom') {
      // Use custom date range
      if (customStartDate && customEndDate) {
        startDate = new Date(customStartDate)
        endDate = new Date(customEndDate)
        endDate.setHours(23, 59, 59, 999) // Include entire end day
      } else if (customStartDate) {
        // Only start date provided - show from start date to now
        startDate = new Date(customStartDate)
        endDate = now
      } else {
        // No dates provided, show all
        setFilteredUploads(uploads)
        return
      }
    } else {
      // Calculate ranges based on slider position
      switch (timeRange) {
        case 'last24hours':
          // Last 24 hours: slider divides into 24 hours
          const hoursRange = 24 * 60 * 60 * 1000
          endDate = new Date(now.getTime() - (1 - sliderPercentage) * hoursRange)
          startDate = new Date(endDate.getTime() - hoursRange)
          break
        case 'last7days':
          // Last 7 days: slider divides into 7 days
          const daysRange = 7 * 24 * 60 * 60 * 1000
          endDate = new Date(now.getTime() - (1 - sliderPercentage) * daysRange)
          startDate = new Date(endDate.getTime() - daysRange)
          break
        case 'last30days':
          // Last 30 days: slider divides into 30 days
          const monthRange = 30 * 24 * 60 * 60 * 1000
          endDate = new Date(now.getTime() - (1 - sliderPercentage) * monthRange)
          startDate = new Date(endDate.getTime() - monthRange)
          break
        case 'last365days':
          // Last 365 days: slider divides into 12 months (~30 day increments)
          const yearRange = 365 * 24 * 60 * 60 * 1000
          endDate = new Date(now.getTime() - (1 - sliderPercentage) * yearRange)
          startDate = new Date(endDate.getTime() - yearRange)
          break
        default:
          startDate = minDate
          endDate = maxDate
      }
    }

    const filtered = uploads.filter(upload => {
      // Use capture_date if available, otherwise fall back to created_at
      const uploadDate = upload.capture_date 
        ? parseLocalDate(upload.capture_date) 
        : new Date(upload.created_at)
      return uploadDate >= startDate && uploadDate <= endDate
    })

    setFilteredUploads(filtered)
    setSelectedDate(endDate)
  }

  const getDateRangeText = () => {
    if (timeRange === 'all') return 'All Time'
    if (timeRange === 'custom') {
      if (customStartDate && customEndDate) {
        return `${format(new Date(customStartDate), 'MMM dd, yyyy')} - ${format(new Date(customEndDate), 'MMM dd, yyyy')}`
      } else if (customStartDate) {
        return `From ${format(new Date(customStartDate), 'MMM dd, yyyy')}`
      }
      return 'Custom Range'
    }

    const sliderPercentage = sliderValue[0] / 100
    const now = new Date()
    let endDate: Date

    switch (timeRange) {
      case 'last24hours':
        const hours = Math.round(sliderPercentage * 24)
        endDate = new Date(now.getTime() - (1 - sliderPercentage) * 24 * 60 * 60 * 1000)
        return hours === 24 ? `Last 24 hours` : `Last ${hours} hours`
      case 'last7days':
        const days7 = Math.round(sliderPercentage * 7)
        endDate = new Date(now.getTime() - (1 - sliderPercentage) * 7 * 24 * 60 * 60 * 1000)
        return days7 === 7 ? `Last 7 days` : `Last ${days7} days`
      case 'last30days':
        const days30 = Math.round(sliderPercentage * 30)
        endDate = new Date(now.getTime() - (1 - sliderPercentage) * 30 * 24 * 60 * 60 * 1000)
        return days30 === 30 ? `Last 30 days` : `Last ${days30} days`
      case 'last365days':
        const days365 = Math.round(sliderPercentage * 365)
        endDate = new Date(now.getTime() - (1 - sliderPercentage) * 365 * 24 * 60 * 60 * 1000)
        return days365 === 365 ? `Last 365 days` : `Last ${days365} days`
      default:
        return 'All Time'
    }
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-64px)] bg-gray-950 flex flex-col">
      {/* Controls */}
      <div className="bg-gray-900/90 border-b border-purple-900/30 shadow-md z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 space-y-2">
          {/* Search and Location Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[300px]">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                <Search className="h-3 w-3 inline mr-1" />
                Search Location
              </label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                  <form onSubmit={handleSearchSubmit} className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onFocus={() => setShowSuggestions(searchSuggestions.length > 0)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Type an address or location..."
                      className="w-full h-12 px-4 pr-28 bg-white border-2 border-blue-500 rounded-lg text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('')
                          setSearchPin(null)
                          setSearchSuggestions([])
                          setShowSuggestions(false)
                        }}
                        className="absolute right-20 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={searchLoading}
                      className="absolute right-2 top-2 bottom-2 px-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-md hover:from-purple-600 hover:to-blue-600 transition-all font-medium text-sm disabled:opacity-50"
                    >
                      {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ENTER'}
                    </button>
                  </form>

                  {showSuggestions && searchSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border-2 border-gray-200 rounded-lg shadow-lg z-50 mt-1">
                      {searchSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => selectLocation(suggestion)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-100 border-b border-gray-100 last:border-b-0 text-gray-900"
                        >
                          <div className="font-medium">{suggestion.text}</div>
                          <div className="text-sm text-gray-600">{suggestion.place_name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={centerOnUserLocation}
                  className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 transition-all duration-200 shadow-lg whitespace-nowrap font-medium text-sm"
                >
                  <Navigation className="h-4 w-4" />
                  Use My Location
                </button>
              </div>
            </div>
          </div>

          {/* Time Range Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-200">Time Range:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'last24hours', label: 'Last 24 hours' },
                { value: 'last7days', label: 'Last 7 days' },
                { value: 'last30days', label: 'Last 30 days' },
                { value: 'last365days', label: 'Last 365 days' },
                { value: 'all', label: 'All' }
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTimeRange(value as TimeRange)
                    setShowCustomDatePicker(false)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm ${
                    timeRange === value
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  setTimeRange('custom')
                  setShowCustomDatePicker(!showCustomDatePicker)
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm ${
                  timeRange === 'custom'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                <Calendar className="h-4 w-4 inline mr-1" />
                Custom Range
              </button>
            </div>
          </div>

          {/* Custom Date Picker */}
          {showCustomDatePicker && (
            <div className="bg-gray-800/50 border border-purple-900/30 rounded-lg p-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-gray-200 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-gray-200 mb-2">End Date (optional)</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <button
                  onClick={() => {
                    if (customStartDate) {
                      filterUploadsByTime()
                    }
                  }}
                  disabled={!customStartDate}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {customStartDate && !customEndDate && 'Showing media from start date to now'}
                {customStartDate && customEndDate && 'Showing media within date range'}
                {!customStartDate && 'Select a start date to filter'}
              </p>
            </div>
          )}

          {/* Time Slider - Always visible */}
          {timeRange !== 'custom' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${timeRange === 'all' ? 'text-gray-500' : 'text-gray-300'}`}>
                  <Calendar className="h-4 w-4 inline mr-1" />
                  {getDateRangeText()}
                </span>
                <span className="text-sm text-gray-400">
                  {filteredUploads.length} pins
                </span>
              </div>
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-5"
                value={sliderValue}
                onValueChange={setSliderValue}
                max={100}
                step={1}
                disabled={timeRange === 'all'}
              >
                <Slider.Track className={`relative grow rounded-full h-[3px] ${timeRange === 'all' ? 'bg-gray-800' : 'bg-gray-700'}`}>
                  <Slider.Range className={`absolute rounded-full h-full ${timeRange === 'all' ? 'bg-gray-700' : 'bg-gradient-to-r from-purple-500 to-blue-500'}`} />
                </Slider.Track>
                <Slider.Thumb
                  className={`block w-5 h-5 shadow-lg rounded-full focus:outline-none ${
                    timeRange === 'all' 
                      ? 'bg-gray-700 cursor-not-allowed border-2 border-gray-600' 
                      : 'bg-gray-900 hover:bg-gray-800 focus:shadow-xl border-2 border-purple-500 cursor-grab active:cursor-grabbing'
                  }`}
                  aria-label="Time"
                />
              </Slider.Root>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          ref={mapRef}
          center={[40.7128, -74.0060]}
          zoom={2}
          className="h-full w-full"
          style={{ height: '100%', width: '100%' }}
        >
          <MapEvents mapRef={mapRef} autoZoomTo={autoZoomLocation} />
          <TileLayer
            key={mapStyle}
            url={MAP_STYLES[mapStyle].url}
            attribution={MAP_STYLES[mapStyle].attribution}
          />
          {/* Search pin */}
          {searchPin && (
            <Marker
              position={[searchPin.lat, searchPin.lng]}
              icon={createBlueIcon()}
            >
              <Popup>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-600">Search Result</span>
                  </div>
                  <p className="text-sm">{searchPin.name}</p>
                  <button
                    onClick={() => setSearchPin(null)}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                  >
                    Remove pin
                  </button>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Upload pins - Grouped by location */}
          {Object.entries(groupedUploads).map(([locationKey, uploadsAtLocation]) => {
            const firstUpload = uploadsAtLocation[0]
            if (!firstUpload.latitude || !firstUpload.longitude) return null
            
            const currentIndex = popupIndex[locationKey] || 0
            const currentUpload = uploadsAtLocation[currentIndex]
            const hasMultiple = uploadsAtLocation.length > 1

            return (
              <Marker
                key={locationKey}
                position={[firstUpload.latitude, firstUpload.longitude]}
                icon={createRedIcon(uploadsAtLocation.length)}
              >
                <Popup className="max-w-xs">
                  <div className="space-y-3 p-1">
                    {/* Multiple uploads indicator and navigation */}
                    {hasMultiple && (
                      <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                        <button
                          onClick={() => {
                            setPopupIndex(prev => ({
                              ...prev,
                              [locationKey]: Math.max(0, currentIndex - 1)
                            }))
                          }}
                          disabled={currentIndex === 0}
                          className="text-white disabled:text-gray-600 disabled:cursor-not-allowed hover:text-purple-400 transition-colors"
                        >
                          ←
                        </button>
                        <span className="text-xs font-medium text-white">
                          {currentIndex + 1} of {uploadsAtLocation.length} at this location
                        </span>
                        <button
                          onClick={() => {
                            setPopupIndex(prev => ({
                              ...prev,
                              [locationKey]: Math.min(uploadsAtLocation.length - 1, currentIndex + 1)
                            }))
                          }}
                          disabled={currentIndex === uploadsAtLocation.length - 1}
                          className="text-white disabled:text-gray-600 disabled:cursor-not-allowed hover:text-purple-400 transition-colors"
                        >
                          →
                        </button>
                      </div>
                    )}
                    
                    {/* Media Preview */}
                    {currentUpload.file_type === 'image' ? (
                      <img
                        src={currentUpload.file_url}
                        alt={currentUpload.description}
                        className="w-full h-40 object-cover rounded-lg shadow-md"
                      />
                    ) : (
                      <video
                        src={currentUpload.file_url}
                        className="w-full h-40 object-cover rounded-lg shadow-md"
                        controls
                      />
                    )}

                    {/* Description */}
                    <p className="text-sm font-semibold text-white leading-snug">{currentUpload.description}</p>

                    {/* Verification Status and Date */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {currentUpload.ai_verification_result === null ? (
                          <>
                            <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                            <span className="text-xs font-medium text-blue-400">Verification Pending</span>
                          </>
                        ) : currentUpload.verification_status === 'verified' ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-400" />
                            <span className="text-xs font-medium text-green-400">Verified</span>
                          </>
                        ) : currentUpload.verification_status === 'potential_issues' ? (
                          <>
                            <AlertTriangle className="h-4 w-4 text-yellow-400" />
                            <span className="text-xs font-medium text-yellow-400">Potential Issues</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-gray-400" />
                            <span className="text-xs font-medium text-white">Unverified</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Date */}
                    <p className="text-xs font-medium text-white">
                      📅 {currentUpload.capture_date 
                        ? formatLocalDate(currentUpload.capture_date, 'MMM dd, yyyy • h:mm a')
                        : format(new Date(currentUpload.created_at), 'MMM dd, yyyy • h:mm a')}
                    </p>

                    {/* View Details Button */}
                    <button
                      onClick={() => {
                        setSelectedUpload(currentUpload)
                        setShowDetailModal(true)
                      }}
                      className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg"
                    >
                      View Full Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedUpload && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          onClick={() => setShowDetailModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold">Media Details</h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Large Media Display */}
              <div className="w-full">
                {selectedUpload.file_type === 'image' ? (
                  <img
                    src={selectedUpload.file_url}
                    alt={selectedUpload.description}
                    className="w-full max-h-[500px] object-contain rounded-lg shadow-lg bg-gray-100"
                  />
                ) : (
                  <video
                    src={selectedUpload.file_url}
                    className="w-full max-h-[500px] object-contain rounded-lg shadow-lg bg-gray-900"
                    controls
                    autoPlay={false}
                  />
                )}
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h3>
                <p className="text-lg text-gray-900 leading-relaxed">{selectedUpload.description}</p>
              </div>

              {/* AI Verification Status - Large and Prominent */}
              <div className={`bg-gradient-to-br rounded-xl p-6 border-2 ${
                selectedUpload.ai_verification_result === null
                  ? 'from-blue-50 to-blue-100 border-blue-200'
                  : selectedUpload.verification_status === 'verified' 
                  ? 'from-green-50 to-green-100 border-green-200'
                  : selectedUpload.verification_status === 'potential_issues'
                  ? 'from-yellow-50 to-yellow-100 border-yellow-200'
                  : 'from-gray-50 to-gray-100 border-gray-200'
              }`}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">AI Verification</h3>
                <div className="flex items-center gap-3">
                  {selectedUpload.ai_verification_result === null ? (
                    <>
                      <div className="p-3 bg-blue-100 rounded-full">
                        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-blue-700">Verification Pending</p>
                        <p className="text-sm text-gray-600">AI verification is in progress</p>
                      </div>
                    </>
                  ) : selectedUpload.verification_status === 'verified' ? (
                    <>
                      <div className="p-3 bg-green-100 rounded-full">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-green-700">Verified</p>
                        <p className="text-sm text-gray-600">This media has been verified by AI</p>
                      </div>
                    </>
                  ) : selectedUpload.verification_status === 'potential_issues' ? (
                    <>
                      <div className="p-3 bg-yellow-100 rounded-full">
                        <AlertTriangle className="h-8 w-8 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-yellow-700">Potential Issues</p>
                        <p className="text-sm text-gray-600">AI detected possible discrepancies</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-3 bg-gray-100 rounded-full">
                        <XCircle className="h-8 w-8 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-gray-700">Not Verified</p>
                        <p className="text-sm text-gray-600">This media has not been verified by AI</p>
                      </div>
                    </>
                  )}
                </div>
                {selectedUpload.ai_verification_result && (
                  <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Verification Details:</p>
                    <div className="text-sm text-gray-600 whitespace-pre-line">{selectedUpload.ai_verification_result}</div>
                  </div>
                )}
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Capture Date (Primary) */}
                <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border-2 border-purple-200">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">
                    {selectedUpload.capture_date ? 'Captured' : 'Date'}
                  </p>
                  <p className="text-base font-bold text-gray-900">
                    {selectedUpload.capture_date 
                      ? formatLocalDate(selectedUpload.capture_date, 'MMM dd, yyyy')
                      : format(new Date(selectedUpload.created_at), 'MMM dd, yyyy')}
                  </p>
                  <p className="text-sm text-gray-700 font-medium">
                    {selectedUpload.capture_date 
                      ? formatLocalDate(selectedUpload.capture_date, 'h:mm a')
                      : format(new Date(selectedUpload.created_at), 'h:mm a')}
                  </p>
                </div>

                {/* Upload Date (Secondary - only if different from capture date) */}
                {selectedUpload.capture_date && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Uploaded</p>
                    <p className="text-base font-medium text-gray-900">
                      {format(new Date(selectedUpload.created_at), 'MMM dd, yyyy')}
                    </p>
                    <p className="text-sm text-gray-600">
                      {format(new Date(selectedUpload.created_at), 'h:mm a')}
                    </p>
                  </div>
                )}

                {/* Location */}
                {selectedUpload.location_name && (
                  <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</p>
                    <p className="text-base font-medium text-gray-900">{selectedUpload.location_name}</p>
                    {selectedUpload.latitude && selectedUpload.longitude && (
                      <p className="text-xs text-gray-600 mt-1">
                        {selectedUpload.latitude.toFixed(6)}, {selectedUpload.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                )}

                {/* File Type */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Media Type</p>
                  <p className="text-base font-medium text-gray-900 capitalize">{selectedUpload.file_type}</p>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-base font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Style Selector - Fixed at bottom with proper alignment */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-purple-900/30 shadow-2xl z-[1000]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="text-sm font-medium text-gray-200">Map Style:</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(MAP_STYLES) as MapStyle[]).map(style => (
                <button
                  key={style}
                  onClick={() => setMapStyle(style)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm ${
                    mapStyle === style
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  {MAP_STYLES[style].name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custom styles for hover effect on upload pins */}
      <style jsx global>{`
        .custom-upload-pin:hover > div {
          transform: rotate(-45deg) scale(1.1);
        }
      `}</style>
    </div>
  )
}