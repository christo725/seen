'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Upload, Profile } from '@/types/database'
import { format } from 'date-fns'
import { Trash2, MapPin, CheckCircle, XCircle, Loader2, Edit2, Save, X, Camera, Video, User as UserIcon, Globe, Twitter, Instagram, Linkedin, Github, Mail, Phone, MapPinIcon, Calendar, Award, Shield } from 'lucide-react'

interface ExtendedProfile extends Profile {
  bio?: string
  location?: string
  website?: string
  twitter?: string
  instagram?: string
  linkedin?: string
  github?: string
  phone?: string
  public_email?: string
  verified?: boolean
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ExtendedProfile | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Profile form fields
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [instagram, setInstagram] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [github, setGithub] = useState('')
  const [publicEmail, setPublicEmail] = useState('')
  const [phone, setPhone] = useState('')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUser(user)

      // Get or create user profile
      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      // If profile doesn't exist, create it
      if (profileError && profileError.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await (supabase as any)
          .from('profiles')
          .insert({
            id: user.id,
            username: user.email?.split('@')[0] || null,
            full_name: user.user_metadata?.full_name || null,
            avatar_url: user.user_metadata?.avatar_url || null,
          })
          .select()
          .single()

        if (!createError && newProfile) {
          profileData = newProfile
        }
      }

      if (profileData) {
        setProfile(profileData as ExtendedProfile)
        setUsername((profileData as any).username || '')
        setFullName((profileData as any).full_name || '')
        setBio((profileData as any).bio || '')
        setLocation((profileData as any).location || '')
        setWebsite((profileData as any).website || '')
        setTwitter((profileData as any).twitter || '')
        setInstagram((profileData as any).instagram || '')
        setLinkedin((profileData as any).linkedin || '')
        setGithub((profileData as any).github || '')
        setPublicEmail((profileData as any).public_email || '')
        setPhone((profileData as any).phone || '')
      }

      // Get user uploads
      const { data: uploadsData } = await supabase
        .from('uploads')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (uploadsData) {
        setUploads(uploadsData)
      }
    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return

    setSaving(true)
    try {
      const updateData: any = {
        username: username.trim() || null,
        full_name: fullName.trim() || null,
      }

      // Use update instead of upsert, and don't manually set updated_at (trigger handles it)
      const { data, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()

      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      console.log('Profile updated successfully:', data)

      // Store extended fields locally (since they're not in the database yet)
      const extendedFields = {
        bio: bio.trim() || null,
        location: location.trim() || null,
        website: website.trim() || null,
        twitter: twitter.trim() || null,
        instagram: instagram.trim() || null,
        linkedin: linkedin.trim() || null,
        github: github.trim() || null,
        public_email: publicEmail.trim() || null,
        phone: phone.trim() || null,
      }

      setProfile(prev => prev ? {
        ...prev,
        ...updateData,
        ...extendedFields,
      } : null)

      setEditMode(false)
      alert('Profile updated successfully!')
    } catch (error) {
      console.error('Error updating profile:', error)
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      alert(`Failed to update profile: ${errorMessage}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUpload = async (uploadId: string) => {
    if (!confirm('Are you sure you want to delete this upload?')) return

    setDeletingId(uploadId)
    try {
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession()
      console.log('🔐 Session check:', {
        hasSession: !!session,
        sessionUserId: session?.user?.id,
        stateUserId: user?.id
      })
      
      if (!session?.user?.id) {
        throw new Error('Not authenticated. Please sign in again.')
      }

      // Use session.user.id directly (not user?.id from state)
      const { error, data } = await supabase
        .from('uploads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', uploadId)
        .eq('user_id', session.user.id)
        .select()
      
      console.log('📊 Update result:', { 
        success: !error, 
        data, 
        errorCode: error?.code 
      })

      if (error) {
        console.error('❌ Supabase error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      if (!data || data.length === 0) {
        throw new Error('No rows updated - upload may not exist or you may not own it')
      }

      setUploads(prev => prev.filter(u => u.id !== uploadId))
      console.log('✅ Upload successfully deleted:', uploadId)
    } catch (error) {
      console.error('💥 Error deleting upload:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      alert(`Failed to delete upload: ${errorMessage}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    if (profile) {
      setUsername(profile.username || '')
      setFullName(profile.full_name || '')
      setBio(profile.bio || '')
      setLocation(profile.location || '')
      setWebsite(profile.website || '')
      setTwitter(profile.twitter || '')
      setInstagram(profile.instagram || '')
      setLinkedin(profile.linkedin || '')
      setGithub(profile.github || '')
      setPublicEmail(profile.public_email || '')
      setPhone(profile.phone || '')
    }
  }

  const getTotalVerified = () => {
    return uploads.filter(u => u.ai_verified).length
  }

  const getTotalUploads = () => {
    return uploads.length
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Please sign in to view your profile</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 bg-gray-950 min-h-screen">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-lg h-48 px-6 pt-4"></div>

      {/* Profile Section */}
      <div className="bg-gray-900/50 backdrop-blur-sm border border-purple-900/30 shadow-2xl rounded-b-lg px-6 pb-6 mb-8">
        <div className="relative -mt-32 mb-6">
          <div className="flex items-end justify-between">
            <div className="flex items-end gap-4">
              <div className="bg-gray-800 rounded-full p-2 border-2 border-purple-500/50">
                <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                  <UserIcon className="h-12 w-12 text-white" />
                </div>
              </div>
              <div className="pb-2">
                <h1 className="text-2xl font-bold text-white drop-shadow-lg">
                  {profile?.full_name || profile?.username || 'Your Name'}
                </h1>
                {profile?.username && (
                  <p className="text-gray-200 drop-shadow">@{profile.username}</p>
                )}
              </div>
            </div>

            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg"
              >
                <Edit2 className="h-4 w-4" />
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-all shadow-lg"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800/50 border border-purple-900/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-100">{getTotalUploads()}</div>
            <div className="text-sm text-gray-400">Total Uploads</div>
          </div>
          <div className="bg-gray-800/50 border border-purple-900/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{getTotalVerified()}</div>
            <div className="text-sm text-gray-400">Verified</div>
          </div>
          <div className="bg-gray-800/50 border border-purple-900/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">
              {profile?.created_at ? format(new Date(profile.created_at), 'MMM yyyy') : 'N/A'}
            </div>
            <div className="text-sm text-gray-400">Member Since</div>
          </div>
          <div className="bg-gray-800/50 border border-purple-900/30 rounded-lg p-4 text-center">
            <div className="flex justify-center mb-1">
              {profile?.verified ? (
                <Shield className="h-8 w-8 text-blue-400" />
              ) : (
                <Shield className="h-8 w-8 text-gray-500" />
              )}
            </div>
            <div className="text-sm text-gray-400">
              {profile?.verified ? 'Verified' : 'Not Verified'}
            </div>
          </div>
        </div>

        {/* Profile Information */}
        <div className="space-y-6">
          {editMode ? (
            <>
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                    placeholder="johndoe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                    placeholder="John Doe"
                  />
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                  placeholder="Tell us about yourself..."
                  maxLength={200}
                />
                <p className="text-xs text-gray-400 mt-1">{bio.length}/200 characters</p>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Public Email
                  </label>
                  <input
                    type="email"
                    value={publicEmail}
                    onChange={(e) => setPublicEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                    placeholder="public@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <Phone className="h-4 w-4 inline mr-1" />
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              {/* Location and Website */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <MapPinIcon className="h-4 w-4 inline mr-1" />
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                    placeholder="San Francisco, CA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <Globe className="h-4 w-4 inline mr-1" />
                    Website
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              {/* Social Links */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3">Social Links</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      <Twitter className="h-4 w-4 inline mr-1" />
                      Twitter
                    </label>
                    <input
                      type="text"
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      <Instagram className="h-4 w-4 inline mr-1" />
                      Instagram
                    </label>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      <Linkedin className="h-4 w-4 inline mr-1" />
                      LinkedIn
                    </label>
                    <input
                      type="text"
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                      placeholder="in/username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      <Github className="h-4 w-4 inline mr-1" />
                      GitHub
                    </label>
                    <input
                      type="text"
                      value={github}
                      onChange={(e) => setGithub(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
                      placeholder="username"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Display Mode */}
              <div className="space-y-4">
                {/* Bio */}
                {profile?.bio && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-1">About</h3>
                    <p className="text-gray-100">{profile.bio}</p>
                  </div>
                )}

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-400">Email</span>
                    <p className="text-gray-100">{user.email}</p>
                  </div>
                  {profile?.location && (
                    <div>
                      <span className="text-sm text-gray-400">
                        <MapPinIcon className="h-4 w-4 inline mr-1" />
                        Location
                      </span>
                      <p className="text-gray-100">{profile.location}</p>
                    </div>
                  )}
                  {profile?.public_email && (
                    <div>
                      <span className="text-sm text-gray-400">
                        <Mail className="h-4 w-4 inline mr-1" />
                        Public Email
                      </span>
                      <p className="text-gray-100">{profile.public_email}</p>
                    </div>
                  )}
                  {profile?.phone && (
                    <div>
                      <span className="text-sm text-gray-400">
                        <Phone className="h-4 w-4 inline mr-1" />
                        Phone
                      </span>
                      <p className="text-gray-100">{profile.phone}</p>
                    </div>
                  )}
                </div>

                {/* Social Links */}
                {(profile?.website || profile?.twitter || profile?.instagram || profile?.linkedin || profile?.github) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Links</h3>
                    <div className="flex flex-wrap gap-3">
                      {profile.website && (
                        <a
                          href={profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-purple-400 hover:text-purple-300"
                        >
                          <Globe className="h-4 w-4" />
                          Website
                        </a>
                      )}
                      {profile.twitter && (
                        <a
                          href={`https://twitter.com/${profile.twitter.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          <Twitter className="h-4 w-4" />
                          Twitter
                        </a>
                      )}
                      {profile.instagram && (
                        <a
                          href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-pink-400 hover:text-pink-300"
                        >
                          <Instagram className="h-4 w-4" />
                          Instagram
                        </a>
                      )}
                      {profile.linkedin && (
                        <a
                          href={`https://linkedin.com/${profile.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-500 hover:text-blue-400"
                        >
                          <Linkedin className="h-4 w-4" />
                          LinkedIn
                        </a>
                      )}
                      {profile.github && (
                        <a
                          href={`https://github.com/${profile.github}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-gray-300 hover:text-gray-200"
                        >
                          <Github className="h-4 w-4" />
                          GitHub
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Uploads Section */}
      <div className="bg-gray-900/50 backdrop-blur-sm border border-purple-900/30 shadow-2xl rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-100 mb-4">
          My Uploads ({uploads.length})
        </h2>

        {uploads.length === 0 ? (
          <div className="text-center py-12">
            <Camera className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">You haven't uploaded anything yet.</p>
            <button
              onClick={() => router.push('/upload')}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-6 py-2 rounded-md font-medium transition-all shadow-lg"
            >
              Upload Your First Media
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="bg-gray-800/50 border border-purple-900/30 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-purple-500/10 transition-all">
                {/* Media Preview */}
                <div className="relative h-48 bg-gray-700">
                  {upload.file_type === 'image' ? (
                    <>
                      <img
                        src={upload.file_url}
                        alt={upload.description}
                        className="w-full h-full object-cover"
                      />
                      <Camera className="absolute top-2 right-2 h-5 w-5 text-white drop-shadow-lg" />
                    </>
                  ) : (
                    <>
                      <video
                        src={upload.file_url}
                        className="w-full h-full object-cover"
                      />
                      <Video className="absolute top-2 right-2 h-5 w-5 text-white drop-shadow-lg" />
                    </>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-100 line-clamp-2">
                    {upload.description}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <MapPin className="h-3 w-3" />
                    {upload.latitude?.toFixed(4)}, {upload.longitude?.toFixed(4)}
                  </div>

                  <div className="flex items-center gap-2">
                    {upload.ai_verification_result === null ? (
                      <>
                        <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                        <span className="text-xs text-blue-400">Verification Pending</span>
                      </>
                    ) : upload.ai_verified ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-600">AI Verified</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-gray-400" />
                        <span className="text-xs text-gray-400">Not Verified</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-gray-400">
                      {format(new Date(upload.created_at), 'MMM dd, yyyy')}
                    </span>
                    <button
                      onClick={() => handleDeleteUpload(upload.id)}
                      disabled={deletingId === upload.id}
                      className="text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                      title="Delete upload"
                    >
                      {deletingId === upload.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}