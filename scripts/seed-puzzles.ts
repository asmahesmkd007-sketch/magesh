import { createClient } from "@supabase/supabase-js";
import { PUZZLES } from "../src/lib/chess/puzzles";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log(`Found ${PUZZLES.length} puzzles to seed.`);

  // public.puzzles.id is a TEXT primary key with no DEFAULT (must be
  // supplied) and .moves is TEXT[] (must be an array, not a joined string)
  // — see supabase/schema.sql's PUZZLE LIBRARY EXPANSION section.
  const items = PUZZLES.map((p) => ({
    id: p.id,
    fen: p.fen,
    moves: p.moves,
    rating: p.rating,
    theme: p.theme,
    category: p.category,
    goal: p.goal,
    difficulty: p.difficulty,
    explanation: p.explanation,
    themes: p.themes,
    enabled: true,
  }));

  const { error } = await supabase.from("puzzles").upsert(items, { onConflict: "id" });

  if (error) {
    console.error("Failed to seed puzzles:", error);
  } else {
    console.log("Successfully seeded puzzles!");
  }
}

main();
