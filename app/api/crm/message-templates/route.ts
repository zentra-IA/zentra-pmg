import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeList(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeListToText(value: any) {
  return normalizeList(value).join("\n");
}

function cleanPhone(value: any) {
  const phone = String(value || "").replace(/\D/g, "");
  if (!phone) return null;
  if (phone.startsWith("55")) return phone;
  if (phone.length === 10 || phone.length === 11) return `55${phone}`;
  return phone;
}

const LEGACY_STATUS_MAP: Record<string, string> = {
  respondido: "respondeu",
  interesse: "em_negociacao",
  pedido: "pedido_fechado",
  orçamento: "cotacao_enviada",
  orcamento: "cotacao_enviada",
  cotacao: "cotacao_enviada",
  reativar_futuro: "cliente_inativo",
  finalizado: "pedido_fechado",

  // compatibilidade com versões antigas de RH
  quer_agendar_entrevista: "em_negociacao",
  entrevista_agendada: "cotacao_enviada",
  contratado: "pedido_fechado",
  aprovado: "pedido_fechado",
  nao_aprovado: "perdido",
};

const ALLOWED_KANBAN_STATUS = [
  "novo",
  "enviado",
  "respondeu",
  "primeiro_contato",
  "em_negociacao",
  "cotacao_enviada",
  "pedido_fechado",
  "pos_venda",
  "cliente_ativo",
  "cliente_inativo",
  "sem_interesse",
  "perdido",
  "campanha",

  // compatibilidade com dados antigos
  "quer_agendar_entrevista",
  "entrevista_agendada",
  "reagendar_futuro",
  "contratado",
  "nao_aprovado",
];

function normalizeKanbanStatus(value: any) {
  const status = clean(value);
  if (!status) return null;

  const normalized = LEGACY_STATUS_MAP[status] || status;
  return ALLOWED_KANBAN_STATUS.includes(normalized) ? normalized : null;
}

function normalizeFlowMode(value: any) {
  const mode = clean(value || "global");
  if (["sequence", "sequencia"].includes(mode)) return "sequence";
  if (["avulsa", "global"].includes(mode)) return mode;
  return "global";
}

function nullableInteger(value: any) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function bool(value: any) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function templatePayload(
  body: any,
  companyId: string,
  branchId: string | null,
  ownerUserId: string
) {
  const name = clean(body.name || body.title || body.nome);
  const title = clean(body.title || body.name || body.nome);
  const baseMessage = clean(
    body.base_message ||
      body.baseMessage ||
      body.message ||
      body.mensagem ||
      body.content ||
      body.caption
  );

  const intent = clean(body.intent || "PROSPECCAO") || "PROSPECCAO";
  const flowMode = normalizeFlowMode(body.flow_mode || body.flowMode);
  const flowStep = nullableInteger(body.flow_step || body.flowStep);
  const nextStep = nullableInteger(body.next_step || body.nextStep);
  const triggerValues = normalizeList(
    body.trigger_keywords ??
      body.triggerKeywords ??
      body.keywords ??
      body.trigger_text ??
      body.triggerText ??
      body.trigger_words ??
      body.triggerWords
  );

  const triggerKeywords = triggerValues.join("\n");

  const payload: any = {
    company_id: companyId,
    branch_id: branchId || null,
    owner_user_id: ownerUserId,

    name,
    title: title || name,

    type: clean(body.type || "campaign") || "campaign",
    intent,

    base_message: baseMessage,
    message: baseMessage,

    /*
      Mantemos os quatro campos sincronizados para compatibilidade
      com versões antigas e novas da tela.
    */
    trigger_keywords: triggerKeywords || null,
    keywords: triggerKeywords || null,
    trigger_text: triggerKeywords || null,
    trigger_words: triggerValues.length ? triggerValues : null,

    match_type: clean(body.match_type || body.matchType || "contains") || "contains",
    match_mode: clean(body.match_mode || body.matchMode || "contains") || "contains",

    media_url: clean(body.media_url || body.mediaUrl) || null,
    media_type: clean(body.media_type || body.mediaType || "text") || "text",
    media_name: clean(body.media_name || body.mediaName) || null,
    caption: clean(body.caption) || null,

    kanban_status: normalizeKanbanStatus(body.kanban_status || body.kanbanStatus),

    notify_enabled: bool(body.notify_enabled || body.notifyEnabled),
    notify_number: cleanPhone(body.notify_number || body.notifyNumber),
    notify_numbers: clean(body.notify_numbers || body.notifyNumbers) || null,
    notify_message: clean(body.notify_message || body.notifyMessage) || null,
    notify_email: clean(body.notify_email || body.notifyEmail) || null,
    notify_phone: cleanPhone(body.notify_phone || body.notifyPhone),
    notify_channel: clean(body.notify_channel || body.notifyChannel || "whatsapp") || "whatsapp",

    flow_mode: flowMode,
    flow_step: flowStep,
    next_step: nextStep,

    stage: clean(body.stage) || null,
    next_stage: clean(body.next_stage || body.nextStage) || null,
    previous_step: clean(body.previous_step || body.previousStep) || null,

    priority: nullableInteger(body.priority) || 0,
    delay_seconds: nullableInteger(body.delay_seconds || body.delaySeconds) || 0,
    use_ai: bool(body.use_ai || body.useAi),

    response_type: clean(body.response_type || body.responseType || "text") || "text",
    template_category: clean(body.template_category || body.templateCategory || "sales") || "sales",
    template_scope: clean(body.template_scope || body.templateScope || "global") || "global",

    job_id: clean(body.job_id || body.jobId) || null,
    batch_id: clean(body.batch_id || body.batchId) || null,

    active: body.active === undefined ? true : bool(body.active),

    updated_at: new Date().toISOString(),
  };

  return payload;
}

function validateTemplate(payload: any) {
  if (!payload.name && !payload.title) return "Nome da mensagem é obrigatório.";
  if (!payload.base_message && !payload.media_url) {
    return "Informe a mensagem ou uma mídia.";
  }
  if (payload.notify_enabled && !payload.notify_number && !payload.notify_numbers) {
    return "Informe o número que receberá a notificação interna.";
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);

    const intent = clean(searchParams.get("intent"));
    const active = clean(searchParams.get("active"));

    let query = supabase
      .from("message_templates")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (role === "VENDEDOR") {
      query = query.eq("owner_user_id", userId);
    }

    if (intent) query = query.eq("intent", intent);
    if (active === "true") query = query.eq("active", true);
    if (active === "false") query = query.eq("active", false);

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("GET /api/crm/message-templates:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao carregar mensagens comerciais." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const branchId = access.branchId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const payload = templatePayload(body, companyId, branchId || null, userId);
    const validationError = validateTemplate(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("message_templates")
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      template: data,
    });
  } catch (error: any) {
    console.error("POST /api/crm/message-templates:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao salvar mensagem comercial." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const branchId = access.branchId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const id = clean(body.id);

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });
    }

    let existingQuery = supabase
      .from("message_templates")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId);

    if (role === "VENDEDOR") {
      existingQuery = existingQuery.eq("owner_user_id", userId);
    }

    const { data: existing, error: existingError } =
      await existingQuery.maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (!existing) {
      return NextResponse.json(
        { error: "Mensagem não encontrada ou não pertence ao usuário atual." },
        { status: 404 }
      );
    }

    const mergedBody = {
      ...existing,
      ...body,
      trigger_keywords:
        body.trigger_keywords !== undefined
          ? body.trigger_keywords
          : body.trigger_text !== undefined
            ? body.trigger_text
            : body.keywords !== undefined
              ? body.keywords
              : body.trigger_words !== undefined
                ? body.trigger_words
                : existing.trigger_keywords ??
                  existing.trigger_text ??
                  existing.keywords ??
                  existing.trigger_words ??
                  "",
    };

    const payload = templatePayload(
      mergedBody,
      companyId,
      branchId || existing.branch_id || null,
      role === "VENDEDOR" ? userId : existing.owner_user_id || userId
    );

    delete payload.company_id;
    delete payload.branch_id;
    delete payload.owner_user_id;
    delete payload.created_at;

    const validationError = validateTemplate({
      ...payload,
      name: payload.name || "Mensagem",
    });

    if (validationError && body.base_message !== undefined) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    let updateQuery = supabase
      .from("message_templates")
      .update(payload)
      .eq("id", id)
      .eq("company_id", companyId);

    if (role === "VENDEDOR") {
      updateQuery = updateQuery.eq("owner_user_id", userId);
    }

    const { data, error } = await updateQuery
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      template: data,
    });
  } catch (error: any) {
    console.error("PATCH /api/crm/message-templates:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar mensagem comercial." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = clean(searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });
    }

    let deleteQuery = supabase
      .from("message_templates")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (role === "VENDEDOR") {
      deleteQuery = deleteQuery.eq("owner_user_id", userId);
    }

    const { error } = await deleteQuery;

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/crm/message-templates:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao excluir mensagem comercial." },
      { status: 500 }
    );
  }
}
