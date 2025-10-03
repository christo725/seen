'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        setMessage('Check your email for the confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/map')
        router.refresh()
      }
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://seen-livid.vercel.app/auth/reset-password',
      })
      if (error) throw error
      setMessage('Check your email for the password reset link!')
      setIsForgotPassword(false)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={isForgotPassword ? handleForgotPassword : handleAuth} className="bg-gray-900/50 border border-purple-900/30 shadow-lg rounded-lg px-8 pt-6 pb-8 mb-4">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-100">
          {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Sign In'}
        </h2>

        {error && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-900/50 border border-green-500/50 text-green-400 px-4 py-3 rounded mb-4">
            {message}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-gray-200 text-sm font-bold mb-2" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="shadow appearance-none bg-gray-800 border border-gray-600 rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="you@example.com"
            required
          />
        </div>

        {!isForgotPassword && (
          <div className="mb-6">
            <label className="block text-gray-200 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="shadow appearance-none bg-gray-800 border border-gray-600 rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
        )}

        {isForgotPassword && (
          <div className="mb-6">
            <p className="text-gray-300 text-sm">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed w-full transition-all duration-200 shadow-lg"
          >
            {loading ? 'Loading...' : isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        <div className="mt-4 text-center space-y-2">
          {!isForgotPassword && (
            <>
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-purple-400 hover:text-purple-300 text-sm transition-colors block w-full"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>

              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-purple-400 hover:text-purple-300 text-sm transition-colors block w-full"
                >
                  Forgot your password?
                </button>
              )}
            </>
          )}

          {isForgotPassword && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false)
                setError(null)
                setMessage(null)
              }}
              className="text-purple-400 hover:text-purple-300 text-sm transition-colors block w-full"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </form>
    </div>
  )
}