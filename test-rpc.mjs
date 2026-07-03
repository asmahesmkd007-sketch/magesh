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
const { data, error } = await supabase.rpc('seed_daily_tournaments')
console.log("Data:", data)
console.log("Error:", error)
