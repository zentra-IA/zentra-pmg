import { supabase } from "@/lib/supabase";

function applyVariables(text: string, lead?: any) {
  return String(text || "")
    .replaceAll("{nome}", lead?.name || lead?.nome || "tudo bem")
    .replaceAll("{telefone}", lead?.phone || lead?.telefone || "")
    .trim();
}

export async function getRandomMessageVariation({
  type,
  intent,
  lead,
}: {
  type: "campaign" | "ai";
  intent: string;
  lead?: any;
}) {
  const { data: template } = await supabase
    .from("message_templates")
    .select("id, base_message")
    .eq("type", type)
    .eq("intent", intent)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!template) return null;

  const { data: variations } = await supabase
    .from("message_variations")
    .select("content")
    .eq("template_id", template.id)
    .eq("active", true);

  const list = variations?.length
    ? variations.map((v) => v.content)
    : [template.base_message];

  const selected = list[Math.floor(Math.random() * list.length)];

  return applyVariables(selected, lead);
}