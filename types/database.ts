export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      uploads: {
        Row: {
          id: string
          user_id: string
          file_url: string
          file_type: 'image' | 'video'
          description: string
          latitude: number | null
          longitude: number | null
          location_source: 'exif' | 'user_location' | 'manual'
          location_name: string | null
          capture_date: string | null
          ai_verified: boolean
          ai_verification_result: string | null
          verification_status: 'unverified' | 'verified' | 'potential_issues'
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          file_url: string
          file_type: 'image' | 'video'
          description: string
          latitude?: number | null
          longitude?: number | null
          location_source?: 'exif' | 'user_location' | 'manual'
          location_name?: string | null
          capture_date?: string | null
          ai_verified?: boolean
          ai_verification_result?: string | null
          verification_status?: 'unverified' | 'verified' | 'potential_issues'
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          file_url?: string
          file_type?: 'image' | 'video'
          description?: string
          latitude?: number | null
          longitude?: number | null
          location_source?: 'exif' | 'user_location' | 'manual'
          location_name?: string | null
          capture_date?: string | null
          ai_verified?: boolean
          ai_verification_result?: string | null
          verification_status?: 'unverified' | 'verified' | 'potential_issues'
          created_at?: string
          deleted_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      file_type: 'image' | 'video'
      location_source: 'exif' | 'user_location' | 'manual'
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Upload = Database['public']['Tables']['uploads']['Row']
export type InsertUpload = Database['public']['Tables']['uploads']['Insert']
export type UpdateUpload = Database['public']['Tables']['uploads']['Update']