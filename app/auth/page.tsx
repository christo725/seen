import AuthForm from '@/components/auth/AuthForm'

export default function AuthPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-950 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <AuthForm />
    </div>
  )
}