import Link from 'next/link'
import { MapPin, Upload, Shield, Clock } from 'lucide-react'

export default function Home() {
  return (
    <div className="flex flex-col bg-gray-950">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-100 mb-6">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Seen</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto">
            Upload geo-tagged photos and videos to create a<br />living map of moments from around the globe
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/map"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-all duration-200 shadow-lg"
            >
              Explore the Map
            </Link>
            <Link
              href="/auth"
              className="bg-gray-900/50 hover:bg-gray-800/50 text-purple-400 border-2 border-purple-600 font-bold py-3 px-8 rounded-lg text-lg transition-all duration-200"
            >
              Start Sharing
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-100 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-purple-900/50 border border-purple-600/30 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Upload className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-200">Upload Media</h3>
              <p className="text-gray-400">
                Share photos and videos with automatic GPS extraction or manual location tagging
              </p>
            </div>
            <div className="text-center">
              <div className="bg-green-900/50 border border-green-600/30 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <MapPin className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-200">Pin on Map</h3>
              <p className="text-gray-400">
                Your uploads appear as pins on an interactive global map for everyone to explore
              </p>
            </div>
            <div className="text-center">
              <div className="bg-blue-900/50 border border-blue-600/30 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Shield className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-200">AI Verification</h3>
              <p className="text-gray-400">
                Gemini AI verifies descriptions for authenticity, marked with a green checkmark
              </p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 border border-purple-600/30 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Clock className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-200">Time Travel</h3>
              <p className="text-gray-400">
                Use the time slider to explore locations through history and see how they change
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}