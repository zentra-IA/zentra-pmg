import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const CUSTOMER_TABLES = ["Customer", "customers", "CrmCustomer", "crm_customers", "contacts", "leads"];
const MAX_PER_SESSION_DAY = Number(process.env.CRM_MAX_PER_SESSION_DAY || 80);

const CAMPAIGN_MESSAGES: Record<string, string> = {
  PROMOCAO_DIARIA:
    "Olá {cliente}, tudo bem? Aqui é da PMG Atacadista. Hoje temos uma condição especial para {segmento}. Quer que eu te envie a oferta do dia?",
  REATIVACAO:
    "Olá {cliente}, tudo bem? Sentimos sua falta aqui na PMG. Posso te mandar as melhores condições de hoje para repor seu estoque?",
  FOLLOW_UP_COTACAO:
    "Olá {cliente}, tudo bem? Passando para acompanhar sua cotação. Consigo verificar uma condição melhor para você fechar hoje?",
  AUMENTAR_MIX:
    "Olá {cliente}, vi aqui que seu perfil combina com alguns itens de giro alto. Quer que eu te mande sugestões para aumentar o mix da sua loja?",
  PEDIDO_SEMANAL:
    "Olá {cliente}, tudo bem? Hoje é um bom dia para organizar seu pedido da semana. Quer que eu te ajude com a reposição?",
  COBRANCA_LEMBRETE:
    "Olá {cliente}, tudo bem? Estou passando para alinhar seu pedido/pagamento e deixar tudo certo com a PMG.",
};

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizePhone(value: any) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
}

function getName(customer: any) {
  return (
    customer?.nome_fantasia ||
    customer?.fantasy_name ||
    customer?.razao_social ||
    customer?.name ||
    customer?.nome ||
    "Cliente"
  );
}

function getSegment(customer: any) {
  return customer?.segmento || customer?.segment || customer?.category || "cliente";
}

function getCity(customer: any) {
  return customer?.cidade || customer?.city || "";
}

function getPhone(customer: any) {
  return (
    customer?.whatsapp ||
    customer?.celular ||
    customer?.phone ||
    customer?.telefone ||
    customer?.mobile ||
    ""
  );
}

function getLastDate(customer: any) {
  return (
    customer?.last_order_at ||
    customer?.last_order ||
    customer?.last_purchase_at ||
    customer?.updated_at ||
    customer?.updatedAt ||
    customer?.created_at ||
    customer?.createdAt
  );
}

function daysStopped(customer: any) {
  const date = getLastDate(customer);

  if (!date) return 9999;

  const diff = Date.now() - new Date(date).getTime();

  if (Number.isNaN(diff)) return 9999;

  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function fillTemplate(template: string, customer: any) {
  return String(template || "")
    .replaceAll("{cliente}", getName(customer))
    .replaceAll("{nome}", getName(customer))
    .replaceAll("{segmento}", getSegment(customer))
    .replaceAll("{cidade}", getCity(customer) || "sua região")
    .replaceAll("{whatsapp}", String(getPhone(customer) || ""))
    .replaceAll("{vendedor}", customer?.seller_name || customer?.representante || "seu representante PMG")
    .replaceAll("{empresa}", "PMG Atacadista");
}

async function findReadableCustomerTable(supabase: any) {
  for (const table of CUSTOMER_TABLES) {
    const { error } = await supabase.from(table).select("id", { count: "exact", head: true }).limit(1);

    if (!error) return table;
  }

  throw new Error("Nenhuma tabela de clientes encontrada. Verifique se Customer/customers existe no Supabase.");
}

async function fetchCustomers(req: NextRequest, companyId: string) {
  const supabase = getSupabase();
  const table = await findReadableCustomerTable(supabase);
  const url = new URL(req.url);

  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const segment = String(url.searchParams.get("segment") || "").trim().toLowerCase();
  const city = String(url.searchParams.get("city") || "").trim().toLowerCase();
  const status = String(url.searchParams.get("status") || "TODOS").trim().toLowerCase();
  const targetDays = Number(url.searchParams.get("targetDays") || 0);

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .limit(500);

  if (error) throw new Error(error.message);

  let customers = Array.isArray(data) ? data : [];

  customers = customers.filter((customer) => {
    const phone = normalizePhone(getPhone(customer));
    if (!phone) return false;

    const customerStatus = String(customer?.status || "ativo").toLowerCase();
    if (status && status !== "todos" && customerStatus !== status) return false;

    if (targetDays > 0 && daysStopped(customer) < targetDays) return false;

    if (q) {
      const haystack = [
        getName(customer),
        customer?.cnpj_cpf,
        customer?.document,
        customer?.cpf,
        customer?.cnpj,
        getPhone(customer),
        customer?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    if (segment && !getSegment(customer).toLowerCase().includes(segment)) return false;
    if (city && !getCity(customer).toLowerCase().includes(city)) return false;

    return true;
  });

  return { table, customers };
}

async function getQueueStats(supabase: any, companyId: string) {
  const { data } = await supabase
    .from("automation_queue")
    .select("status")
    .eq("company_id", companyId);

  const rows = Array.isArray(data) ? data : [];

  return rows.reduce(
    (acc: any, item: any) => {
      const status = item?.status || "pending";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { pending: 0, sent: 0, error: 0, paused: 0 }
  );
}

async function countSessionToday(supabase: any, companyId: string, session: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("automation_queue")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("session_id", session)
    .in("status", ["pending", "sent"])
    .gte("scheduled_at", today.toISOString());

  return count || 0;
}

function randomDelay(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);

    if (new URL(req.url).searchParams.get("stats") === "1") {
      return NextResponse.json({
        success: true,
        queue: await getQueueStats(supabase, companyId),
      });
    }

    const { table, customers } = await fetchCustomers(req, companyId);

    return NextResponse.json({
      success: true,
      table,
      customers,
      leads: customers,
      queue: await getQueueStats(supabase, companyId),
    });
  } catch (error: any) {
    console.error("CRM CAMPAIGNS GET:", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao listar clientes da campanha." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    const campaignType = String(body?.campaignType || "PROMOCAO_DIARIA");
    const selectedWpp = Array.isArray(body?.selectedWpp)
      ? body.selectedWpp.map(Number).filter(Boolean)
      : [1];

    const selectedCustomerIds = Array.isArray(body?.selectedCustomerIds)
      ? body.selectedCustomerIds.map(String)
      : [];

    const messageTemplate = String(body?.message || CAMPAIGN_MESSAGES[campaignType] || CAMPAIGN_MESSAGES.PROMOCAO_DIARIA);

    const fakeReq = new NextRequest(req.url, { headers: req.headers });
    const { table, customers: eligibleCustomers } = await fetchCustomers(fakeReq, companyId);

    const customers = selectedCustomerIds.length
      ? eligibleCustomers.filter((customer) => selectedCustomerIds.includes(String(customer.id)))
      : eligibleCustomers;

    if (!customers.length) {
      return NextResponse.json({ error: "Nenhum cliente elegível encontrado." }, { status: 400 });
    }

    if (!selectedWpp.length) {
      return NextResponse.json({ error: "Selecione pelo menos um WhatsApp." }, { status: 400 });
    }

    const { data: campaign } = await supabase
      .from("promotion_campaigns")
      .insert({
        company_id: companyId,
        branch_id: branchId || null,
        name: `Campanha ${campaignType}`,
        message: messageTemplate,
        whatsapp_accounts: selectedWpp,
        target_days: Number(body?.targetDays || 0),
        total_queued: 0,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    let scheduledAt = new Date(Date.now() + 30_000);
    let queued = 0;
    let sessionIndex = 0;

    for (const customer of customers) {
      const phone = normalizePhone(getPhone(customer));
      if (!phone) continue;

      let sessionId = selectedWpp[sessionIndex % selectedWpp.length] || 1;
      sessionIndex++;

      const usedToday = await countSessionToday(supabase, companyId, sessionId);
      if (usedToday >= MAX_PER_SESSION_DAY) {
        const alternative = selectedWpp.find(async (session) => {
          const total = await countSessionToday(supabase, companyId, session);
          return total < MAX_PER_SESSION_DAY;
        });

        sessionId = alternative || sessionId;
      }

      const message = fillTemplate(messageTemplate, customer);

      const { error: queueError } = await supabase.from("automation_queue").insert({
        company_id: companyId,
        branch_id: branchId || null,
        phone,
        session_id: sessionId,
        type: "commercial_campaign",
        status: "pending",
        scheduled_at: scheduledAt.toISOString(),
        created_at: new Date().toISOString(),
        attempts: 0,
        message,
        campaign_id: campaign?.id || null,
      });

      if (!queueError) {
        queued++;
        scheduledAt = new Date(scheduledAt.getTime() + randomDelay(90_000, 240_000));
      }
    }

    if (campaign?.id) {
      await supabase
        .from("promotion_campaigns")
        .update({ total_queued: queued })
        .eq("id", campaign.id);
    }

    return NextResponse.json({
      success: true,
      queued,
      campaign,
      table,
    });
  } catch (error: any) {
    console.error("CRM CAMPAIGNS POST:", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao iniciar campanha." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json();

    const action = String(body?.action || "").trim();

    if (!["pause", "resume"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    const currentStatus = action === "pause" ? "pending" : "paused";
    const nextStatus = action === "pause" ? "paused" : "pending";

    const { data, error } = await supabase
      .from("automation_queue")
      .update({ status: nextStatus })
      .eq("company_id", companyId)
      .eq("status", currentStatus)
      .select("id");

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      updated: data?.length || 0,
    });
  } catch (error: any) {
    console.error("CRM CAMPAIGNS PATCH:", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao atualizar fila." },
      { status: 500 }
    );
  }
}
