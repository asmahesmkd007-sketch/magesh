import { createClient } from "@supabase/supabase-js";
import { PUZZLES } from "../src/lib/chess/puzzles";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log(`Found ${PUZZLES.length} puzzles to seed.`);
  
  const items = PUZZLES.map((p) => ({
    fen: p.fen,
    moves: p.moves.join(" "),
    rating: p.rating,
    theme: p.theme,
    category: p.category,
    goal: p.goal,
    difficulty: p.difficulty,
    explanation: p.explanation,
    themes: p.themes,
    enabled: true
  }));

  const { error } = await supabase.from("puzzles").insert(items);
  
  if (error) {
    console.error("Failed to seed puzzles:", error);
  } else {
    console.log("Successfully seeded puzzles!");
  }
}

main();
