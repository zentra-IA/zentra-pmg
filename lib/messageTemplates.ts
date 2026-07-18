import { supabase } from "@/lib/supabase";

type MessageTemplateType = "campaign" | "ai";

type GetRandomMessageVariationParams = {
  companyId: string;
  userId: string;
  type: MessageTemplateType;
  intent: string;
  lead?: any;
};

function applyVariables(text: string, lead?: any) {
  return String(text || "")
    .replaceAll("{nome}", lead?.name || lead?.nome || "tudo bem")
    .replaceAll("{telefone}", lead?.phone || lead?.telefone || "")
    .trim();
}

export async function getRandomMessageVariation({
  companyId,
  userId,
  type,
  intent,
  lead,
}: GetRandomMessageVariationParams): Promise<string | null> {
  if (!companyId || !userId || !intent) {
    return null;
  }

  const { data: template, error: templateError } = await supabase
    .from("message_templates")
    .select("id, base_message")
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .eq("type", type)
    .eq("intent", intent)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (templateError) {
    console.error(
      "[getRandomMessageVariation] Erro ao buscar mensagem criada:",
      templateError
    );
    return null;
  }

  if (!template) {
    return null;
  }

  const { data: variations, error: variationsError } = await supabase
    .from("message_variations")
    .select("content")
    .eq("company_id", companyId)
    .eq("template_id", template.id)
    .eq("active", true);

  if (variationsError) {
    console.error(
      "[getRandomMessageVariation] Erro ao buscar variações:",
      variationsError
    );
    return null;
  }

  const messages = variations?.length
    ? variations
        .map((variation) => String(variation.content || "").trim())
        .filter(Boolean)
    : [String(template.base_message || "").trim()].filter(Boolean);

  if (!messages.length) {
    return null;
  }

  const selected =
    messages[Math.floor(Math.random() * messages.length)];

  const response = applyVariables(selected, lead);

  return response || null;
}
