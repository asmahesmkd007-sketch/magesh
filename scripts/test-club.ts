import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  // Removed invalid call
  
  // Or just insert without auth if we bypass RLS using service_role!
  // Wait, owner_id must be a valid user id because of the foreign key constraint to auth.users.
  
  // Let's get the first user id:
  const { data: users } = await supabase.auth.admin.listUsers();
  if (users.users.length === 0) return console.log("No users found");
  
  const ownerId = users.users[0].id;

  const { data, error } = await supabase
    .from("clubs")
    .insert({ name: "Test Club", slug: "test-club", owner_id: ownerId });
    
  console.log("Result:", { data, error });
}

test();
