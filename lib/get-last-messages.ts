import { supabase } from "@/lib/supabase";

export async function getLastMessages(
  contactId: string,
  limit = 10
) {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []).reverse();
}