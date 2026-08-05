import { supabase } from "@/lib/supabase";

type MessageTemplateType = "campaign" | "ai";

type GetRandomMessageVariationParams = {
  companyId: string;
  userId: string;
  type: MessageTemplateType;
  intent: string;
  lead?: any;

  /*
   * Opcional: o worker de disparo pode informar a posição do contato na fila.
   * Ex.: 0, 1, 2, 3... Isso garante o ciclo exato A, B, C, A, B, C.
   */
  sequenceIndex?: number;
};

const localCursor = new Map<string, number>();

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizePhone(value: any) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function normalizeVariableKey(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function applyVariables(text: string, lead?: any) {
  const phone = normalizePhone(
    lead?.phone ||
      lead?.telefone ||
      lead?.mobile ||
      lead?.whatsapp ||
      ""
  );

  const name =
    clean(lead?.name || lead?.nome || lead?.customer_name) ||
    "Cliente";

  const values: Record<string, any> = {
    cliente: name,
    nome: name,
    nome_cliente: name,
    telefone: phone,
    celular: phone,
    whatsapp: phone,
    email: lead?.email || "",
    empresa:
      lead?.company_name ||
      lead?.empresa ||
      lead?.nome_empresa ||
      "",
    nome_empresa:
      lead?.company_name ||
      lead?.empresa ||
      lead?.nome_empresa ||
      "",
    cnpj:
      lead?.cnpj ||
      lead?.document ||
      lead?.cpf_cnpj ||
      "",
    cpf:
      lead?.cpf ||
      lead?.document ||
      lead?.cpf_cnpj ||
      "",
    cidade: lead?.city || lead?.cidade || "",
    estado: lead?.state || lead?.estado || "",
    bairro: lead?.neighborhood || lead?.bairro || "",
    representante:
      lead?.representative_name ||
      lead?.representante ||
      lead?.seller_name ||
      "",
    vendedor:
      lead?.representative_name ||
      lead?.representante ||
      lead?.seller_name ||
      "",
    produto:
      lead?.product_name ||
      lead?.produto ||
      lead?.product ||
      "",
    categoria: lead?.category || lead?.categoria || "",
    valor: lead?.price || lead?.valor || "",
    desconto: lead?.discount || lead?.desconto || "",
    forma_pagamento:
      lead?.payment_method ||
      lead?.forma_pagamento ||
      lead?.formaPagamento ||
      "",
    data_entrega:
      lead?.delivery_date ||
      lead?.data_entrega ||
      lead?.dataEntrega ||
      "",
    pedido:
      lead?.order_number ||
      lead?.pedido ||
      "",
    cotacao:
      lead?.quote_number ||
      lead?.cotacao ||
      "",
    ticket_medio:
      lead?.average_ticket ||
      lead?.ticket_medio ||
      "",
    ultima_compra:
      lead?.last_purchase ||
      lead?.ultima_compra ||
      "",
    ultima_mensagem:
      lead?.last_message ||
      lead?.ultima_mensagem ||
      "",
    link_whatsapp: phone ? `https://wa.me/${phone}` : "",
    link_cotador:
      lead?.quote_link ||
      lead?.link_cotador ||
      lead?.link ||
      "",
  };

  for (const [key, value] of Object.entries(lead || {})) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "object"
    ) {
      continue;
    }

    const normalizedKey = normalizeVariableKey(key);

    if (!(normalizedKey in values)) {
      values[normalizedKey] = value;
    }
  }

  return String(text || "")
    .replace(
      /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g,
      (full, doubleKey, singleKey) => {
        const key = normalizeVariableKey(doubleKey || singleKey || "");
        return key in values ? String(values[key] ?? "") : full;
      }
    )
    .trim();
}

function variationText(variation: any) {
  if (typeof variation === "string") return clean(variation);

  return clean(
    variation?.message ||
      variation?.content ||
      variation?.base_message ||
      variation?.final_message ||
      ""
  );
}

function stableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

async function resolveSequenceIndex({
  companyId,
  userId,
  templateId,
  lead,
  sequenceIndex,
}: {
  companyId: string;
  userId: string;
  templateId: string;
  lead?: any;
  sequenceIndex?: number;
}) {
  if (
    sequenceIndex !== undefined &&
    sequenceIndex !== null &&
    Number.isFinite(Number(sequenceIndex))
  ) {
    return Math.max(0, Math.trunc(Number(sequenceIndex)));
  }

  const leadIndexCandidates = [
    lead?.sequence_index,
    lead?.queue_index,
    lead?.position,
    lead?.campaign_position,
  ];

  for (const candidate of leadIndexCandidates) {
    if (
      candidate !== undefined &&
      candidate !== null &&
      Number.isFinite(Number(candidate))
    ) {
      return Math.max(0, Math.trunc(Number(candidate)));
    }
  }

  /*
   * Quando o histórico registra template_id no payload, usamos a quantidade
   * já enviada como cursor persistente. Se a política RLS impedir a consulta
   * ou o worker ainda não gravar esse metadata, seguimos para o fallback.
   */
  try {
    let query = supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("direction", "sent")
      .contains("payload", { template_id: templateId });

    if (userId) {
      query = query.eq("owner_user_id", userId);
    }

    const { count, error } = await query;

    if (!error && Number(count || 0) > 0) {
      return Number(count || 0);
    }
  } catch (error) {
    console.error(
      "[getRandomMessageVariation] Falha ao consultar cursor persistente:",
      error
    );
  }

  /*
   * Fallback seguro para ambientes serverless:
   * distribui contatos diferentes entre as versões mesmo após cold start.
   */
  const identity = clean(
    lead?.id ||
      lead?.phone ||
      lead?.telefone ||
      lead?.email ||
      ""
  );

  if (identity) {
    return stableHash(identity);
  }

  const cursorKey = `${companyId}:${userId}:${templateId}`;
  const current = localCursor.get(cursorKey) || 0;
  localCursor.set(cursorKey, current + 1);

  return current;
}

export async function getRandomMessageVariation({
  companyId,
  userId,
  type,
  intent,
  lead,
  sequenceIndex,
}: GetRandomMessageVariationParams): Promise<string | null> {
  if (!companyId || !userId || !intent) {
    return null;
  }

  const { data: template, error: templateError } = await supabase
    .from("message_templates")
    .select("id, base_message, message, content, final_message")
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
    .select(
      "id, message, content, base_message, final_message, variation, sort_order, created_at"
    )
    .eq("company_id", companyId)
    .eq("template_id", template.id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (variationsError) {
    console.error(
      "[getRandomMessageVariation] Erro ao buscar variações:",
      variationsError
    );
  }

  const messages: string[] = [];

  const add = (value: any) => {
    const text = clean(value);
    if (!text || messages.includes(text)) return;
    messages.push(text);
  };

  add(
    template.base_message ||
      template.message ||
      template.content ||
      template.final_message
  );

  for (const variation of variations || []) {
    add(variationText(variation));
  }

  if (!messages.length) {
    return null;
  }

  const selectedIndex = await resolveSequenceIndex({
    companyId,
    userId,
    templateId: template.id,
    lead,
    sequenceIndex,
  });

  const selected = messages[selectedIndex % messages.length];
  const response = applyVariables(selected, lead);

  return response || null;
}
