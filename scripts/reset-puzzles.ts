import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("Resetting all users' puzzle stats and daily completions...");

  // Reset completed_today to 0 and push daily_reset_time to tomorrow
  const { error: statsError } = await supabase
    .from("user_puzzle_stats")
    .update({
      completed_today: 0,
      daily_reset_time: new Date(Date.now() + 86400000).toISOString(),
    })
    .neq("user_id", "00000000-0000-0000-0000-000000000000"); // dummy condition to update all rows

  if (statsError) {
    console.error("Failed to reset user_puzzle_stats:", statsError);
    return;
  }

  // Delete all puzzle progress so users can get fresh puzzles
  const { error: progressError } = await supabase
    .from("puzzle_progress")
    .delete()
    .neq("user_id", "00000000-0000-0000-0000-000000000000"); // update all rows

  if (progressError) {
    console.error("Failed to delete puzzle_progress:", progressError);
    return;
  }

  console.log("Successfully reset puzzle stats and progress for all users!");
}

main();
