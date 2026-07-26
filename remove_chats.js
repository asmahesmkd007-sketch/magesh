import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function removeRegionalChats() {
  console.log("Removing regional general chats...");
  const { data, error } = await supabase.from("chat_channels").delete().like("slug", "general-%");

  if (error) {
    console.error("Error deleting:", error);
  } else {
    console.log("Successfully deleted regional chats.");
  }

  console.log("Renaming World Chat to Global Chat...");
  const { data: updateData, error: updateErr } = await supabase
    .from("chat_channels")
    .update({ name: "Global Chat" })
    .eq("slug", "global");

  if (updateErr) {
    console.error("Error updating global chat:", updateErr);
  } else {
    console.log("Successfully renamed World Chat to Global Chat.");
  }
}

removeRegionalChats();
