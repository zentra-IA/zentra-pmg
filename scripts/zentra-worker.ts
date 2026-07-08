import dotenv from "dotenv";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de iniciar o worker."
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  realtime: {
    transport: ws as any,
  },
});

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER ||
  process.env.WHATSAPP_SERVER ||
  "http://localhost:3011";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "http://localhost:3000";

const DEFAULT_COMPANY_NAME =
  process.env.SALES_COMPANY_NAME ||
  process.env.COMPANY_NAME ||
  "Zentra Sales AI";

const SESSIONS = String(process.env.WHATSAPP_SESSIONS || "1,2,3,4,5")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter(Boolean);

const MAX_PER_DAY = Number(process.env.CRM_MAX_PER_SESSION_DAY || 80);
const DELAY_MIN = Number(process.env.CRM_DELAY_MIN_MS || 120000);
const DELAY_MAX = Number(process.env.CRM_DELAY_MAX_MS || 300000);
const LOOP_DELAY = Number(process.env.CRM_WORKER_LOOP_MS || 10000);

type QueueItem = {
  id: string;
  company_id?: string | null;
  branch_id?: string | null;
  lead_id?: string | null;
  customer_id?: string | null;
  contact_id?: string | null;
  phone?: string | null;
  session_id?: number | null;
  user_id?: string | null;
  type?: string | null;
  intent?: string | null;
  message?: string | null;
  template?: string | null;
  payload?: Record<string, any> | null;
  status?: string | null;
  attempts?: number | null;
};

type CommercialContact = {
  id?: string;
  name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  company_name?: string;
  city?: string;
  state?: string;
  segment?: string;
  category?: string;
  product_interest?: string;
  average_ticket?: number;
  last_order_at?: string;
  next_action_at?: string;
  score?: number;
};

function log(message: string, extra?: any) {
  if (extra === undefined) {
    console.log(`[Zentra Worker] ${message}`);
    return;
  }

  console.log(`[Zentra Worker] ${message}`, extra);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function cleanPhone(value: any) {
  let phone = String(value || "").replace(/\D/g, "");

  if (!phone) return "";

  if (!phone.startsWith("55")) {
    phone = `55${phone}`;
  }

  return phone;
}

function buildSessionId(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  sessionId: number
) {
  if (companyId && userId) return `${companyId}_${userId}_${sessionId}`;
  return `${companyId || "default"}_${sessionId}`;
}

function formatMoney(value: any) {
  const number = Number(value || 0);

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function normalizeVariables(source: any = {}) {
  return {
    nome: source?.name || source?.customer_name || source?.contact_name || source?.lead_name || "",
    cliente: source?.name || source?.customer_name || source?.contact_name || source?.lead_name || "",
    empresa: source?.company_name || source?.company || source?.business_name || DEFAULT_COMPANY_NAME,
    telefone: source?.phone || source?.whatsapp || "",
    whatsapp: source?.whatsapp || source?.phone || "",
    email: source?.email || "",
    cidade: source?.city || "",
    estado: source?.state || "",
    segmento: source?.segment || source?.category || "",
    categoria: source?.category || "",
    produto: source?.product || source?.product_name || source?.product_interest || "",
    produto_interesse: source?.product_interest || source?.product || source?.product_name || "",
    vendedor: source?.sales_rep_name || source?.seller_name || source?.representative_name || "",
    representante: source?.sales_rep_name || source?.seller_name || source?.representative_name || "",
    ticket_medio: source?.average_ticket ? formatMoney(source.average_ticket) : "",
    valor: source?.value ? formatMoney(source.value) : "",
    total: source?.total ? formatMoney(source.total) : "",
    data: source?.date || "",
    horario: source?.time || "",
    link: source?.link || source?.url || "",
    cotador: source?.quote_url || process.env.COTADOR_URL || "",
    nome_empresa: DEFAULT_COMPANY_NAME,
  };
}

function applyVariables(text: string, contact: CommercialContact | null = {}, extra: any = {}) {
  const variables = {
    ...normalizeVariables(contact || {}),
    ...normalizeVariables(extra || {}),
    ...extra,
  };

  let output = String(text || "");

  for (const [key, value] of Object.entries(variables)) {
    output = output.replaceAll(`{${key}}`, String(value ?? ""));
  }

  // Compatibilidade com templates antigos do RH.
  output = output
    .replaceAll("{vaga}", String(variables.produto || ""))
    .replaceAll("{cargo}", String(variables.produto || ""))
    .replaceAll("{recrutador}", String(variables.representante || ""))
    .replaceAll("{descricao_vaga}", String(variables.produto_interesse || ""))
    .replaceAll("{beneficios}", String(variables.produto_interesse || ""))
    .replaceAll("{link_agendamento}", String(variables.link || ""))
    .replaceAll("{link_entrevista}", String(variables.link || ""));

  return output.trim();
}

async function safeSelectSingle(tables: string[], id?: string | null, companyId?: string | null) {
  if (!id) return null;

  for (const table of tables) {
    try {
      let query = supabase.from(table).select("*").eq("id", id);

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query.maybeSingle();

      if (!error && data) return data;
    } catch {
      // Ignora tabelas ainda não criadas.
    }
  }

  return null;
}

async function getContactContext(item: QueueItem): Promise<CommercialContact | null> {
  const id = item.customer_id || item.contact_id || item.lead_id;

  return safeSelectSingle(
    ["crm_customers", "customers", "contacts", "crm_contacts", "crm_leads", "leads"],
    id || null,
    item.company_id || null
  );
}

function defaultTemplate(intent?: string | null) {
  const normalized = String(intent || "").toUpperCase();

  if (normalized.includes("INATIVO") || normalized.includes("REATIVACAO")) {
    return `Olá {nome}, tudo bem?

Passando para saber se posso te ajudar com algum produto ou reposição para esta semana.

Vi aqui que faz um tempinho que não temos pedido seu e queria entender se posso montar uma condição melhor para você.`;
  }

  if (normalized.includes("COTACAO") || normalized.includes("QUOTE")) {
    return `Olá {nome}, tudo bem?

Vi que você demonstrou interesse em {produto_interesse}. Posso te enviar uma cotação atualizada agora?

Se preferir, também posso montar uma sugestão com produtos complementares.`;
  }

  if (normalized.includes("BOLETO") || normalized.includes("FINANCEIRO")) {
    return `Olá {nome}, tudo bem?

Passando para te lembrar sobre uma pendência financeira vinculada ao seu cadastro.

Qualquer dúvida, fico à disposição.`;
  }

  if (normalized.includes("META") || normalized.includes("OPORTUNIDADE")) {
    return `Olá {nome}, tudo bem?

Identifiquei uma oportunidade comercial interessante para sua empresa.

Posso te apresentar uma sugestão rápida de compra com base no seu histórico?`;
  }

  return `Olá {nome}, tudo bem?

Aqui é da {empresa}. Estou passando para te ajudar com produtos, cotações ou reposição.

Posso te atender agora?`;
}

function intentAliases(intent?: string | null) {
  const normalized = String(intent || "").trim();

  const aliases = new Set<string>([
    normalized,
    normalized.toUpperCase(),
    normalized.toLowerCase(),
    normalized.replace(/^RH_/i, "SALES_"),
    normalized.replace(/^SALES_/i, "CRM_"),
  ]);

  if (normalized.toUpperCase().includes("REATIVACAO")) {
    aliases.add("CLIENTE_INATIVO");
    aliases.add("REACTIVATION");
  }

  return Array.from(aliases).filter(Boolean);
}

async function getTemplateMessage(item: QueueItem, contact: CommercialContact | null) {
  if (item.message) {
    return applyVariables(item.message, contact, item.payload || {});
  }

  const aliases = intentAliases(item.intent);

  try {
    const { data } = await supabase
      .from("message_templates")
      .select("*")
      .eq("company_id", item.company_id || "")
      .in("intent", aliases)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.message || data?.content || data?.body) {
      return applyVariables(data.message || data.content || data.body, contact, item.payload || {});
    }
  } catch {
    // Tabela pode não existir no início do projeto.
  }

  return applyVariables(defaultTemplate(item.intent), contact, item.payload || {});
}

async function isSessionOnline(companyId: string | null | undefined, userId: string | null | undefined, sessionId: number) {
  const fullSessionId = buildSessionId(companyId, userId, sessionId);

  try {
    const response = await fetch(`${WHATSAPP_SERVER}/status/${fullSessionId}`);

    if (!response.ok) return false;

    const data = await response.json().catch(() => ({}));

    return Boolean(
      data?.connected ||
        data?.online ||
        data?.status === "online" ||
        data?.status === "open"
    );
  } catch {
    return false;
  }
}

async function countSentToday(companyId: string | null | undefined, sessionId: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  try {
    const { count } = await supabase
      .from("automation_queue")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId || "")
      .eq("session_id", sessionId)
      .eq("status", "sent")
      .gte("sent_at", start.toISOString());

    return count || 0;
  } catch {
    return 0;
  }
}

async function getBestSession(companyId: string | null | undefined, userId: string | null | undefined) {
  for (const sessionId of SESSIONS) {
    const online = await isSessionOnline(companyId, userId, sessionId);
    if (!online) continue;

    const sentToday = await countSentToday(companyId, sessionId);
    if (sentToday < MAX_PER_DAY) return sessionId;
  }

  return SESSIONS[0] || 1;
}

async function resolveSession(item: QueueItem) {
  if (item.session_id) {
    return item.session_id;
  }

  return getBestSession(item.company_id, item.user_id);
}

async function sendText(item: QueueItem, phone: string, message: string, sessionId: number) {
  const fullSessionId = buildSessionId(item.company_id, item.user_id, sessionId);

  const response = await fetch(`${WHATSAPP_SERVER}/send`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    sessionId: fullSessionId,
    number: phone,
    message,
  }),
});

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {
  throw new Error(
    data?.error ||
    data?.message ||
    "Erro ao enviar mensagem pelo WhatsApp."
  );
}

  return data;
}

async function markContactStatus(item: QueueItem, status: string) {
  const id = item.customer_id || item.contact_id || item.lead_id;

  if (!id) return;

  const payload = {
    status,
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  for (const table of ["crm_customers", "customers", "contacts", "crm_contacts", "crm_leads", "leads"]) {
    try {
      await supabase.from(table).update(payload).eq("id", id);
      return;
    } catch {
      // Ignora tabelas não existentes.
    }
  }
}

async function markQueueItem(item: QueueItem, status: string, extra: Record<string, any> = {}) {
  const payload = {
    status,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  const { error } = await supabase.from("automation_queue").update(payload).eq("id", item.id);

  if (error) throw new Error(error.message);
}

async function failQueueItem(item: QueueItem, message: string) {
  const attempts = Number(item.attempts || 0) + 1;

  await markQueueItem(item, attempts >= 3 ? "failed" : "pending", {
    attempts,
    error: message,
    next_attempt_at: new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString(),
  });

  await markContactStatus(item, "failed");
}

async function getPendingQueueItems() {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("status", "pending")
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as QueueItem[];
}

async function processQueueItem(item: QueueItem) {
  const contact = await getContactContext(item);
  const phone = cleanPhone(item.phone || contact?.whatsapp || contact?.phone);

  if (!phone) {
    throw new Error("Contato sem telefone/WhatsApp válido.");
  }

  await markQueueItem(item, "processing", {
    processing_at: new Date().toISOString(),
  });

  await markContactStatus(item, "processing");

  const sessionId = await resolveSession(item);
  const online = await isSessionOnline(item.company_id, item.user_id, sessionId);

  if (!online) {
    throw new Error(`Sessão WhatsApp ${sessionId} offline.`);
  }

  const message = await getTemplateMessage(item, contact);

  if (!message) {
    throw new Error("Mensagem vazia.");
  }

  await sendText(item, phone, message, sessionId);

  await markQueueItem(item, "sent", {
    sent_at: new Date().toISOString(),
    session_id: sessionId,
    error: null,
  });

  await markContactStatus(item, "contacted");

  log("Mensagem enviada", {
    queue_id: item.id,
    session_id: sessionId,
    phone,
    company_id: item.company_id,
  });

  const delay = randomDelay(DELAY_MIN, DELAY_MAX);
  log(`Aguardando ${Math.round(delay / 1000)}s para proteger as sessões.`);
  await sleep(delay);
}

async function processQueue() {
  let items: QueueItem[] = [];

  try {
    items = await getPendingQueueItems();
  } catch (error: any) {
    log("Erro ao buscar fila", error.message);
    return;
  }

  for (const item of items) {
    try {
      await processQueueItem(item);
    } catch (error: any) {
      log("Erro no item da fila", {
        queue_id: item.id,
        error: error.message,
      });

      await failQueueItem(item, error.message);
    }
  }
}

async function createCommercialInsight(alert: any) {
  const title = alert.title || alert.type || "Oportunidade comercial";
  const description = alert.description || alert.message || "";

  const message = `${title}

${description}

Ação sugerida: ${alert.suggested_action || "Entrar em contato com o cliente e registrar o retorno no CRM."}`;

  try {
    await supabase.from("commercial_insights").insert({
      company_id: alert.company_id,
      customer_id: alert.customer_id || alert.contact_id || null,
      type: alert.type || "opportunity",
      title,
      description,
      suggested_action: alert.suggested_action || null,
      priority: alert.priority || "medium",
      status: "open",
      created_at: new Date().toISOString(),
    });
  } catch {
    // Tabela opcional. Não deve parar o worker.
  }

  return message;
}

async function enqueueCommercialAlert(alert: any) {
  if (!alert.phone && !alert.customer_id && !alert.contact_id) return;

  const message = await createCommercialInsight(alert);

  try {
    await supabase.from("automation_queue").insert({
      company_id: alert.company_id,
      branch_id: alert.branch_id || null,
      customer_id: alert.customer_id || alert.contact_id || null,
      phone: cleanPhone(alert.phone || ""),
      session_id: alert.session_id || null,
      type: "commercial_alert",
      intent: alert.intent || "SALES_ALERT",
      message,
      status: "pending",
      paused: false,
      scheduled_at: alert.scheduled_at || new Date().toISOString(),
      created_at: new Date().toISOString(),
      attempts: 0,
      payload: alert.payload || {},
    });

    if (alert.id) {
      await supabase
        .from("sales_ai_alerts")
        .update({ queued_at: new Date().toISOString(), status: "queued" })
        .eq("id", alert.id);
    }
  } catch (error: any) {
    log("Erro ao enfileirar alerta comercial", error.message);
  }
}

async function processCommercialAlerts() {
  try {
    const { data, error } = await supabase
      .from("sales_ai_alerts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (error) return;

    for (const alert of data || []) {
      await enqueueCommercialAlert(alert);
    }
  } catch {
    // Módulo ainda não criado. Mantém compatibilidade.
  }
}

async function processInactiveCustomers() {
  try {
    const limitDays = Number(process.env.SALES_INACTIVE_DAYS || 30);
    const limitDate = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("crm_customers")
      .select("*")
      .or(`last_order_at.is.null,last_order_at.lt.${limitDate}`)
      .neq("status", "inactive")
      .limit(50);

    if (error) return;

    for (const customer of data || []) {
      await supabase
        .from("crm_customers")
        .update({
          status: "inactive",
          inactive_since: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", customer.id);

      try {
        await supabase.from("commercial_insights").insert({
          company_id: customer.company_id,
          customer_id: customer.id,
          type: "inactive_customer",
          title: "Cliente inativo",
          description: `${customer.name || "Cliente"} está há mais de ${limitDays} dias sem comprar.`,
          suggested_action: "Entrar em contato, entender objeção e oferecer uma condição de reativação.",
          priority: "high",
          status: "open",
          created_at: new Date().toISOString(),
        });
      } catch {}
    }
  } catch {
    // Não bloqueia o worker.
  }
}

async function loop() {
  log("Worker Zentra Sales AI iniciado");
  log("Configuração", {
    WHATSAPP_SERVER,
    APP_URL,
    SESSIONS,
    MAX_PER_DAY,
    DELAY_MIN,
    DELAY_MAX,
  });

  while (true) {
    await processQueue();
    await processCommercialAlerts();
    await processInactiveCustomers();
    await sleep(LOOP_DELAY);
  }
}

loop().catch((error) => {
  console.error("[Zentra Worker] Erro fatal:", error);
  process.exit(1);
});
