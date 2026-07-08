import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

const LEGACY_TO_NEW: Record<string, string> = {
  respondido: "respondeu",
  interesse: "quer_agendar_entrevista",
  pedido: "entrevista_agendada",
  reativar_futuro: "reagendar_futuro",
  finalizado: "contratado",
  aprovado_entrevista: "aprovado",
  reprovado: "nao_aprovado",
  falta: "nao_compareceu",
};

const INBOX_STATUSES = [
  "respondeu",
  "quer_agendar_entrevista",
  "entrevista_agendada",
  "entrevista_confirmada",
  "campanha",
  "reagendar_futuro",
  "contratado",
  "sem_interesse",
  "nao_aprovado",
  "selecionado_vaga",
  "aprovado",
  "nao_compareceu",

  // compatibilidade antiga
  "respondido",
  "interesse",
  "pedido",
  "reativar_futuro",
  "finalizado",
];

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeStatus(status: any) {
  const value = clean(status || "novo");
  return LEGACY_TO_NEW[value] || value || "novo";
}

function normalizePhone(value: any) {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function normalizeLead(lead: any) {
  return {
    ...lead,
    status: normalizeStatus(lead.status),
    unread_count: lead.unread_count || 0,
    latest_received_at:
      lead.last_message_at || lead.updated_at || lead.created_at,
  };
}

async function enrichLeads(supabase: any, companyId: string, leads: any[]) {
  if (!leads.length) return [];

  const leadIds = leads.map((lead) => String(lead.id)).filter(Boolean);
  const leadPhones = [
    ...new Set(
      leads
        .map((lead) => normalizePhone(lead.phone || lead.mobile || lead.telefone))
        .filter(Boolean)
    ),
  ];

  let queueItems: any[] = [];

  try {
    let queueByLead = supabase
      .from("automation_queue")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(300);

    if (leadIds.length) {
      const { data } = await queueByLead.in("lead_id", leadIds);
      queueItems = [...queueItems, ...(data || [])];
    }

    if (leadPhones.length) {
      const { data } = await supabase
        .from("automation_queue")
        .select("*")
        .eq("company_id", companyId)
        .in("phone", leadPhones)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(300);

      queueItems = [...queueItems, ...(data || [])];
    }
  } catch (error) {
    console.error("ERRO ENRIQUECER INBOX COM FILA:", error);
  }

  const queueByLeadId = new Map<string, any>();
  const queueByPhone = new Map<string, any>();

  for (const item of queueItems) {
    if (item?.lead_id && !queueByLeadId.has(String(item.lead_id))) {
      queueByLeadId.set(String(item.lead_id), item);
    }

    const itemPhone = normalizePhone(item?.phone);
    if (itemPhone && !queueByPhone.has(itemPhone)) {
      queueByPhone.set(itemPhone, item);
    }
  }

  const effectiveLeads = leads.map((lead) => {
    const phone = normalizePhone(lead.phone || lead.mobile || lead.telefone);
    const queue =
      queueByLeadId.get(String(lead.id)) ||
      (phone ? queueByPhone.get(phone) : null) ||
      null;

    const jobId = lead.job_id || lead.current_job_id || queue?.job_id || null;
    const batchId = lead.batch_id || queue?.batch_id || null;

    return {
      ...lead,
      job_id: lead.job_id || jobId,
      current_job_id: lead.current_job_id || jobId,
      batch_id: lead.batch_id || batchId,
      _queueContext: queue,
    };
  });

  const jobIds = [
    ...new Set(
      effectiveLeads
        .map((lead) => lead.job_id || lead.current_job_id)
        .filter(Boolean)
        .map(String)
    ),
  ];

  const batchIds = [
    ...new Set(
      effectiveLeads.map((lead) => lead.batch_id).filter(Boolean).map(String)
    ),
  ];

  let jobs: any[] = [];
  let batches: any[] = [];

  if (jobIds.length) {
    const attempts = [
      () =>
        supabase
          .from("Job")
          .select("*")
          .eq("company_id", companyId)
          .in("id", jobIds),
      () =>
        supabase
          .from("jobs")
          .select("*")
          .eq("company_id", companyId)
          .in("id", jobIds),
      () =>
        supabase
          .from("rh_jobs")
          .select("*")
          .eq("company_id", companyId)
          .in("id", jobIds),
    ];

    for (const attempt of attempts) {
      try {
        const { data, error } = await attempt();
        if (!error && data?.length) {
          jobs = data;
          break;
        }
      } catch {}
    }
  }

  if (batchIds.length) {
    const { data } = await supabase
      .from("recruitment_batches")
      .select("*")
      .eq("company_id", companyId)
      .in("id", batchIds);

    batches = data || [];
  }

  const jobMap = new Map(jobs.map((job: any) => [String(job.id), job]));
  const batchMap = new Map(
    batches.map((batch: any) => [String(batch.id), batch])
  );

  return effectiveLeads.map((lead) => {
    const normalized = normalizeLead(lead);
    const jobId = normalized.job_id || normalized.current_job_id;
    const job = jobId ? jobMap.get(String(jobId)) || null : null;
    const batch = normalized.batch_id
      ? batchMap.get(String(normalized.batch_id)) || null
      : null;

    return {
      ...normalized,
      job,
      batch,
      job_title: job?.title || job?.name || normalized.job_title || null,
      batch_name: batch?.name || null,
    };
  });
}

async function getRelatedLeadIds(supabase: any, companyId: string, lead: any) {
  const ids = new Set<string>([lead.id]);

  if (lead.phone) {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", lead.phone);

    for (const item of data || []) ids.add(String(item.id));
  }

  if (lead.whatsapp_lid) {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("whatsapp_lid", lead.whatsapp_lid);

    for (const item of data || []) ids.add(String(item.id));
  }

  if (lead.remote_jid) {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("remote_jid", lead.remote_jid);

    for (const item of data || []) ids.add(String(item.id));
  }

  return [...ids];
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const { searchParams } = new URL(req.url);

    const leadId = clean(searchParams.get("leadId"));
    const q = clean(searchParams.get("q"));
    const jobId = clean(searchParams.get("jobId") || searchParams.get("job_id"));
    const batchId = clean(searchParams.get("batchId") || searchParams.get("batch_id"));

    if (leadId) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (leadError) throw new Error(leadError.message);

      if (!lead) return NextResponse.json([]);

      await supabase
        .from("leads")
        .update({
          unread_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id)
        .eq("company_id", companyId);

      const leadIds = await getRelatedLeadIds(supabase, companyId, lead);

      const { data: messages, error: msgError } = await supabase
        .from("messages")
        .select("*")
        .in("lead_id", leadIds.length ? leadIds : [lead.id])
        .order("created_at", { ascending: true });

      if (msgError) throw new Error(msgError.message);

      const finalMessages = [...(messages || [])];

      if (
        lead.last_message &&
        !finalMessages.some(
          (msg: any) =>
            String(msg.content || "").trim() ===
            String(lead.last_message || "").trim()
        )
      ) {
        finalMessages.push({
          id: `fallback-${lead.id}`,
          company_id: companyId,
          branch_id: lead.branch_id || null,
          lead_id: lead.id,
          direction: "received",
          topic: "whatsapp",
          extension: "text",
          content: lead.last_message,
          event: "message_received",
          payload: {},
          created_at:
            lead.last_message_at || lead.updated_at || lead.created_at,
        });
      }

      finalMessages.sort(
        (a: any, b: any) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );

      return NextResponse.json(finalMessages);
    }

    let query = supabase
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .in("status", INBOX_STATUSES)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (jobId) {
      query = query.or(`job_id.eq.${jobId},current_job_id.eq.${jobId}`);
    }

    if (batchId) {
      query = query.eq("batch_id", batchId);
    }

    if (q) {
      query = query.or(
        `name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,last_message.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const enriched = await enrichLeads(supabase, companyId, data || []);

    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error("GET /api/crm/inbox:", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao carregar inbox" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json();

    const leadId = clean(body.leadId || body.lead_id || body.id);

    if (!leadId) {
      return NextResponse.json(
        { error: "ID do contato obrigatório." },
        { status: 400 }
      );
    }

    const update: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.ai_paused !== undefined || body.aiPaused !== undefined) {
      update.ai_paused = Boolean(body.ai_paused ?? body.aiPaused);
    }

    if (body.paused !== undefined) update.paused = Boolean(body.paused);
    if (body.unread_count !== undefined) {
      update.unread_count = Number(body.unread_count || 0);
    }

    if (body.status !== undefined) {
      update.status = normalizeStatus(body.status);
    }

    if (body.job_id !== undefined || body.jobId !== undefined) {
      const jobId = clean(body.job_id || body.jobId) || null;
      update.job_id = jobId;
      update.current_job_id = jobId;
    }

    if (body.current_job_id !== undefined || body.currentJobId !== undefined) {
      update.current_job_id = clean(body.current_job_id || body.currentJobId) || null;
    }

    if (body.batch_id !== undefined || body.batchId !== undefined) {
      update.batch_id = clean(body.batch_id || body.batchId) || null;
    }

    const { data, error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", leadId)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data) {
      return NextResponse.json(
        { error: "Contato não encontrado." },
        { status: 404 }
      );
    }

    const [lead] = await enrichLeads(supabase, companyId, [data]);

    return NextResponse.json({
      success: true,
      lead,
    });
  } catch (error: any) {
    console.error("PATCH /api/crm/inbox:", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar conversa." },
      { status: 500 }
    );
  }
}
