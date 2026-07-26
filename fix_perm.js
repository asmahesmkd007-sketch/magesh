import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixPerm() {
  const { data, error } = await supabase
    .from("chat_channels")
    .update({ is_permanent: true })
    .eq("slug", "global");

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Updated is_permanent to true for global chat.");
  }
}

fixPerm();
