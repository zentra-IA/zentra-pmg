import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || "";
const DEFAULT_BRANCH_ID = process.env.DEFAULT_BRANCH_ID || null;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "http://localhost:3000";

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

function onlyDigits(value: any) {
  return clean(value).replace(/\D/g, "");
}
function normalizePhone(value: any) {
  let digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";

  // Se vier @lid ou ID interno muito longo, não trata como telefone
  if (digits.length > 13) return "";

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  // Brasil: 55 + DDD + número
  if (digits.length < 12 || digits.length > 13) return "";

  return digits;
}

function isRealBrazilPhone(value: any) {
  const phone = normalizePhone(value);

  if (!phone) return false;
  if (!phone.startsWith("55")) return false;

  // Brasil: 55 + DDD + número, normalmente 12 ou 13 dígitos
  if (phone.length < 12 || phone.length > 13) return false;

  // Bloqueia IDs internos longos do WhatsApp/LID
  if (phone.length > 13) return false;

  return true;
}

function normalizeLid(value: any) {
  const text = clean(value);
  if (!text) return null;
  if (text.includes("@lid") || text.includes("@s.whatsapp.net")) return text;
  return null;
}

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIncomingMessageId(body: any) {
  return (
    body?.messageId ||
    body?.message_id ||
    body?.id ||
    body?.key?.id ||
    body?.data?.key?.id ||
    null
  );
}

function normalizeSessionNumber(value: any) {
  const session = clean(value || "1");
  const match = session.match(/_(\d+)$/);
  if (match) return Number(match[1]);

  const n = Number(onlyDigits(session) || 1);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 1;
  return n;
}

function buildSendSession(companyId: string, userId: string | null | undefined, sessionId: number | string) {
  if (userId) return `${companyId}_${userId}_${sessionId}`;
  return `${companyId}_${sessionId}`;
}

async function resolveCompanyBySession(supabase: any, incomingSession: any) {
  const sessionId = normalizeSessionNumber(incomingSession);
  const raw = clean(incomingSession);
  const parts = raw.split("_").filter(Boolean);

  // Novo padrão multiusuário: companyId_userId_sessionNumber
  if (parts.length >= 3) {
    const sessionNumber = Number(parts[parts.length - 1]);
    const userId = parts[parts.length - 2] || null;
    const companyId = parts.slice(0, -2).join("_") || null;

    if (companyId && userId && Number.isFinite(sessionNumber)) {
      return {
        companyId,
        userId,
        branchId: DEFAULT_BRANCH_ID,
        sessionId: sessionNumber,
      };
    }
  }

  // Compatibilidade com sessões antigas: companyId_sessionNumber
  const legacyParts = raw.match(/^(.+)_(\d+)$/);
  if (legacyParts?.[1]) {
    return {
      companyId: legacyParts[1],
      userId: null,
      branchId: DEFAULT_BRANCH_ID,
      sessionId: Number(legacyParts[2]),
    };
  }

  if (DEFAULT_COMPANY_ID) {
    return {
      companyId: DEFAULT_COMPANY_ID,
      userId: null,
      branchId: DEFAULT_BRANCH_ID,
      sessionId,
    };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!company?.id) {
    throw new Error(
      "Empresa não identificada. Configure DEFAULT_COMPANY_ID no .env.local."
    );
  }

  return {
    companyId: company.id,
    userId: null,
    branchId: DEFAULT_BRANCH_ID,
    sessionId,
  };
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function detectSalesIntent(message: string) {
  const text = normalizeText(message);

  if (
    hasAny(text, [
      "nao tenho interesse",
      "não tenho interesse",
      "sem interesse",
      "nao quero",
      "não quero",
      "pare de mandar",
      "remove meu contato",
      "nao preciso",
      "não preciso",
      "agora nao",
      "agora não",
    ])
  ) {
    return "SEM_INTERESSE";
  }

  if (
    hasAny(text, [
      "quero comprar",
      "vou comprar",
      "pode fechar",
      "fecha o pedido",
      "fechar pedido",
      "manda o pedido",
      "pode separar",
      "confirmo",
      "confirmado",
      "fechado",
      "combinado",
      "pode mandar",
    ])
  ) {
    return "CLIENTE_QUER_COMPRAR";
  }

  if (
    hasAny(text, [
      "cotacao",
      "cotação",
      "orcamento",
      "orçamento",
      "manda tabela",
      "tabela de preco",
      "tabela de preço",
      "qual o preco",
      "qual o preço",
      "quanto custa",
      "tem preco",
      "tem preço",
      "me passa valores",
      "manda catalogo",
      "manda catálogo",
    ])
  ) {
    return "COTACAO";
  }

  if (
    hasAny(text, [
      "desconto",
      "melhor preco",
      "melhor preço",
      "condicao",
      "condição",
      "prazo",
      "negociar",
      "parcela",
      "parcelado",
      "boleto",
      "pix",
      "pagamento",
    ])
  ) {
    return "NEGOCIACAO";
  }

  if (
    hasAny(text, [
      "entrega",
      "entregar",
      "quando chega",
      "prazo de entrega",
      "rota",
      "frete",
      "endereco",
      "endereço",
      "chega amanha",
      "chega amanhã",
    ])
  ) {
    return "ENTREGA";
  }

  if (
    hasAny(text, [
      "vendedor",
      "representante",
      "atendente",
      "humano",
      "falar com alguem",
      "falar com alguém",
      "me liga",
      "ligacao",
      "ligação",
    ])
  ) {
    return "TRANSFERIR_VENDEDOR";
  }

  return "RESPONDEU";
}

function statusFromIntent(intent: string) {
  const map: Record<string, string> = {
    SEM_INTERESSE: "sem_interesse",
    CLIENTE_QUER_COMPRAR: "em_negociacao",
    COTACAO: "cotacao_enviada",
    NEGOCIACAO: "em_negociacao",
    ENTREGA: "pos_venda",
    TRANSFERIR_VENDEDOR: "em_negociacao",
    RESPONDEU: "respondeu",
  };

  return map[intent] || "respondeu";
}

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
  "campanha",
  "sem_interesse",
  "perdido",

  // compatibilidade com versões antigas
  "em_negociacao",
  "entrevista_agendada",
  "reagendar_futuro",
  "contratado",
  "nao_aprovado",
];

const LEGACY_KANBAN_STATUS_MAP: Record<string, string> = {
  respondido: "respondeu",
  interesse: "em_negociacao",
  entrevista: "em_negociacao",
  agendamento: "cotacao_enviada",
  pedido: "pedido_fechado",
  reativar_futuro: "cliente_inativo",
  finalizado: "pedido_fechado",

  // compatibilidade RH → Comercial
  quer_agendar_entrevista: "em_negociacao",
  entrevista_agendada: "cotacao_enviada",
  contratado: "pedido_fechado",
  aprovado: "pedido_fechado",
  nao_aprovado: "perdido",
};

function normalizeKanbanStatus(value: any) {
  const raw = clean(value || "");
  if (!raw) return null;

  const normalized = LEGACY_KANBAN_STATUS_MAP[raw] || raw;
  return ALLOWED_KANBAN_STATUS.includes(normalized) ? normalized : null;
}

function getTemplateKanbanStatus(template: any) {
  return normalizeKanbanStatus(
    template?.kanban_status ||
      template?.kanbanStatus ||
      template?.next_stage ||
      template?.nextStage ||
      template?.stage ||
      template?.target_status ||
      template?.targetStatus ||
      template?.move_to_status ||
      template?.moveToStatus ||
      null
  );
}

function shouldForceSalesStatus(message: string, intent: string, reply?: string | null) {
  const text = normalizeText(message);
  const normalizedIntent = String(intent || "").toUpperCase();

  if (["CLIENTE_QUER_COMPRAR", "COTACAO", "NEGOCIACAO"].includes(normalizedIntent)) {
    return true;
  }

  if (
    hasAny(text, [
      "quero",
      "quero comprar",
      "quanto custa",
      "manda cotacao",
      "manda cotação",
      "manda tabela",
      "faz desconto",
      "pode fechar",
      "fechar pedido",
      "manda pedido",
      "orcamento",
      "orçamento",
    ])
  ) {
    return true;
  }

  const responseText = normalizeText(reply || "");
  if (
    responseText.includes("cotador") ||
    responseText.includes("orcamento") ||
    responseText.includes("orçamento") ||
    responseText.includes("pedido") ||
    responseText.includes("tabela")
  ) {
    return true;
  }

  return false;
}

function getDestination({ lead, phone, lid, remoteJid }: any) {
  /*
    REGRA REAL DO WHATSAPP:
    - Se existe telefone real, SEMPRE usa telefone.
    - Se o WhatsApp/Baileys só entregou @lid, usa @lid APENAS para responder aquela conversa.
    - Nunca salva @lid como phone.
    - Nunca troca phone do lead pelo número do QR Code/remetente.
  */

  const finalPhone = normalizePhone(
    lead?.phone ||
      lead?.mobile ||
      lead?.telefone ||
      phone ||
      ""
  );

  if (finalPhone) {
    return {
      number: finalPhone,
      phone: finalPhone,
      lid: null,
      jid: `${finalPhone}@s.whatsapp.net`,
      isLid: false,
    };
  }

  const finalJid = clean(remoteJid || "");
  if (finalJid && finalJid.includes("@s.whatsapp.net") && !finalJid.includes("@lid")) {
    const phoneFromJid = normalizePhone(finalJid.split("@")[0]);
    if (phoneFromJid) {
      return {
        number: phoneFromJid,
        phone: phoneFromJid,
        lid: null,
        jid: `${phoneFromJid}@s.whatsapp.net`,
        isLid: false,
      };
    }
  }

  const finalLid = normalizeLid(lid || remoteJid || lead?.whatsapp_lid || lead?.remote_jid);

  if (finalLid && String(finalLid).includes("@lid")) {
    return {
      number: "",
      phone: "",
      lid: finalLid,
      jid: finalLid,
      isLid: true,
    };
  }

  return {
    number: "",
    phone: "",
    lid: null,
    jid: null,
    isLid: false,
  };
}

async function sendToWhatsApp(payload: any) {
  const res = await fetch(`${WHATSAPP_SERVER}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  console.log("WHATSAPP SEND STATUS:", res.status);
  console.log("WHATSAPP SEND RESPONSE:", data);

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || JSON.stringify(data));
  }

  return data;
}

async function sendMediaToWhatsApp(payload: any) {
  const res = await fetch(`${WHATSAPP_SERVER}/send-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || JSON.stringify(data));
  }

  return data;
}

async function wasMessageAlreadyProcessed(
  supabase: any,
  leadId: string,
  messageId?: string | null
) {
  if (!messageId) return false;

  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direction", "received")
    .contains("payload", { message_id: messageId })
    .limit(1);

  if (error) {
    console.error("ERRO AO VERIFICAR DUPLICIDADE:", error);
    return false;
  }

  return Boolean(data?.length);
}

async function saveReceivedMessage(
  supabase: any,
  leadId: string,
  companyId: string,
  branchId: string | null,
  message: string,
  messageId?: string | null
) {
  const { error } = await supabase.from("messages").insert({
    company_id: companyId,
    branch_id: branchId,
    lead_id: leadId,
    direction: "received",
    topic: "whatsapp",
    extension: "text",
    content: message,
    event: "message_received",
    payload: { message_id: messageId || null },
    created_at: new Date().toISOString(),
  });

  if (error) console.error("ERRO AO SALVAR MENSAGEM RECEBIDA:", error);
}

async function saveSentMessage(
  supabase: any,
  leadId: string,
  companyId: string,
  branchId: string | null,
  reply: string,
  mediaUrl?: string | null,
  mediaType?: string | null
) {
  const { error } = await supabase.from("messages").insert({
    company_id: companyId,
    branch_id: branchId,
    lead_id: leadId,
    direction: "sent",
    topic: "whatsapp",
    extension: mediaType || "text",
    content: reply,
    event: "message_sent",
    payload: {
      media_url: mediaUrl || null,
      media_type: mediaType || "text",
    },
    created_at: new Date().toISOString(),
  });

  if (error) console.error("ERRO AO SALVAR MENSAGEM ENVIADA:", error);
}

function getJobIdFromLead(lead: any) {
  return (
    lead?.current_job_id ||
    lead?.job_id ||
    lead?.ID_do_trabalho_atual ||
    lead?.id_do_trabalho ||
    null
  );
}
async function getActiveQueueContext({
  supabase,
  companyId,
  leadId,
  phone,
}: {
  supabase: any;
  companyId: string;
  leadId?: string | null;
  phone?: string | null;
}) {
  const normalizedPhone = normalizePhone(phone || "");

  async function runQuery(query: any) {
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("ERRO BUSCAR CONTEXTO DO LOTE:", error);
      return null;
    }

    return data || null;
  }

  // 1) Primeiro tenta pelo lead_id. Esse é o vínculo mais seguro.
  if (leadId) {
    const byLead = await runQuery(
      supabase
        .from("automation_queue")
        .select("*")
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
    );

    if (byLead) return byLead;
  }

  // 2) Depois tenta pelo telefone real. Isso cobre casos em que o lote foi criado
  // antes de vincular corretamente o lead_id.
  if (normalizedPhone) {
    const byPhone = await runQuery(
      supabase
        .from("automation_queue")
        .select("*")
        .eq("company_id", companyId)
        .eq("phone", normalizedPhone)
    );

    if (byPhone) return byPhone;
  }

  return null;
}

async function getJobContext(supabase: any, companyId: string, jobId?: string | null) {
  if (!jobId) return null;

  const tables = ["Job", "jobs", "rh_jobs"];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
  .from(table)
  .select("*")
  .eq("job_id", jobId)
.eq("company_id", companyId)
  .maybeSingle();

      if (!error && data) return data;
    } catch {}
  }

  return null;
}

function formatMoney(value: any) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getJobSalary(job: any) {
  if (!job) return "";
  if (job.salary) return String(job.salary);
  if (job.salaryRange) return String(job.salaryRange);
  if (job.salary_range) return String(job.salary_range);

  const min = formatMoney(job.salaryMin || job.salary_min);
  const max = formatMoney(job.salaryMax || job.salary_max);

  if (min && max) return `${min} a ${max}`;
  if (min) return `A partir de ${min}`;
  if (max) return `Até ${max}`;
  return "";
}

function getJobLocation(job: any) {
  if (!job) return "";
  return [job.neighborhood, job.city, job.state].filter(Boolean).join(" / ");
}

function getJobBenefits(job: any) {
  const value =
    job?.benefits ||
    job?.requirements?.benefits ||
    job?.filters?.benefits ||
    job?.aiCriteria?.benefits ||
    "";

  if (Array.isArray(value)) return value.join(", ");
  return String(value || "");
}

function getJobWorkSchedule(job: any) {
  return (
    job?.shift ||
    job?.requirements?.shift ||
    job?.filters?.shift ||
    job?.workSchedule ||
    job?.work_schedule ||
    ""
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getNextAvailableSlot(
  supabase: any,
  companyId: string,
  jobId?: string | null,
  leadId?: string | null,
  batchId?: string | null
) {
  const now = new Date();

  const { data, error } = await supabase
    .from("rh_interview_slots")
    .select("*")
    .limit(300);

  if (error) {
    console.error("ERRO BUSCAR SLOTS:", error);
    return null;
  }

  const slots = data || [];

  console.log("SLOTS ENCONTRADOS:", slots.length);
  console.log("EXEMPLO SLOT:", slots[0]);

  const getCompanyId = (slot: any) =>
    slot.id_da_empresa || slot.company_id || slot.companyId;

  const getJobId = (slot: any) =>
    slot.id_do_trabalho || slot.job_id || slot.jobId;

  const getBatchId = (slot: any) =>
    slot.id_do_lote || slot.batch_id || slot.batchId;

  const getDate = (slot: any) =>
    slot.comecar_em || slot.start_at || slot.starts_at || slot.startAt;

  const availableSlots = slots
    .filter((slot: any) => {
      const status = String(slot.status || "").toLowerCase();
      const token = slot.token || slot.id;

      const isAvailable =
        status === "available" ||
        status === "disponível" ||
        status === "disponivel" ||
        status === "livre" ||
        status === "";

      const slotDate = getDate(slot);
      const isFuture = slotDate ? new Date(slotDate) >= now : true;

      const sameCompany =
        !companyId || String(getCompanyId(slot) || "") === String(companyId);

      return token && isAvailable && isFuture && sameCompany;
    })
    .sort((a: any, b: any) => {
      const dateA = new Date(getDate(a) || 0).getTime();
      const dateB = new Date(getDate(b) || 0).getTime();
      return dateA - dateB;
    });

  const slotByJob = availableSlots.find((slot: any) =>
    String(getJobId(slot) || "") === String(jobId || "")
  );

  if (slotByJob) return slotByJob;

  const slotByBatch = availableSlots.find((slot: any) =>
    String(getBatchId(slot) || "") === String(batchId || "")
  );

  if (slotByBatch) return slotByBatch;

  return availableSlots[0] || null;
}
  

function publicAgendaLink(slot: any, leadId?: string | null) {
  const token = slot?.token || slot?.id;
  if (!token) return "";

  const agendaType = String(slot?.agenda_type || slot?.agendaType || "individual").toLowerCase();

  if (agendaType === "shared") {
    return `${APP_URL}/agenda-compartilhada/${token}`;
  }

  const base = `${APP_URL}/agenda/${token}`;
  if (!leadId) return base;

  return `${base}?leadId=${encodeURIComponent(leadId)}`;
}

async function buildVariableContext({
  supabase,
  companyId,
  lead,
  phone,
  lastMessage,
}: {
  supabase: any;
  companyId: string;
  lead: any;
  phone?: string;
  lastMessage?: string;
}) {
  const queueContext = await getActiveQueueContext({
    supabase,
    companyId,
    leadId: lead?.id,
    phone: lead?.phone || phone,
  });

  const jobId =
  getJobIdFromLead(lead) ||
  queueContext?.job_id ||
  queueContext?.current_job_id ||
  queueContext?.id_do_trabalho ||
  queueContext?.ID_do_trabalho_atual ||
  null;

  const batchId =
    lead?.batch_id ||
    queueContext?.batch_id ||
    null;

  const job = await getJobContext(supabase, companyId, jobId);
  const slot = await getNextAvailableSlot(
    supabase,
    companyId,
    jobId,
    lead?.id,
    batchId
  );

  const jobTitle =
    job?.title ||
    job?.name ||
    lead?.job_title ||
    queueContext?.job_title ||
    queueContext?.title ||
    "";

  const scheduleLink = publicAgendaLink(slot, lead?.id || null);

  console.log("VARIAVEIS_TEMPLATE_AGENDAMENTO:", {
    lead_id: lead?.id,
    phone: lead?.phone || phone || "",
    job_id: jobId,
    batch_id: batchId,
    slot_id: slot?.id || null,
    slot_token: slot?.token || null,
    scheduleLink,
  });

  return {
    phone: phone || lead?.phone || "",
    lastMessage: lastMessage || lead?.last_message || "",
    job,
    queueContext,
    slot,
    jobTitle,
    scheduleLink,
    interviewDate: formatDateTime(slot?.começar_em || slot?.start_at),
    companyName: process.env.RH_COMPANY_NAME || process.env.COMPANY_NAME || "PMG Atacadista",
    city: job?.city || job?.location_city || "",
    state: job?.state || job?.location_state || "",
    neighborhood: job?.neighborhood || "",
    location: getJobLocation(job),
    contractType: job?.contract_type || job?.contractType || "",
    salary: getJobSalary(job),
    workSchedule: getJobWorkSchedule(job),
    benefits: getJobBenefits(job),
    description: job?.description || job?.details || job?.requirements?.text || "",
    recruiterName: job?.recruiter_name || job?.recruiterName || "",
  };
}

function applyVariables(text: string, lead: any, extra: any = {}) {
  const phone = extra?.phone || lead?.phone || "";
  const productName =
    extra?.productName ||
    extra?.product ||
    extra?.jobTitle ||
    extra?.title ||
    lead?.product_name ||
    lead?.job_title ||
    "";
  const quoteLink =
    extra?.quoteLink ||
    extra?.linkCotador ||
    extra?.scheduleLink ||
    `${APP_URL}/crm/dashboard/cotador`;
  const companyName = extra?.companyName || extra?.company || "PMG Atacadista";
  const customerName = lead?.name || extra?.name || "Cliente";

  return String(text || "")
    .replaceAll("{cliente}", customerName)
    .replaceAll("{nome}", customerName)
    .replaceAll("{telefone}", phone)
    .replaceAll("{empresa}", companyName)
    .replaceAll("{cnpj}", extra?.cnpj || lead?.cnpj || lead?.document || "")
    .replaceAll("{cidade}", extra?.city || lead?.city || "")
    .replaceAll("{estado}", extra?.state || lead?.state || "")
    .replaceAll("{representante}", extra?.representativeName || extra?.representante || "")
    .replaceAll("{produto}", productName)
    .replaceAll("{categoria}", extra?.category || extra?.categoria || "")
    .replaceAll("{valor}", extra?.price || extra?.valor || "")
    .replaceAll("{desconto}", extra?.discount || extra?.desconto || "")
    .replaceAll("{forma_pagamento}", extra?.paymentMethod || extra?.formaPagamento || "")
    .replaceAll("{data_entrega}", extra?.deliveryDate || extra?.dataEntrega || "")
    .replaceAll("{pedido}", extra?.orderNumber || extra?.pedido || "")
    .replaceAll("{cotacao}", extra?.quoteNumber || extra?.cotacao || "")
    .replaceAll("{ticket_medio}", extra?.averageTicket || extra?.ticketMedio || "")
    .replaceAll("{ultima_compra}", extra?.lastPurchase || extra?.ultimaCompra || "")
    .replaceAll("{ultima_mensagem}", extra?.lastMessage || lead?.last_message || "")
    .replaceAll("{link_whatsapp}", phone ? `https://wa.me/${normalizePhone(phone)}` : "")
    .replaceAll("{link_cotador}", quoteLink)
    .replaceAll("{link}", quoteLink)

    // compatibilidade com templates antigos de RH
    .replaceAll("{vaga}", productName)
    .replaceAll("{cargo}", productName)
    .replaceAll("{recrutador}", extra?.representativeName || "")
    .replaceAll("{local}", extra?.location || lead?.city || "")
    .replaceAll("{tipo_contrato}", "")
    .replaceAll("{salario}", extra?.price || "")
    .replaceAll("{horario_trabalho}", "")
    .replaceAll("{beneficios}", extra?.benefits || "")
    .replaceAll("{descricao_vaga}", extra?.description || "")
    .replaceAll("{data}", extra?.deliveryDate || "")
    .replaceAll("{horario}", "")
    .replaceAll("{data_entrevista}", extra?.deliveryDate || "")
    .replaceAll("{link_agendamento}", quoteLink)
    .replaceAll("{link_entrevista}", quoteLink);
}
function extractKeywords(template: any) {
  const raw =
    template.trigger_keywords ||
    template.keywords ||
    template.trigger_text ||
    template.keyword ||
    template.trigger ||
    "";

  const values: string[] = [];

  if (Array.isArray(template.trigger_words)) {
    values.push(...template.trigger_words);
  }

  if (Array.isArray(raw)) {
    values.push(...raw);
  } else {
    values.push(
      ...String(raw || "")
        .split(/\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function intentAliases(intent: string) {
  const normalized = String(intent || "").toUpperCase();

  const aliases: Record<string, string[]> = {
    RESPONDEU: ["DEFAULT", "OPENING", "PROSPECCAO", "RESPONDEU"],
    CLIENTE_QUER_COMPRAR: ["CLIENTE_QUER_COMPRAR", "PEDIDO", "NEGOCIACAO", "COTACAO", "PROMOCAO"],
    COTACAO: ["COTACAO", "ORCAMENTO", "ORÇAMENTO", "PEDIDO", "PROMOCAO"],
    NEGOCIACAO: ["NEGOCIACAO", "PAGAMENTO", "DESCONTO", "COTACAO"],
    ENTREGA: ["ENTREGA", "LOGISTICA", "PRAZO"],
    TRANSFERIR_VENDEDOR: ["TRANSFERIR_VENDEDOR", "ATENDENTE", "VENDEDOR", "REPRESENTANTE"],
    SEM_INTERESSE: ["SEM_INTERESSE", "DESCADASTRO"],
    DEFAULT: ["DEFAULT", "OPENING"],
  };

  const legacy: Record<string, string[]> = {
    QUER_ENTREVISTA: aliases.CLIENTE_QUER_COMPRAR,
    AGENDOU_ENTREVISTA: aliases.COTACAO,
    RH_ABERTURA: ["PROSPECCAO", "OPENING"],
    RH_ENTREVISTA: aliases.COTACAO,
    RH_RELEMBRETE: ["POS_VENDA", "COBRANCA_LEMBRETE"],
    RH_REAGENDAMENTO: ["REATIVACAO"],
    RH_BANCO_TALENTOS: ["REATIVACAO"],
  };

  return [normalized, ...(aliases[normalized] || []), ...(legacy[normalized] || [])];
}
async function findSalesTriggeredTemplate({
  supabase,
  message,
  lead,
  companyId,
}: {
  supabase: any;
  message: string;
  lead: any;
  companyId: string;
}) {
  const text = normalizeText(message);
  const extra = await buildVariableContext({
    supabase,
    companyId,
    lead,
    phone: lead?.phone,
    lastMessage: message,
  });

  const { data: templates, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("ERRO TEMPLATES:", error);
    return null;
  }

  for (const template of templates || []) {
    const keywords = extractKeywords(template);
    if (!keywords.length) continue;

    const hit = keywords.some((keyword: string) =>
      text.includes(normalizeText(keyword))
    );

    if (!hit) continue;

    const rawMessage = template.base_message || template.message || template.content || template.response || template.final_message || template.caption || "";

    return {
      reply: rawMessage ? applyVariables(rawMessage, lead, extra) : null,
      mediaUrl: template.media_url || null,
      mediaType: template.media_type || "text",
      kanbanStatus: getTemplateKanbanStatus(template),
      notifyEnabled: Boolean(template.notify_enabled),
      notifyNumber: template.notify_number || null,
      notifyMessage: template.notify_message || null,
      source: "triggered_template",
    };
  }

  return null;
}

async function getIntentTemplate({
  supabase,
  intent,
  lead,
  companyId,
  message,
}: {
  supabase: any;
  intent: string;
  lead: any;
  companyId: string;
  message: string;
}) {
  const intents = intentAliases(intent);
  const extra = await buildVariableContext({
    supabase,
    companyId,
    lead,
    phone: lead?.phone,
    lastMessage: message,
  });

  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .in("intent", intents)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("ERRO INTENT TEMPLATE:", error);
    return null;
  }

  const rawMessage = data?.base_message || data?.message || data?.content || data?.response || data?.final_message || data?.caption || "";
  if (!rawMessage && !data?.media_url) return null;

  return {
    reply: rawMessage ? applyVariables(rawMessage, lead, extra) : null,
    mediaUrl: data.media_url || null,
    mediaType: data.media_type || "text",
    kanbanStatus: getTemplateKanbanStatus(data),
    notifyEnabled: Boolean(data.notify_enabled),
    notifyNumber: data.notify_number || null,
    notifyMessage: data.notify_message || null,
    source: "intent_template",
  };
}

async function getFinalSalesReply({
  supabase,
  intent,
  message,
  lead,
  companyId,
}: {
  supabase: any;
  intent: string;
  message: string;
  lead: any;
  companyId: string;
}) {
  const triggered = await findSalesTriggeredTemplate({ supabase, message, lead, companyId });
  if (triggered?.reply || triggered?.mediaUrl) {
    if (!triggered.kanbanStatus && shouldForceSalesStatus(message, intent, triggered.reply)) {
      triggered.kanbanStatus = "em_negociacao";
    }
    return triggered;
  }

  const intentTemplate = await getIntentTemplate({ supabase, intent, message, lead, companyId });
  if (intentTemplate?.reply || intentTemplate?.mediaUrl) {
    if (!intentTemplate.kanbanStatus && shouldForceSalesStatus(message, intent, intentTemplate.reply)) {
      intentTemplate.kanbanStatus = "em_negociacao";
    }
    return intentTemplate;
  }

  return {
    reply: null,
    mediaUrl: null,
    mediaType: "text",
    kanbanStatus: null,
    notifyEnabled: false,
    notifyNumber: null,
    notifyMessage: null,
    source: "no_template",
  };
}

async function replyAndSave({
  supabase,
  sessionId,
  phone,
  lid,
  remoteJid,
  lead,
  leadId,
  reply,
  mediaUrl,
  mediaType,
}: any) {
  const destination = getDestination({ lead, phone, lid, remoteJid });
  const basePayload = { sessionId, ...destination };

  const hasDestination = Boolean(
    destination.number ||
      destination.phone ||
      destination.lid ||
      destination.jid
  );

  if (!hasDestination) {
    console.warn("WHATSAPP_REPLY_SKIPPED_NO_DESTINATION:", {
      leadId,
      leadName: lead?.name,
      leadPhone: lead?.phone,
      phone,
      lid,
      remoteJid,
    });
    return;
  }

  if (reply) {
    const result = await sendToWhatsApp({ ...basePayload, message: reply });

    await saveSentMessage(
      supabase,
      leadId,
      lead.company_id,
      lead.branch_id || null,
      reply,
      null,
      "text"
    );

    console.log("MENSAGEM TEXTO ENVIADA:", result);
  }

  if (mediaUrl) {
    const mediaResult = await sendMediaToWhatsApp({
      ...basePayload,
      mediaUrl,
      mediaType: mediaType || "document",
      caption: reply || "",
    });

    await saveSentMessage(
      supabase,
      leadId,
      lead.company_id,
      lead.branch_id || null,
      reply || "",
      mediaUrl,
      mediaType || "document"
    );

    console.log("MÍDIA ENVIADA:", mediaResult);
  }
}

async function sendInternalNotification({
  sessionId,
  number,
  message,
}: {
  sessionId: string;
  number: string;
  message: string;
}) {
  return sendToWhatsApp({
    sessionId,
    number: normalizePhone(number),
    message,
  });
}


function normalizeComparableName(value: any) {
  return normalizeText(value)
    .replace(/\b(da|de|do|das|dos|e)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesLookLikeSamePerson(a: any, b: any) {
  const nameA = normalizeComparableName(a);
  const nameB = normalizeComparableName(b);

  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;

  const partsA = nameA.split(" ").filter(Boolean);
  const partsB = nameB.split(" ").filter(Boolean);

  if (!partsA.length || !partsB.length) return false;

  // Nome único: só aceita se os dois nomes forem exatamente iguais.
  // Isso evita vincular "Angelica Andrade" ao lead "Gregory" só porque existe fila recente.
  if (partsA.length === 1 || partsB.length === 1) {
    return partsA.length === 1 &&
      partsB.length === 1 &&
      partsA[0] === partsB[0];
  }

  const firstA = partsA[0];
  const firstB = partsB[0];

  if (firstA !== firstB) return false;

  const common = partsA.filter((part) => partsB.includes(part));

  // Para nomes compostos, exige pelo menos primeiro nome + mais uma parte em comum.
  return common.length >= 2;
}

function isLidOnlyContact(phone?: string | null, lid?: string | null, remoteJid?: string | null) {
  return !normalizePhone(phone || "") &&
    (String(lid || "").includes("@lid") || String(remoteJid || "").includes("@lid"));
}

function isLeadCompatibleWithPushName(lead: any, pushName?: string | null) {
  const normalizedPushName = normalizeComparableName(pushName || "");
  const normalizedLeadName = normalizeComparableName(lead?.name || "");

  if (!normalizedPushName || !normalizedLeadName) return true;

  return namesLookLikeSamePerson(normalizedPushName, normalizedLeadName);
}

async function findLeadFromRecentQueue({
  supabase,
  companyId,
  phone,
  lid,
  remoteJid,
  sessionId,
  pushName,
}: {
  supabase: any;
  companyId: string;
  phone?: string | null;
  lid?: string | null;
  remoteJid?: string | null;
  sessionId?: number | string | null;
  pushName?: string | null;
}) {
  const normalizedPhone = normalizePhone(phone || "");
  const normalizedPushName = normalizeComparableName(pushName || "");

  /*
    REGRA DE SEGURANÇA:
    A fila recente só pode vincular um @lid ao lead original quando houver:
    1) telefone real batendo; OU
    2) LID/JID já salvo batendo; OU
    3) nome do WhatsApp compatível com o nome do lead.

    Nunca vincular apenas porque existe 1 item na fila.
    Esse era o bug que fazia mensagens da Angélica caírem na conversa do Gregory.
  */

  let query = supabase
    .from("automation_queue")
    .select("*")
    .eq("company_id", companyId)
    .not("lead_id", "is", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (sessionId !== undefined && sessionId !== null && String(sessionId) !== "") {
    query = query.eq("session_id", Number(sessionId));
  }

  const { data: queueItems, error: queueError } = await query;

  if (queueError) {
    console.error("ERRO BUSCAR FILA RECENTE PARA VINCULAR LID:", queueError);
    return null;
  }

  const items = queueItems || [];
  if (!items.length) return null;

  const leadIds = [
    ...new Set(items.map((item: any) => item.lead_id).filter(Boolean).map(String)),
  ];

  if (!leadIds.length) return null;

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .in("id", leadIds);

  if (leadsError) {
    console.error("ERRO BUSCAR LEADS DA FILA RECENTE:", leadsError);
    return null;
  }

  const leadMap: Map<string, any> = new Map(
  ((leads || []) as any[]).map((lead: any) => [String(lead.id), lead])
);

const scored: any[] = [];

for (const item of items as any[]) {
  const lead: any = leadMap.get(String(item.lead_id));

  if (!lead || !lead.id) continue;

    const itemPhone = normalizePhone(item.phone || "");
    const leadPhone = normalizePhone(lead.phone || lead.mobile || lead.telefone || "");

    const phoneMatches =
      Boolean(normalizedPhone) &&
      (normalizedPhone === itemPhone || normalizedPhone === leadPhone);

    const lidMatches =
      Boolean(lid) &&
      (lead.whatsapp_lid === lid || lead.remote_jid === lid);

    const remoteMatches =
      Boolean(remoteJid) &&
      (lead.remote_jid === remoteJid || lead.whatsapp_lid === remoteJid);

    const nameMatches =
      Boolean(normalizedPushName) &&
      namesLookLikeSamePerson(pushName, lead.name);

    if (!phoneMatches && !lidMatches && !remoteMatches && !nameMatches) {
      continue;
    }

    let score = 0;
    if (phoneMatches) score += 1000;
    if (lidMatches) score += 900;
    if (remoteMatches) score += 900;
    if (nameMatches) score += 600;
    if (item.job_id || lead.job_id || lead.current_job_id) score += 80;
    if (item.batch_id || lead.batch_id) score += 80;

    const status = String(item.status || "").toLowerCase();
    if (["sent", "enviado", "delivered", "pending", "processing", "done", "completed"].includes(status)) {
      score += 30;
    }

    scored.push({
      score,
      lead,
      queue: item,
      phoneMatches,
      lidMatches,
      remoteMatches,
      nameMatches,
    });
  }

  const viable = scored
    .filter((item) => {
      if (item.phoneMatches || item.lidMatches || item.remoteMatches) return item.score >= 900;
      if (item.nameMatches) return item.score >= 600;
      return false;
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return (
        new Date(b.queue.updated_at || b.queue.created_at || 0).getTime() -
        new Date(a.queue.updated_at || a.queue.created_at || 0).getTime()
      );
    });

  if (!viable.length) {
    console.warn("LID_NAO_VINCULADO_A_FILA_COM_SEGURANCA:", {
      companyId,
      sessionId,
      pushName,
      lid,
      remoteJid,
      queueItems: items.length,
      candidates: scored.map((item) => ({
        lead_id: item.lead?.id,
        lead_name: item.lead?.name,
        score: item.score,
        phoneMatches: item.phoneMatches,
        lidMatches: item.lidMatches,
        remoteMatches: item.remoteMatches,
        nameMatches: item.nameMatches,
        job_id: item.queue?.job_id || item.lead?.job_id || item.lead?.current_job_id || null,
        batch_id: item.queue?.batch_id || item.lead?.batch_id || null,
      })),
    });
    return null;
  }

  const selected = viable[0];

  console.log("LEAD_VINCULADO_POR_FILA_RECENTE_LID:", {
    lead_id: selected.lead.id,
    lead_name: selected.lead.name,
    score: selected.score,
    pushName,
    lid,
    remoteJid,
    queue_id: selected.queue.id,
    phoneMatches: selected.phoneMatches,
    lidMatches: selected.lidMatches,
    remoteMatches: selected.remoteMatches,
    nameMatches: selected.nameMatches,
    job_id: selected.queue.job_id || selected.lead.job_id || selected.lead.current_job_id || null,
    batch_id: selected.queue.batch_id || selected.lead.batch_id || null,
  });

  return {
    ...selected.lead,
    _queueContext: selected.queue,
    _resolvedByRecentQueue: true,
  };
}

async function findLead({
  supabase,
  companyId,
  phone,
  lid,
  remoteJid,
  sessionId,
  email,
  pushName,
}: {
  supabase: any;
  companyId: string;
  phone: string;
  lid: string | null;
  remoteJid: string | null;
  pushName?: string | null;
  sessionId?: number | string | null;
  email?: string | null;
}) {
  const candidates: any[] = [];

  async function addCandidate(item: any, source: string) {
    if (!item?.id) return;

    const existing = candidates.find((lead) => lead.id === item.id);

    if (existing) {
      existing._sources = Array.from(new Set([...(existing._sources || []), source]));
      return;
    }

    candidates.push({
      ...item,
      _sources: [source],
    });
  }

  async function addByQuery(query: any, source: string) {
    try {
      const { data, error } = await query;
      if (error) {
        console.error("FIND LEAD QUERY ERROR:", error);
        return;
      }

      for (const item of data || []) {
        await addCandidate(item, source);
      }
    } catch (error) {
      console.error("FIND LEAD QUERY FAILED:", error);
    }
  }

  if (phone) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(10),
      "phone"
    );
  }

  if (email) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("email", email)
        .order("updated_at", { ascending: false })
        .limit(10),
      "email"
    );
  }

  if (lid) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("whatsapp_lid", lid)
        .order("updated_at", { ascending: false })
        .limit(10),
      "lid"
    );
  }

  if (remoteJid) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("remote_jid", remoteJid)
        .order("updated_at", { ascending: false })
        .limit(10),
      "remoteJid"
    );
  }

  const queueLead = await findLeadFromRecentQueue({
    supabase,
    companyId,
    phone,
    lid,
    remoteJid,
    sessionId,
    pushName,
  });

  if (queueLead?.id) {
    await addCandidate(queueLead, "queue");
  }

  if (!candidates.length) return null;

  const lidOnly = isLidOnlyContact(phone, lid, remoteJid);
  const normalizedPushName = normalizeComparableName(pushName || "");

  const safeCandidates = candidates.filter((lead) => {
    const sources = lead._sources || [];

    // Telefone/e-mail são identificadores fortes.
    if (sources.includes("phone") || sources.includes("email")) return true;

    // Fila recente já passou pela validação segura.
    if (sources.includes("queue") || lead._resolvedByRecentQueue) return true;

    /*
      Se chegou apenas por @lid e encontramos um lead por LID/JID,
      mas o nome do WhatsApp não bate com o nome do lead, NÃO usa esse lead.
      Isso evita Angélica cair na conversa do Gregory caso um LID tenha sido
      salvo errado em algum teste anterior.
    */
    if (lidOnly && normalizedPushName) {
      return isLeadCompatibleWithPushName(lead, pushName);
    }

    return true;
  });

  if (!safeCandidates.length) {
    console.warn("LEAD_CANDIDATO_DESCARTADO_POR_INCOMPATIBILIDADE_DE_NOME:", {
      companyId,
      phone,
      lid,
      remoteJid,
      pushName,
      candidates: candidates.map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        whatsapp_lid: lead.whatsapp_lid,
        remote_jid: lead.remote_jid,
        sources: lead._sources,
      })),
    });

    return null;
  }

  const lead = [...safeCandidates].sort((a, b) => {
    const aQueueBoost = a._resolvedByRecentQueue ? 1000 : 0;
    const bQueueBoost = b._resolvedByRecentQueue ? 1000 : 0;

    const aStrong =
      (a._sources || []).includes("phone") || (a._sources || []).includes("email")
        ? 1000
        : 0;

    const bStrong =
      (b._sources || []).includes("phone") || (b._sources || []).includes("email")
        ? 1000
        : 0;

    const aScore =
      aStrong +
      aQueueBoost +
      (a.phone ? 100 : 0) +
      (a.email ? 20 : 0) +
      (a.whatsapp_lid ? 10 : 0) +
      (a.remote_jid ? 10 : 0) +
      (a.job_id || a.current_job_id ? 50 : 0) +
      (a.batch_id ? 50 : 0);

    const bScore =
      bStrong +
      bQueueBoost +
      (b.phone ? 100 : 0) +
      (b.email ? 20 : 0) +
      (b.whatsapp_lid ? 10 : 0) +
      (b.remote_jid ? 10 : 0) +
      (b.job_id || b.current_job_id ? 50 : 0) +
      (b.batch_id ? 50 : 0);

    if (aScore !== bScore) return bScore - aScore;

    return (
      new Date(b.updated_at || b.created_at || 0).getTime() -
      new Date(a.updated_at || a.created_at || 0).getTime()
    );
  })[0];

  if (!lead?.id) return null;

  const queueContext = lead._queueContext || null;

  const patch: any = {
    updated_at: new Date().toISOString(),
  };

  // Só vincula LID/JID se o lead foi achado com segurança.
  if (lid && !lead.whatsapp_lid) patch.whatsapp_lid = lid;
  if (remoteJid && !lead.remote_jid) patch.remote_jid = remoteJid;

  if (phone && !lead.phone && isRealBrazilPhone(phone)) {
    patch.phone = normalizePhone(phone);
  }

  if (email && !lead.email) patch.email = email;
  if (sessionId && !lead.session_id) patch.session_id = Number(sessionId);

  const queueJobId = queueContext?.job_id || null;
  const queueBatchId = queueContext?.batch_id || null;

  if (queueJobId && !lead.job_id) patch.job_id = queueJobId;
  if (queueJobId && !lead.current_job_id) patch.current_job_id = queueJobId;
  if (queueBatchId && !lead.batch_id) patch.batch_id = queueBatchId;

  if (Object.keys(patch).length > 1) {
    const { data, error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", lead.id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      return {
        ...data,
        _queueContext: queueContext,
        _resolvedByRecentQueue: lead._resolvedByRecentQueue || false,
      };
    }

    if (error) {
      console.error("ERRO AO ATUALIZAR IDENTIFICADORES DO LEAD:", error);
    }
  }

  return lead;
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const messageId = getIncomingMessageId(body);
    const rawPhone = clean(body.phone || "");
    const rawNumber = clean(body.number || "");
    const remoteJid = body.remoteJid || body.remote_jid || null;
    const lid = normalizeLid(body.lid || remoteJid);

    /*
      REGRA CRÍTICA:
      Se a mensagem chegou por @lid, o campo "number" pode ser apenas o ID interno do WhatsApp,
      não o telefone real do candidato. Então NÃO usamos esse valor para salvar/alterar phone.
      O telefone do lead vem da importação/cadastro/disparo.
    */
    const incomingIsLid =
      body.isLid === true ||
      body.is_lid === true ||
      String(body.isLid || body.is_lid || "").toLowerCase() === "true" ||
      String(remoteJid || "").includes("@lid") ||
      String(body.lid || "").includes("@lid");

    /*
      Se veio por @lid, o body.number pode ser ID interno, não telefone.
      Mas se body.phone vier preenchido com telefone real, podemos usar.
      Caso contrário, não inventamos telefone.
    */
    const phone = rawPhone
      ? normalizePhone(rawPhone)
      : incomingIsLid
        ? ""
        : normalizePhone(rawNumber);
    const email = clean(body.email || body.candidate_email || "");
    const message = clean(body.message || body.text || body.body || "");
    const pushName = clean(body.pushName || body.name || "");

    const resolved = await resolveCompanyBySession(
      supabase,
      body.sessionId || body.session_id || "1"
    );

    const companyId = resolved.companyId;
    const branchId = resolved.branchId;
    const userId = resolved.userId || null;
    const sessionId = resolved.sessionId;
    const sendSessionId = buildSendSession(companyId, userId, sessionId);

    if ((!phone && !lid) || !message) {
      return NextResponse.json(
        { success: false, error: "Telefone/LID ou mensagem inválida" },
        { status: 400 }
      );
    }

    let lead: any = await findLead({
      supabase,
      companyId,
      phone,
      lid,
      remoteJid,
      pushName,
      sessionId,
      email,
    });

    const intent = detectSalesIntent(message);
    const detectedStatus = statusFromIntent(intent);

    if (!lead) {
  // Última busca antes de criar, para evitar duplicação por corrida
  lead = await findLead({
    supabase,
    companyId,
    phone,
    lid,
    remoteJid,
    pushName,
    sessionId,
    email,
  });

  if (!lead) {
    const created = await supabase
      .from("leads")
      .insert({
        company_id: companyId,
        branch_id: branchId,
        name: pushName || "Cliente WhatsApp",
        phone: isRealBrazilPhone(phone) ? normalizePhone(phone) : null,
        email: email || null,
        whatsapp_lid: lid || null,
        remote_jid: remoteJid || null,
        status: "novo",
        session_id: sessionId,
        ai_paused: false,
        current_flow_step: 1,
        unread_count: 1,
        last_message: message,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (created.error) throw new Error(created.error.message);
    lead = created.data;
  }
}
    const queueContext = await getActiveQueueContext({
  supabase,
  companyId,
  leadId: lead.id,
  phone: lead.phone || phone,
});

if (queueContext) {
  const leadJobPatch: any = {};

  if (!lead.job_id && queueContext.job_id) {
    leadJobPatch.job_id = queueContext.job_id;
  }

  if (!lead.current_job_id && queueContext.job_id) {
    leadJobPatch.current_job_id = queueContext.job_id;
  }

  if (!lead.batch_id && queueContext.batch_id) {
    leadJobPatch.batch_id = queueContext.batch_id;
  }

  if (Object.keys(leadJobPatch).length) {
    leadJobPatch.updated_at = new Date().toISOString();

    const { data: updatedLead, error: updateLeadJobError } = await supabase
      .from("leads")
      .update(leadJobPatch)
      .eq("id", lead.id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    if (updateLeadJobError) {
      console.error("ERRO AO VINCULAR LEAD AO CONTEXTO DA CAMPANHA:", updateLeadJobError);
    } else if (updatedLead) {
      lead = updatedLead;
    }
  }
}

    const duplicated = await wasMessageAlreadyProcessed(supabase, lead.id, messageId);

    if (duplicated) {
      return NextResponse.json({ success: true, action: "duplicate_ignored" });
    }

    await saveReceivedMessage(supabase, lead.id, companyId, lead.branch_id || branchId, message, messageId);

    const lockedStatuses = [
      "pedido_fechado",
      "cliente_ativo",
      "sem_interesse",
      "perdido",
      "entrevista_agendada",
      "entrevista_confirmada",
      "aprovado",
      "contratado",
      "nao_aprovado",
      "nao_compareceu",
    ];

    const currentStatus = String(lead.status || "novo");

const nextStatus =
  lockedStatuses.includes(currentStatus)
    ? currentStatus
    : currentStatus === "novo" || currentStatus === "enviado"
      ? detectedStatus
      : currentStatus;

    await supabase
      .from("leads")
      .update({
        status: nextStatus,
        unread_count: Number(lead.unread_count || 0) + 1,
        last_message: message,
        last_message_at: new Date().toISOString(),
        whatsapp_lid: lead.whatsapp_lid || lid || null,
remote_jid: lead.remote_jid || remoteJid || null,

        /*
          NÃO sobrescrever phone aqui.
          O incoming pode vir por @lid e confundir o número do candidato com ID interno.
          Mantemos o telefone original do lead.
        */
        email: lead.email || email || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .eq("company_id", companyId);

    lead = {
      ...lead,
      company_id: companyId,
      branch_id: lead.branch_id || branchId,
      status: nextStatus,
     whatsapp_lid: lead.whatsapp_lid || lid || null,
remote_jid: lead.remote_jid || remoteJid || null,
      last_message: message,
    };

    if (lead.ai_paused === true) {
      return NextResponse.json({
        success: true,
        action: "ia_pausada",
        intent,
        kanban_status: nextStatus,
        lead_id: lead.id,
      });
    }

    const noLoopStatuses = [
      "entrevista_agendada",
      "entrevista_confirmada",
      "aprovado",
      "contratado",
    ];

    const simpleReplies = [
      "ok",
      "obrigado",
      "obrigada",
      "valeu",
      "blz",
      "beleza",
      "👍",
      "sim",
      "certo",
      "combinado",
    ];

    if (
      noLoopStatuses.includes(String(lead.status || "")) &&
      simpleReplies.includes(normalizeText(message))
    ) {
      return NextResponse.json({
        success: true,
        action: "no_loop_ignored",
        intent,
        kanban_status: nextStatus,
        lead_id: lead.id,
      });
    }
console.log("CONTEXTO FINAL DO LEAD PARA TEMPLATE:", {
  lead_id: lead.id,
  name: lead.name,
  status: lead.status,
  job_id: lead.job_id,
  current_job_id: lead.current_job_id,
  batch_id: lead.batch_id,
});
    const finalReply = await getFinalSalesReply({
      supabase,
      intent,
      message,
      lead,
      companyId,
    });

    let replied = false;

    try {
      if (finalReply.reply || finalReply.mediaUrl) {
        await replyAndSave({
          supabase,
          sessionId: sendSessionId,
          phone,
          lid,
          remoteJid,
          lead,
          leadId: lead.id,
          reply: finalReply.reply,
          mediaUrl: finalReply.mediaUrl,
          mediaType: finalReply.mediaType,
        });

        replied = true;
      }
    } catch (sendError) {
      console.error("FALHA AO RESPONDER WHATSAPP:", sendError);
    }

    const finalKanbanStatus =
      normalizeKanbanStatus(finalReply.kanbanStatus) ||
      (shouldForceSalesStatus(message, intent, finalReply.reply)
        ? "em_negociacao"
        : null);

    if (finalKanbanStatus) {
      const { data: updatedStatusLead, error: statusError } = await supabase
        .from("leads")
        .update({
          status: finalKanbanStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id)
        .eq("company_id", companyId)
        .select("*")
        .maybeSingle();

      if (statusError) {
        console.error("ERRO AO ATUALIZAR STATUS FINAL DO KANBAN:", statusError);
      } else if (updatedStatusLead) {
        lead = updatedStatusLead;
      }
    }

    if (finalReply.notifyEnabled && finalReply.notifyNumber) {
      const internalMessage = applyVariables(
        finalReply.notifyMessage ||
          "🚨 Novo atendimento comercial\n\nCliente: {cliente}\nTelefone: {telefone}\n\nÚltima mensagem:\n{ultima_mensagem}\n\nAbrir conversa:\n{link_whatsapp}",
        lead,
        {
          phone: lead.phone || phone || lid || "",
          lastMessage: message,
        }
      );

      await sendInternalNotification({
        sessionId: sendSessionId,
        number: finalReply.notifyNumber,
        message: internalMessage,
      });
    }

    return NextResponse.json({
      success: true,
      action: replied ? "resposta_template_comercial" : "kanban_atualizado",
      intent,
      source: finalReply.source,
      lead_id: lead.id,
      company_id: companyId,
      phone: lead.phone || phone || "",
      lid: lid || null,
      session_id: sessionId,
      send_session_id: sendSessionId,
      kanban_status: finalKanbanStatus || nextStatus,
      replied,
      notify_sent: Boolean(finalReply.notifyEnabled && finalReply.notifyNumber),
    });
  } catch (error: any) {
    console.error("ERRO API WHATSAPP INCOMING SALES:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || String(error),
        stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
