# Seen - Share Your World

A geo-tagged media sharing platform where users can upload photos and videos to create a living map of moments from around the globe.

## Features

- **User Authentication**: Secure sign-up and sign-in system
- **Media Upload**: Upload photos and videos with automatic GPS extraction
- **Interactive Map**: Browse uploads on an interactive global map
- **Time Travel**: Use the time slider to explore locations through history
- **AI Verification**: Google Gemini verifies content authenticity
- **User Profiles**: Manage your uploads and profile information
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage)
- **Maps**: Leaflet with React Leaflet
- **AI**: Google Gemini API
- **GPS Extraction**: exifr library
- **Time Controls**: Radix UI Slider

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- Google Cloud account with Gemini API access

### 1. Clone and Install

```bash
cd seen-app
npm install
```

### 2. Configure Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)

2. In your Supabase dashboard:
   - Go to SQL Editor
   - Copy the contents of `supabase/schema.sql`
   - Run the SQL to create tables and policies

3. Create a storage bucket:
   - Go to Storage
   - Create a new bucket called `media`
   - Make it public (for serving files)

4. Get your project credentials:
   - Go to Settings > API
   - Copy your Project URL and anon/public key

### 3. Configure Google Gemini

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create or select a project
3. Generate an API key for Gemini

### 4. Set Environment Variables

Update `.env.local` with your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Sign Up/Sign In**: Create an account or sign in to access all features
2. **Upload Media**:
   - Click "Upload" in the navigation
   - Select a photo or video
   - Add a description (max 100 characters)
   - Location is extracted from EXIF or uses your current location
3. **Explore the Map**:
   - View all uploads on the interactive map
   - Click pins to see media and details
   - Use time controls to filter by date range
4. **Manage Profile**:
   - View and edit your profile information
   - See all your uploads
   - Delete uploads you no longer want to share

## Project Structure

```
seen-app/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── verify/       # AI verification endpoint
│   ├── auth/             # Authentication page
│   ├── map/              # Map view page
│   ├── profile/          # User profile page
│   └── upload/           # Upload page
├── components/            # React components
│   ├── auth/             # Authentication components
│   ├── layout/           # Layout components (Navbar)
│   └── map/              # Map components
├── lib/                   # Utility libraries
│   ├── gemini/           # Google Gemini integration
│   └── supabase/         # Supabase client setup
├── types/                 # TypeScript type definitions
└── supabase/             # Database schema
```

## Features in Detail

### GPS Extraction
- Automatically extracts GPS coordinates from photo EXIF data
- Falls back to user's current location if no EXIF data
- Manual coordinate input as last resort

### Time Slider
- Filter uploads by time range (day, week, month, year, all)
- Smooth slider control to navigate through time
- Real-time pin updates as you move through time

### AI Verification
- Gemini AI analyzes upload descriptions
- Marks verified content with green checkmark
- Helps identify potentially misleading content

### Security
- Row Level Security (RLS) on all database tables
- Users can only modify their own data
- Soft delete for uploads (data preservation)

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Deploy to other platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- AWS Amplify
- Google Cloud Run
- Self-hosted with Node.js

## Contributing

Feel free to open issues or submit pull requests to improve the application.

## License

MIT License - feel free to use this project for your own purposes.