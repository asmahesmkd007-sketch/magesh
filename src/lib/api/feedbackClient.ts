import { supabase } from "@/integrations/supabase/client";

export type FeedbackRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  rating: number;
  message: string;
};

export async function submitFeedback(userId: string | null, rating: number, message: string) {
  const { error } = await supabase
    .from("feedbacks")
    .insert({ user_id: userId, rating, message });
  
  if (error) throw new Error(error.message);
}

export async function getFeedbacks(): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from("feedbacks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as FeedbackRow[];
}
