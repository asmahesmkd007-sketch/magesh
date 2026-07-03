import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line.includes('='))
    .map(line => {
      const [key, ...val] = line.split('=')
      return [key.trim(), val.join('=').trim().replace(/^"|"$/g, '')]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
const { data, error } = await supabase
  .from('tournaments')
  .select('id,name,format,prize_pool,starts_at,status,player_count,max_players,cover_gradient,time_control,entry_fee_coins,prize_1st,prize_2nd,prize_3rd,created_at')
  .in('status', ['upcoming', 'locked', 'live'])
console.log("Data length:", data?.length)
console.log("Data:", data)
console.log("Error:", error)
