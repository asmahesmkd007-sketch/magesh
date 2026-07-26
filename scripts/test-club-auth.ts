import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
);
const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function test() {
  // 1. Create a fake user
  const email = `testuser_${Date.now()}@example.com`;
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password: "password123",
  });

  if (authErr) {
    console.log("Signup error:", authErr.message);
    return;
  }

  const user = authData.user;
  if (!user) return console.log("No user returned");

  // Since KYC/email confirmation might be required, we auto-confirm it via admin
  await admin.auth.admin.updateUserById(user.id, { email_confirm: true });

  // Re-login to get a valid session
  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email,
    password: "password123",
  });

  if (loginErr) return console.log("Login error:", loginErr.message);

  console.log("Logged in as", user.id);

  // Attempt to create a club
  const slug = "test-club-" + Date.now();
  const { data, error } = await supabase
    .from("clubs")
    .insert({ name: "Test Club", slug, owner_id: user.id })
    .select("id,slug,name,description,member_count,cover_gradient,created_at")
    .maybeSingle();

  console.log("Insert result:", {
    data,
    error: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  });

  // Cleanup
  await admin.auth.admin.deleteUser(user.id);
}

test();
