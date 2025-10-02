import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyContent } from '@/lib/gemini/verify'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { uploadId } = await request.json()

    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 })
    }

    // Get the upload from database
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', uploadId)
      .single()

    if (uploadError || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    // Verify content with Gemini (with all contextual data)
    let verification
    try {
      verification = await verifyContent(
        upload.description,
        upload.file_url,
        upload.file_type,
        upload.latitude,
        upload.longitude,
        upload.capture_date
      )
    } catch (verifyError) {
      const errorMessage = verifyError instanceof Error ? verifyError.message : 'Unknown verification error'
      console.error('Verification failed for upload:', uploadId, errorMessage)
      
      // Update database with error status
      await supabase
        .from('uploads')
        .update({
          ai_verified: false,
          ai_verification_result: `Verification failed: ${errorMessage}`,
          verification_status: 'unverified'
        })
        .eq('id', uploadId)
      
      return NextResponse.json({ 
        error: 'Verification failed', 
        details: errorMessage 
      }, { status: 500 })
    }

    // Format issues and verification factors for storage
    const resultText = [
      verification.result,
      verification.issues && verification.issues.length > 0 
        ? `\n\nIssues:\n${verification.issues.map(i => `• ${i}`).join('\n')}`
        : '',
      verification.verificationFactors && verification.verificationFactors.length > 0
        ? `\n\nVerification Factors:\n${verification.verificationFactors.map(v => `• ${v}`).join('\n')}`
        : ''
    ].join('').trim()

    // Update database with verification result
    const { error: updateError } = await supabase
      .from('uploads')
      .update({
        ai_verified: verification.verified,
        ai_verification_result: resultText,
        verification_status: verification.status
      })
      .eq('id', uploadId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update verification' }, { status: 500 })
    }

    return NextResponse.json({
      verified: verification.verified,
      result: verification.result
    })
  } catch (error) {
    console.error('Verification error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Batch verify all unverified uploads
    const { data: uploads, error } = await supabase
      .from('uploads')
      .select('*')
      .is('ai_verification_result', null)
      .limit(10)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 })
    }

    const results = []

    for (const upload of uploads || []) {
      try {
        const verification = await verifyContent(
          upload.description,
          upload.file_url,
          upload.file_type,
          upload.latitude,
          upload.longitude,
          upload.capture_date
        )

        const resultText = [
          verification.result,
          verification.issues && verification.issues.length > 0 
            ? `\n\nIssues:\n${verification.issues.map(i => `• ${i}`).join('\n')}`
            : '',
          verification.verificationFactors && verification.verificationFactors.length > 0
            ? `\n\nVerification Factors:\n${verification.verificationFactors.map(v => `• ${v}`).join('\n')}`
            : ''
        ].join('').trim()

        await supabase
          .from('uploads')
          .update({
            ai_verified: verification.verified,
            ai_verification_result: resultText,
            verification_status: verification.status
          })
          .eq('id', upload.id)

        results.push({
          id: upload.id,
          verified: verification.verified,
          status: verification.status,
          result: resultText
        })
      } catch (verifyError) {
        const errorMessage = verifyError instanceof Error ? verifyError.message : 'Unknown verification error'
        console.error('Batch verification failed for upload:', upload.id, errorMessage)
        
        // Update database with error status
        await supabase
          .from('uploads')
          .update({
            ai_verified: false,
            ai_verification_result: `Verification failed: ${errorMessage}`,
            verification_status: 'unverified'
          })
          .eq('id', upload.id)

        results.push({
          id: upload.id,
          verified: false,
          status: 'unverified',
          result: `Verification failed: ${errorMessage}`
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Batch verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}