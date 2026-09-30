import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { harbourData } from '@/lib/data/harbourData'
import { tackleShopProps } from '@/lib/core/harbour'
import TackleShopView from './TackleShopView'

export default async function TackleShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const props = await tackleShopProps(harbourData(createAdminClient()), user.id)

  return <TackleShopView {...props} />
}
