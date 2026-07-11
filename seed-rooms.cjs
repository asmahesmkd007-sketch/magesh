
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rooms = [
  { type: 'global', slug: 'global', name: 'World Chat', description: 'Every ChessOx player, one room', is_private: false, is_permanent: true, icon: '??', sort_order: 1 },
  { type: 'room', slug: 'general-en', name: 'General Chat (English)', description: 'General chat in English', is_private: false, is_permanent: true, icon: '??', sort_order: 2 },
  { type: 'room', slug: 'general-ta', name: 'General Chat (Tamil)', description: 'General chat in Tamil', is_private: false, is_permanent: true, icon: '????', sort_order: 3 },
  { type: 'room', slug: 'general-ml', name: 'General Chat (Malayalam)', description: 'General chat in Malayalam', is_private: false, is_permanent: true, icon: '????', sort_order: 4 },
  { type: 'room', slug: 'general-te', name: 'General Chat (Telugu)', description: 'General chat in Telugu', is_private: false, is_permanent: true, icon: '????', sort_order: 5 },
  { type: 'room', slug: 'general-kn', name: 'General Chat (Kannada)', description: 'General chat in Kannada', is_private: false, is_permanent: true, icon: '????', sort_order: 6 },
  { type: 'room', slug: 'general-hi', name: 'General Chat (Hindi)', description: 'General chat in Hindi', is_private: false, is_permanent: true, icon: '????', sort_order: 7 },
  { type: 'room', slug: 'general-mr', name: 'General Chat (Marathi)', description: 'General chat in Marathi', is_private: false, is_permanent: true, icon: '????', sort_order: 8 },
  { type: 'room', slug: 'general-gu', name: 'General Chat (Gujarati)', description: 'General chat in Gujarati', is_private: false, is_permanent: true, icon: '????', sort_order: 9 },
  { type: 'room', slug: 'general-bn', name: 'General Chat (Bengali)', description: 'General chat in Bengali', is_private: false, is_permanent: true, icon: '????', sort_order: 10 },
  { type: 'room', slug: 'general-or', name: 'General Chat (Odia)', description: 'General chat in Odia', is_private: false, is_permanent: true, icon: '????', sort_order: 11 },
  { type: 'room', slug: 'general-ur', name: 'General Chat (Urdu)', description: 'General chat in Urdu', is_private: false, is_permanent: true, icon: '????', sort_order: 12 },
  { type: 'room', slug: 'new-player-chat', name: 'New Player Chat', description: 'Say hello - a welcoming room for new ChessOx players', is_private: false, is_permanent: true, icon: '??', sort_order: 13 }
];

async function seed() {
  console.log('Inserting rooms...');
  const { data, error } = await supabase.from('chat_channels').upsert(rooms, { onConflict: 'slug' });
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Inserted/Updated rooms.');
  }
}
seed();

