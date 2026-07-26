import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixWorldChat() {
  console.log("Checking for global channel...");
  const { data: existing, error: checkErr } = await supabase
    .from("chat_channels")
    .select("id")
    .eq("slug", "global")
    .single();

  if (checkErr && checkErr.code !== "PGRST116") {
    console.error("Error checking:", checkErr);
  }

  if (existing) {
    console.log("Global channel already exists with ID:", existing.id);
  } else {
    console.log("Global channel not found. Creating...");
    const { data: inserted, error: insertErr } = await supabase
      .from("chat_channels")
      .insert({
        type: "global",
        slug: "global",
        name: "World Chat",
        description: "Every ChessOx player, one room",
        is_private: false,
        sort_order: 1,
        icon: "🌍",
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Error creating global channel:", insertErr);
    } else {
      console.log("Successfully created global channel with ID:", inserted.id);
    }
  }
}

fixWorldChat();
