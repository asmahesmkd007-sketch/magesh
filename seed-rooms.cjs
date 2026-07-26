require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const rooms = [
  {
    type: "global",
    slug: "global",
    name: "Global Chat",
    description: "Every ChessOx player, one room",
    is_private: false,
    is_permanent: true,
    icon: "??",
    sort_order: 1,
  },

  {
    type: "room",
    slug: "new-player-chat",
    name: "New Player Chat",
    description: "Say hello - a welcoming room for new ChessOx players",
    is_private: false,
    is_permanent: true,
    icon: "??",
    sort_order: 13,
  },
];

async function seed() {
  console.log("Inserting rooms...");
  const { data, error } = await supabase
    .from("chat_channels")
    .upsert(rooms, { onConflict: "slug" });
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success! Inserted/Updated rooms.");
  }
}
seed();
