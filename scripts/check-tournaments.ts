import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await supabase.from("tournaments").select("*");
  if (error) {
    console.error("Error fetching tournaments:", error);
  } else {
    console.log("Tournaments in DB:", data.length);
    console.log(data);
  }
}

check();
