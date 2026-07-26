import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://nejrwpnnuylcrcbpklsv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lanJ3cG5udXlsY3JjYnBrbHN2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIxNjUyNiwiZXhwIjoyMDk3NzkyNTI2fQ.Y5dMQqjBjH1YCsgoyvsvN7DWmY2yq1xMB8dnHWVnC8Y",
);

async function main() {
  console.log("Checking chat channels...");
  const { data: channels, error: channelsError } = await supabase
    .from("chat_channels")
    .select("id, name, type, is_private")
    .eq("name", "World Chat");

  console.log("Channels:", channels, channelsError);

  console.log("Checking community posts...");
  const { data: posts, error: postsError } = await supabase
    .from("community_posts")
    .select("id, user_id, content")
    .limit(1);

  console.log("Posts:", posts, postsError);
}

main().catch(console.error);
