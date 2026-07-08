import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = [
  "novo",
  "enviado",
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
];

const LEGACY_TO_NEW: Record<string, string> = {
  respondido: "respondeu",
  interesse: "quer_agendar_entrevista",
  pedido: "entrevista_agendada",
  reativar_futuro: "reagendar_futuro",
  finalizado: "contratado",
  aprovado_entrevista: "aprovado",
  reprovado: "nao_aprovado",
  rejected: "nao_aprovado",
  hired: "contratado",
  finished: "contratado",
  approved: "aprovado",
  falta: "nao_compareceu",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(url, key);
}

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeStatus(value: any) {
  const status = clean(value);
  return LEGACY_TO_NEW[status] || status;
}

function safeDate(value: any) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function syncHiringStatus({
  supabase,
  companyId,
  leadId,
  status,
}: {
  supabase: any;
  companyId: string;
  leadId: string;
  status: string;
}) {
  const hiringStatusMap: Record<string, string> = {
    contratado: "hired",
    aprovado: "pending_documents",
    nao_aprovado: "canceled",
    sem_interesse: "canceled",
    nao_compareceu: "canceled",
  };

  const hiringStatus = hiringStatusMap[status];

  if (!hiringStatus) return;

  const { error } = await supabase
    .from("rh_hirings")
    .update({
      status: hiringStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("lead_id", leadId);

  if (error) {
    console.error("SYNC HIRING STATUS ERROR:", error);
  }
}

async function syncInterviewStatus({
  supabase,
  companyId,
  leadId,
  status,
}: {
  supabase: any;
  companyId: string;
  leadId: string;
  status: string;
}) {
  const interviewStatusMap: Record<string, string> = {
    entrevista_confirmada: "confirmed",
    aprovado: "approved",
    nao_aprovado: "rejected",
    nao_compareceu: "no_show",
  };

  const interviewStatus = interviewStatusMap[status];

  if (!interviewStatus) return;

  const { error } = await supabase
    .from("rh_interview_slots")
    .update({
      status: interviewStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("lead_id", leadId);

  if (error) {
    console.error("SYNC INTERVIEW STATUS ERROR:", error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await await requireCompany(req);
    const body = await req.json();

    const id = clean(body?.id || body?.leadId || body?.lead_id);
    const status = normalizeStatus(body?.status);

    if (!id) {
      return NextResponse.json(
        { error: "ID do contato é obrigatório." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Status inválido.", allowed: ALLOWED_STATUSES },
        { status: 400 }
      );
    }

    const update: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (body?.job_id !== undefined || body?.jobId !== undefined) {
      const jobId = clean(body.job_id || body.jobId) || null;
      update.job_id = jobId;
      update.current_job_id = jobId;
    }

    if (body?.current_job_id !== undefined || body?.currentJobId !== undefined) {
      update.current_job_id =
        clean(body.current_job_id || body.currentJobId) || null;
    }

    if (body?.batch_id !== undefined || body?.batchId !== undefined) {
      update.batch_id = clean(body.batch_id || body.batchId) || null;
    }

    if (body?.last_message !== undefined || body?.lastMessage !== undefined) {
      update.last_message = clean(body.last_message || body.lastMessage) || null;
      update.last_message_at = new Date().toISOString();
    }

    if (body?.ai_paused !== undefined || body?.aiPaused !== undefined) {
      update.ai_paused = Boolean(body.ai_paused ?? body.aiPaused);
    }

    if (body?.paused !== undefined) {
      update.paused = Boolean(body.paused);
    }

    if (["contratado", "aprovado", "nao_aprovado", "nao_compareceu", "sem_interesse"].includes(status)) {
      update.ai_paused = true;
      update.paused = true;
      update.campaign_status = null;
    }

    if (status === "campanha") {
      update.campaign_step = 0;
      update.campaign_status = "pending";
    }

    if (status === "reagendar_futuro") {
      update.reactivation_at = safeDate(body?.reactivationAt || body?.reactivation_at);
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!lead) {
      return NextResponse.json(
        { error: "Contato não encontrado para esta empresa." },
        { status: 404 }
      );
    }

    await syncHiringStatus({
      supabase,
      companyId,
      leadId: id,
      status,
    });

    await syncInterviewStatus({
      supabase,
      companyId,
      leadId: id,
      status,
    });

    return NextResponse.json({
      success: true,
      id,
      status,
      lead,
    });
  } catch (error: any) {
    console.error("CRM LEADS STATUS PATCH:", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar status." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return PATCH(req);
}
