import MapView from '@/components/map/MapView'
import { createClient } from '@/lib/supabase/server'

export default async function MapPage() {
  const supabase = await createClient()

  const { data: uploads } = await supabase
    .from('uploads')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="bg-gray-950 min-h-screen">
      <MapView initialUploads={uploads || []} />
    </div>
  )
}