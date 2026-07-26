import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function check() {
  console.log("Calling transition_locked_tournaments...");
  const { data, error } = await supabase.rpc("transition_locked_tournaments");
  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("RPC Success. Data:", data);
  }

  const { data: mData } = await supabase.from("tournament_matches").select("*").limit(5);
  console.log("Matches created:", mData?.length);
}

check();
