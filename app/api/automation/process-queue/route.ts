import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

type AnyRecord = Record<string, any>;

function clean(value: any) {
  return String(value ?? "").trim();
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizePhone(value: any) {
  const digits = clean(value).replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
}

function normalizeIntent(value: any) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function normalizeKanbanStatus(value: any) {
  const raw = clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  const aliases: Record<string, string> = {
    new: "novo",
    novo_lead: "novo",
    respondido: "respondeu",
    cliente_respondeu: "respondeu",
    primeiro_contato: "respondeu",

    interesse: "em_negociacao",
    negociacao: "em_negociacao",
    quer_cotacao: "em_negociacao",
    quer_agendar_entrevista: "em_negociacao",

    proposta: "cotacao_enviada",
    cotacao: "cotacao_enviada",
    orcamento_enviado: "cotacao_enviada",
    entrevista: "cotacao_enviada",
    entrevista_agendada: "cotacao_enviada",
    agendado: "cotacao_enviada",

    contratado: "pedido_fechado",
    aprovado: "pedido_fechado",
    finalizado: "pedido_fechado",
    cliente_ativo: "pedido_fechado",
    pos_venda: "pedido_fechado",

    reagendar_futuro: "cliente_inativo",
    reativar_futuro: "cliente_inativo",
    banco_talentos: "cliente_inativo",

    nao_aprovado: "perdido",
    descartado: "perdido",
  };

  const normalized = aliases[raw] || raw;

  const allowed = new Set([
    "novo",
    "enviado",
    "respondeu",
    "em_negociacao",
    "cotacao_enviada",
    "campanha",
    "cliente_inativo",
    "pedido_fechado",
    "sem_interesse",
    "perdido",
  ]);

  return allowed.has(normalized) ? normalized : null;
}

function firstText(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }

  return "";
}

function uniqueTexts(values: any[]) {
  const result: string[] = [];

  for (const value of values) {
    const text = clean(value);

    if (text && !result.includes(text)) {
      result.push(text);
    }
  }

  return result;
}

function getTemplateBaseMessage(template: AnyRecord | null) {
  if (!template) return "";

  return firstText(
    template.base_message,
    template.message,
    template.content,
    template.final_message,
    template.response
  );
}

function getVariationText(variation: AnyRecord | string) {
  if (typeof variation === "string") {
    return clean(variation);
  }

  return firstText(
    variation?.message,
    variation?.content,
    variation?.base_message,
    variation?.final_message
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceVariable(text: string, keys: string[], value: any) {
  let result = text;
  const replacement = clean(value);

  for (const key of keys) {
    const escaped = escapeRegExp(key);

    result = result
      .replace(new RegExp(`{{\\s*${escaped}\\s*}}`, "gi"), replacement)
      .replace(new RegExp(`{\\s*${escaped}\\s*}`, "gi"), replacement);
  }

  return result;
}

function applyVariables(
  text: string,
  lead: AnyRecord | null,
  item: AnyRecord,
  extra: AnyRecord = {}
) {
  const metadata =
    item?.metadata && typeof item.metadata === "object"
      ? item.metadata
      : {};

  const payload =
    item?.payload && typeof item.payload === "object"
      ? item.payload
      : {};

  const context: AnyRecord = {
    ...metadata,
    ...payload,
    ...extra,
  };

  const name = firstText(
    lead?.name,
    lead?.nome,
    item?.lead_name,
    item?.name,
    context?.nome,
    context?.name,
    "cliente"
  );

  const phone = firstText(
    lead?.phone,
    lead?.telefone,
    item?.phone,
    context?.telefone,
    context?.phone
  );

  const email = firstText(
    lead?.email,
    item?.email,
    context?.email
  );

  const company = firstText(
    lead?.company,
    lead?.empresa,
    item?.company_name,
    context?.empresa,
    context?.company,
    context?.companyName
  );

  const city = firstText(
    lead?.city,
    lead?.cidade,
    item?.city,
    context?.cidade,
    context?.city
  );

  const state = firstText(
    lead?.state,
    lead?.estado,
    item?.state,
    context?.estado,
    context?.state
  );

  const representative = firstText(
    context?.representante,
    context?.representative,
    context?.vendedor,
    context?.seller,
    item?.representative_name,
    item?.seller_name
  );

  const variables: Array<{
    keys: string[];
    value: any;
  }> = [
    { keys: ["nome", "name", "cliente", "customer"], value: name },
    { keys: ["telefone", "phone", "whatsapp"], value: phone },
    { keys: ["email", "e-mail"], value: email },
    { keys: ["empresa", "company", "company_name"], value: company },
    { keys: ["cidade", "city"], value: city },
    { keys: ["estado", "state", "uf"], value: state },
    {
      keys: ["representante", "vendedor", "seller", "representative"],
      value: representative,
    },
    {
      keys: ["cnpj", "cpf", "cnpj_cpf"],
      value: firstText(context?.cnpj, context?.cpf, context?.cnpj_cpf),
    },
    {
      keys: ["produto", "product"],
      value: firstText(context?.produto, context?.product),
    },
    {
      keys: ["categoria", "category"],
      value: firstText(context?.categoria, context?.category),
    },
    {
      keys: ["valor", "value", "price", "preco"],
      value: firstText(context?.valor, context?.value, context?.price, context?.preco),
    },
    {
      keys: ["desconto", "discount"],
      value: firstText(context?.desconto, context?.discount),
    },
    {
      keys: ["forma_pagamento", "pagamento", "payment_method"],
      value: firstText(
        context?.forma_pagamento,
        context?.pagamento,
        context?.payment_method
      ),
    },
    {
      keys: ["data_entrega", "delivery_date"],
      value: firstText(context?.data_entrega, context?.delivery_date),
    },
    {
      keys: ["pedido", "order"],
      value: firstText(context?.pedido, context?.order),
    },
    {
      keys: ["cotacao", "orcamento", "quote"],
      value: firstText(context?.cotacao, context?.orcamento, context?.quote),
    },
    {
      keys: ["ticket_medio", "average_ticket"],
      value: firstText(context?.ticket_medio, context?.average_ticket),
    },
    {
      keys: ["ultima_compra", "last_purchase"],
      value: firstText(context?.ultima_compra, context?.last_purchase),
    },
    {
      keys: ["ultima_mensagem", "last_message"],
      value: firstText(context?.ultima_mensagem, context?.last_message),
    },
    {
      keys: ["link_whatsapp", "whatsapp_link"],
      value: firstText(context?.link_whatsapp, context?.whatsapp_link),
    },
    {
      keys: ["link_cotador", "quote_link"],
      value: firstText(context?.link_cotador, context?.quote_link),
    },
  ];

  let result = String(text || "");

  for (const variable of variables) {
    result = replaceVariable(result, variable.keys, variable.value);
  }

  /*
   * Remove apenas tokens desconhecidos que sobraram. Isso evita enviar
   * literalmente "{nome}" ao cliente quando um cadastro está incompleto.
   */
  result = result
    .replace(/{{\s*[^{}]+\s*}}/g, "")
    .replace(/{\s*[^{}]+\s*}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();

  return result;
}

async function sendWhatsApp({
  sessionId,
  number,
  message,
}: {
  sessionId: number;
  number: string;
  message: string;
}) {
  const res = await fetch(`${WHATSAPP_SERVER}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: String(sessionId),
      number,
      phone: number,
      message,
    }),
  });

  const text = await res.text();
  let data: AnyRecord = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || "Erro ao enviar WhatsApp.");
  }

  return data;
}

async function sendWhatsAppMedia({
  sessionId,
  number,
  mediaUrl,
  mediaType,
  fileName,
}: {
  sessionId: number;
  number: string;
  mediaUrl: string;
  mediaType: string;
  fileName?: string;
}) {
  const res = await fetch(`${WHATSAPP_SERVER}/send-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: String(sessionId),
      number,
      phone: number,
      mediaUrl,
      mediaType,
      caption: "",
      fileName: fileName || undefined,
    }),
  });

  const text = await res.text();
  let data: AnyRecord = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || "Erro ao enviar mídia no WhatsApp.");
  }

  return data;
}

async function loadLead(
  supabase: any,
  companyId: string,
  item: AnyRecord
) {
  if (item?.lead_id) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", item.lead_id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao carregar lead: ${error.message}`);
    }

    if (data) return data;
  }

  const phone = normalizePhone(item?.phone);

  if (!phone) return null;

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .limit(500);

  if (error) {
    throw new Error(`Erro ao localizar lead por telefone: ${error.message}`);
  }

  return (
    (data || []).find(
      (lead: AnyRecord) => normalizePhone(lead?.phone) === phone
    ) || null
  );
}

async function loadCampaignTemplates(
  supabase: any,
  companyId: string,
  item: AnyRecord
) {
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", companyId)
    .eq("type", "campaign")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[QUEUE] Erro ao carregar templates:", error);
    return [];
  }

  const templates = data || [];

  if (!item?.owner_user_id) {
    return templates;
  }

  /*
   * Aceita template do próprio vendedor e template global da empresa.
   * Nunca usa template pertencente a outro vendedor.
   */
  return templates.filter(
    (template: AnyRecord) =>
      !template?.owner_user_id ||
      template.owner_user_id === item.owner_user_id
  );
}

function scoreTemplate(
  template: AnyRecord,
  item: AnyRecord,
  rawMessage: string
) {
  let score = 0;

  if (item?.template_id && template.id === item.template_id) {
    score += 1000;
  }

  /*
   * Em algumas versões antigas, campaign_id recebeu o ID do template.
   * Em outras, recebeu o ID de promotion_campaigns. Testamos sem assumir.
   */
  if (item?.campaign_id && template.id === item.campaign_id) {
    score += 900;
  }

  const itemIntent = normalizeIntent(item?.intent);
  const templateIntent = normalizeIntent(template?.intent);

  if (itemIntent && templateIntent && itemIntent === templateIntent) {
    score += 500;
  }

  const templateMessage = getTemplateBaseMessage(template);

  if (
    rawMessage &&
    templateMessage &&
    rawMessage.trim() === templateMessage.trim()
  ) {
    score += 300;
  }

  if (
    item?.owner_user_id &&
    template?.owner_user_id === item.owner_user_id
  ) {
    score += 100;
  }

  return score;
}

async function resolveCampaignTemplate(
  supabase: any,
  companyId: string,
  item: AnyRecord
) {
  const templates = await loadCampaignTemplates(
    supabase,
    companyId,
    item
  );

  if (!templates.length) return null;

  const rawMessage = clean(item?.message);

  const ranked = templates
    .map((template: AnyRecord, index: number) => ({
      template,
      index,
      score: scoreTemplate(template, item, rawMessage),
    }))
    .sort((a: AnyRecord, b: AnyRecord) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

  const winner = ranked[0];

  /*
   * Quando não existe vínculo explícito, só usamos fallback automático se
   * houver exatamente um template de campanha ativo daquele vendedor.
   */
  if (!winner || (winner.score <= 0 && templates.length > 1)) {
    return null;
  }

  return winner.template;
}

async function loadVariations(
  supabase: any,
  companyId: string,
  template: AnyRecord | null
) {
  if (!template?.id) return [];

  const { data, error } = await supabase
    .from("message_variations")
    .select("*")
    .eq("company_id", companyId)
    .eq("template_id", template.id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[QUEUE] Erro ao carregar variações:", error);
    return [];
  }

  return data || [];
}

async function getSequenceIndex(
  supabase: any,
  companyId: string,
  item: AnyRecord
) {
  const explicitIndex = Number(
    item?.sequence_index ??
      item?.variation_index ??
      item?.position
  );

  if (Number.isFinite(explicitIndex) && explicitIndex >= 0) {
    return explicitIndex;
  }

  if (item?.campaign_id && item?.created_at) {
    const { count, error } = await supabase
      .from("automation_queue")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("campaign_id", item.campaign_id)
      .lt("created_at", item.created_at);

    if (!error) {
      return Number(count || 0);
    }

    console.error("[QUEUE] Erro ao calcular sequência:", error);
  }

  if (item?.template_id && item?.created_at) {
    const { count, error } = await supabase
      .from("automation_queue")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("template_id", item.template_id)
      .lt("created_at", item.created_at);

    if (!error) {
      return Number(count || 0);
    }
  }

  return 0;
}

async function buildQueueMessage({
  supabase,
  companyId,
  item,
  lead,
}: {
  supabase: any;
  companyId: string;
  item: AnyRecord;
  lead: AnyRecord | null;
}) {
  const template = await resolveCampaignTemplate(
    supabase,
    companyId,
    item
  );

  const variations = await loadVariations(
    supabase,
    companyId,
    template
  );

  const pool = uniqueTexts([
    getTemplateBaseMessage(template),
    ...variations.map((variation: AnyRecord) =>
      getVariationText(variation)
    ),
  ]);

  const rawFallback = clean(item?.message);

  if (!pool.length && rawFallback) {
    pool.push(rawFallback);
  }

  if (!pool.length) {
    throw new Error("Item sem mensagem e sem template de campanha válido.");
  }

  const sequenceIndex = await getSequenceIndex(
    supabase,
    companyId,
    item
  );

  const selectedIndex = sequenceIndex % pool.length;
  const selectedText = pool[selectedIndex];
  const message = applyVariables(
    selectedText,
    lead,
    item
  );

  if (!message) {
    throw new Error("Mensagem ficou vazia após aplicar as variáveis.");
  }

  return {
    message,
    template,
    variations,
    selectedIndex,
    totalVariations: pool.length,
    selectedSource:
      selectedIndex === 0 && template
        ? "base"
        : template
          ? "variation"
          : "queue",
  };
}

async function claimQueueItem(
  supabase: any,
  companyId: string,
  item: AnyRecord
) {
  const timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from("automation_queue")
    .update({
      status: "processing",
      processing_at: timestamp,
      processing_started_at: timestamp,
      locked_at: timestamp,
      attempts: Number(item?.attempts || 0) + 1,
      error: null,
      last_error: null,
      updated_at: timestamp,
    })
    .eq("id", item.id)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao reservar item da fila: ${error.message}`);
  }

  return data || null;
}

async function saveSentHistory({
  supabase,
  companyId,
  item,
  lead,
  message,
  template,
  selectedIndex,
  totalVariations,
  selectedSource,
}: {
  supabase: any;
  companyId: string;
  item: AnyRecord;
  lead: AnyRecord | null;
  message: string;
  template: AnyRecord | null;
  selectedIndex: number;
  totalVariations: number;
  selectedSource: string;
}) {
  if (!lead?.id) return;

  const now = new Date().toISOString();

  const { error: messageError } = await supabase
    .from("messages")
    .insert({
      company_id: companyId,
      branch_id: item?.branch_id || lead?.branch_id || null,
      lead_id: lead.id,
      owner_user_id:
        item?.owner_user_id ||
        lead?.owner_user_id ||
        template?.owner_user_id ||
        null,
      direction: "sent",
      topic: "whatsapp",
      extension: "text",
      event: "message_sent",
      content: message,
      status: "sent",
      payload: {
        source: "automation_queue",
        queue_id: item.id,
        campaign_id: item?.campaign_id || null,
        template_id: template?.id || null,
        template_name:
          template?.name ||
          template?.title ||
          null,
        variation_index: selectedIndex,
        variation_total: totalVariations,
        variation_source: selectedSource,
        variation_counted: true,
        session_id: Number(item?.session_id || lead?.session_id || 1),
      },
      created_at: now,
      updated_at: now,
    });

  if (messageError) {
    throw new Error(
      `Mensagem enviada, mas não foi salva no Inbox: ${messageError.message}`
    );
  }

  const requestedStatus = normalizeKanbanStatus(
    template?.kanban_status ||
      item?.kanban_status ||
      item?.next_status
  );

  const nextStatus = requestedStatus || "enviado";

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      status: nextStatus,
      campaign_status: "sent",
      session_id: Number(
        item?.session_id ||
          lead?.session_id ||
          1
      ),
      last_message: message,
      last_message_at: now,
      last_campaign_at: now,
      opening_sent: true,
      updated_at: now,
    })
    .eq("id", lead.id)
    .eq("company_id", companyId);

  if (leadError) {
    throw new Error(
      `Mensagem enviada, mas o Kanban não foi atualizado: ${leadError.message}`
    );
  }
}

async function markQueueSent(
  supabase: any,
  companyId: string,
  item: AnyRecord
) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("automation_queue")
    .update({
      status: "sent",
      sent_at: now,
      finished_at: now,
      error: null,
      last_error: null,
      locked_at: null,
      worker_id: null,
      updated_at: now,
    })
    .eq("id", item.id)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(
      `Mensagem enviada, mas a fila não foi finalizada: ${error.message}`
    );
  }
}

async function markQueueError(
  supabase: any,
  companyId: string,
  item: AnyRecord,
  errorMessage: string
) {
  const now = new Date().toISOString();

  await supabase
    .from("automation_queue")
    .update({
      status: "error",
      error: errorMessage,
      last_error: errorMessage,
      finished_at: now,
      locked_at: null,
      worker_id: null,
      updated_at: now,
    })
    .eq("id", item.id)
    .eq("company_id", companyId);

  if (item?.lead_id) {
    await supabase
      .from("leads")
      .update({
        campaign_status: "error",
        updated_at: now,
      })
      .eq("id", item.lead_id)
      .eq("company_id", companyId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json().catch(() => ({}));

    const requestedLimit = Number(body?.limit || 5);
    const limit = Math.max(
      1,
      Math.min(
        Number.isFinite(requestedLimit)
          ? requestedLimit
          : 5,
        20
      )
    );

    const now = new Date().toISOString();

    const { data: items, error } = await supabase
      .from("automation_queue")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    const results: AnyRecord[] = [];

    for (const originalItem of items || []) {
      let item = originalItem;

      try {
        const claimedItem = await claimQueueItem(
          supabase,
          companyId,
          originalItem
        );

        /*
         * Outro processo pode ter reservado o mesmo item entre o SELECT e
         * este UPDATE. Nesse caso, simplesmente não duplicamos o disparo.
         */
        if (!claimedItem) {
          results.push({
            id: originalItem.id,
            status: "skipped",
            reason: "Item já reservado por outro processo.",
          });
          continue;
        }

        item = claimedItem;

        const lead = await loadLead(
          supabase,
          companyId,
          item
        );

        const number = normalizePhone(
          item?.phone ||
            lead?.phone
        );

        if (!number) {
          throw new Error("Item sem telefone.");
        }

        const built = await buildQueueMessage({
          supabase,
          companyId,
          item,
          lead,
        });

        const sessionId = Number(
          item?.session_id ||
            lead?.session_id ||
            1
        );

        await sendWhatsApp({
          sessionId,
          number,
          message: built.message,
        });

        const mediaUrl = firstText(
          built.template?.media_url,
          item?.media_url
        );

        const mediaType = firstText(
          built.template?.media_type,
          item?.media_type,
          "document"
        );

        if (mediaUrl) {
          await sendWhatsAppMedia({
            sessionId,
            number,
            mediaUrl,
            mediaType,
            fileName: firstText(
              built.template?.media_name,
              item?.media_name,
              built.template?.name
            ),
          });
        }

        await saveSentHistory({
          supabase,
          companyId,
          item,
          lead,
          message: built.message,
          template: built.template,
          selectedIndex: built.selectedIndex,
          totalVariations: built.totalVariations,
          selectedSource: built.selectedSource,
        });

        await markQueueSent(
          supabase,
          companyId,
          item
        );

        results.push({
          id: item.id,
          leadId: lead?.id || null,
          status: "sent",
          templateId: built.template?.id || null,
          variationIndex: built.selectedIndex,
          variationTotal: built.totalVariations,
          kanbanStatus:
            normalizeKanbanStatus(
              built.template?.kanban_status ||
                item?.kanban_status ||
                item?.next_status
            ) || "enviado",
        });
      } catch (error: any) {
        const message =
          error?.message ||
          "Erro ao enviar.";

        await markQueueError(
          supabase,
          companyId,
          item,
          message
        );

        results.push({
          id: item?.id,
          status: "error",
          error: message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      sent: results.filter(
        (item) => item.status === "sent"
      ).length,
      skipped: results.filter(
        (item) => item.status === "skipped"
      ).length,
      errors: results.filter(
        (item) => item.status === "error"
      ).length,
      results,
    });
  } catch (error: any) {
    console.error(
      "AUTOMATION PROCESS QUEUE:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao processar fila.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json();

    const action = clean(body?.action);

    if (!["pause", "resume"].includes(action)) {
      return NextResponse.json(
        { error: "Ação inválida." },
        { status: 400 }
      );
    }

    const currentStatus =
      action === "pause"
        ? "pending"
        : "paused";

    const nextStatus =
      action === "pause"
        ? "paused"
        : "pending";

    const { data, error } = await supabase
      .from("automation_queue")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("status", currentStatus)
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      updated: data?.length || 0,
    });
  } catch (error: any) {
    console.error(
      "AUTOMATION PROCESS QUEUE PATCH:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao atualizar fila.",
      },
      { status: 500 }
    );
  }
}
