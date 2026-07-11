import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
);

async function test() {
  const { data, error } = await supabase.rpc("get_dynamic_leaderboard", {
    p_search: "",
    p_country: null,
    p_state: null,
    p_district: null,
    p_sort_col: "iq_desc",
    p_limit: 25,
    p_offset: 0
  });

  console.log("RPC result:", { data, error });
}

test();
