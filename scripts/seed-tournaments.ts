import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("Seeding dummy tournaments...");

  // Clear existing tournaments to avoid clutter
  console.log("Clearing existing tournaments...");
  const { error: deleteError } = await supabase
    .from("tournaments")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    console.error("Failed to clear existing tournaments:", deleteError);
  }

  const now = new Date();
  const startsIn1Hour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const started10MinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  const timeControls = ["1+0", "3+0", "5+0"];
  const coinFees = [5, 10, 20, 30, 50, 80, 100, 200, 500];

  const tournaments = [];

  // Generate the requested matrix ONLY for UPCOMING
  for (const tc of timeControls) {
    const mins = tc.split("+")[0];
    const namePrefix = mins === "1" ? "Bullet" : mins === "3" ? "Blitz" : "Rapid";

    for (const fee of coinFees) {
      const max_players = 16;
      const total_prize = fee * max_players;
      const prize_1st = Math.floor(total_prize * 0.4);
      const prize_2nd = Math.floor(total_prize * 0.25);
      const prize_3rd = Math.floor(total_prize * 0.15);

      // Create ONLY UPCOMING tournament for these coin variations
      tournaments.push({
        slug: `upcoming-${mins}min-${fee}coins-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: `${namePrefix} Arena - ${fee} Coins`,
        description: `Upcoming ${namePrefix} arena with ${fee} coin entry.`,
        format: "arena",
        time_control: tc,
        starts_at: startsIn1Hour,
        max_players,
        status: "upcoming",
        entry_fee_coins: fee,
        prize_1st,
        prize_2nd,
        prize_3rd,
      });
    }
  }

  const { error } = await supabase.from("tournaments").insert(tournaments);

  if (error) {
    console.error("Failed to seed tournaments:", error);
  } else {
    console.log(`Successfully seeded ${tournaments.length} tournaments!`);
  }
}

main();
