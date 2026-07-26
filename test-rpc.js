import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);
async function test() {
  // Use service role key to bypass RLS and check the table
  const adminSupabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await adminSupabase.from("friends").select("*").limit(5);
  console.log("Friends table data:", data);
  console.log("Error:", error);
}
test();
