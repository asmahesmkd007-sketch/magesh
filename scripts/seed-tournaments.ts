import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("Seeding dummy tournaments...");
  
  const now = new Date();
  
  const startsIn1Hour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const startsIn2Hours = new Date(now.getTime() + 120 * 60 * 1000).toISOString();
  const startsIn10Mins = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const started10MinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  const tournaments = [
    {
      slug: "weekly-bullet-arena-" + Date.now(),
      name: "Weekly Bullet Arena",
      description: "Fast-paced bullet chess arena.",
      format: "arena",
      time_control: "1+0",
      starts_at: startsIn1Hour,
      max_players: 500,
      status: "upcoming",
      entry_fee_coins: 0,
      prize_1st: 1000,
      prize_2nd: 500,
      prize_3rd: 250
    },
    {
      slug: "blitz-championship-" + Date.now(),
      name: "Blitz Championship",
      description: "Show your speed in this blitz tournament.",
      format: "swiss",
      time_control: "3+2",
      starts_at: startsIn2Hours,
      max_players: 200,
      status: "locked",
      entry_fee_coins: 50,
      prize_1st: 2000,
      prize_2nd: 1000,
      prize_3rd: 500
    },
    {
      slug: "daily-rapid-" + Date.now(),
      name: "Daily Rapid Clash",
      description: "A solid rapid tournament for everyone.",
      format: "arena",
      time_control: "10+0",
      starts_at: startsIn10Mins,
      max_players: 100,
      status: "upcoming",
      entry_fee_coins: 10,
      prize_1st: 500,
      prize_2nd: 250,
      prize_3rd: 100
    },
    {
      slug: "live-blitz-bash-" + Date.now(),
      name: "Live Blitz Bash",
      description: "Currently running blitz bash!",
      format: "arena",
      time_control: "5+0",
      starts_at: started10MinsAgo,
      max_players: 1000,
      status: "live",
      entry_fee_coins: 0,
      prize_1st: 1500,
      prize_2nd: 750,
      prize_3rd: 300
    }
  ];

  const { error } = await supabase.from("tournaments").insert(tournaments);
  
  if (error) {
    console.error("Failed to seed tournaments:", error);
  } else {
    console.log("Successfully seeded 4 tournaments!");
  }
}

main();
