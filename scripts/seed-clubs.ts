import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("Seeding dummy clubs (clans)...");

  const { data: users, error: userError } = await supabase.from("profiles").select("id").limit(1);
  if (userError || !users || users.length === 0) {
    console.error("Could not find a user to own the clubs:", userError);
    return;
  }
  
  const ownerId = users[0].id;

  const clubs = [
    {
      slug: "knights-templar-" + Date.now(),
      name: "Knights Templar",
      description: "We fight with honor and defend the king at all costs.",
      owner_id: ownerId,
      member_count: 42,
      is_public: true,
      cover_gradient: "from-amber-500 to-rose-700"
    },
    {
      slug: "grandmaster-alliance-" + Date.now(),
      name: "Grandmaster Alliance",
      description: "Only the elite. If your rating is below 2000, don't bother.",
      owner_id: ownerId,
      member_count: 12,
      is_public: true,
      cover_gradient: "from-emerald-500 to-teal-700"
    },
    {
      slug: "pawn-pushers-" + Date.now(),
      name: "Pawn Pushers Syndicate",
      description: "We love pawns, pushing them, and occasionally promoting them.",
      owner_id: ownerId,
      member_count: 156,
      is_public: true,
      cover_gradient: "from-violet-500 to-indigo-700"
    },
    {
      slug: "dragon-slayers-" + Date.now(),
      name: "Dragon Slayers",
      description: "Sicilian Dragon experts unite. Fire breathing tactics inside.",
      owner_id: ownerId,
      member_count: 88,
      is_public: true,
      cover_gradient: "from-orange-500 to-red-700"
    }
  ];

  const { error } = await supabase.from("clubs").insert(clubs);
  
  if (error) {
    console.error("Failed to seed clubs:", error);
  } else {
    console.log("Successfully seeded 4 clubs!");
  }
}

main();
