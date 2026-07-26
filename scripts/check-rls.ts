import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function check() {
  const { data, error } = await supabase.from("tournaments").select("id").limit(1); // Test with anonymous key to see if it works? No, I'm using service key here.

  // Let's create an anonymous client to test RLS
  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!,
  );

  const { data: anonData, error: anonError } = await anonClient.from("tournaments").select("*");
  console.log("Anon data length:", anonData?.length, "Error:", anonError);
}

check();
