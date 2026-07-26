import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkChannels() {
  const { data, error } = await supabase
    .from("chat_channels")
    .select("id, slug, name, type, is_private, is_permanent");

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Channels:", data);
  }
}

checkChannels();
