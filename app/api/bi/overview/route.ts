import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase não configurado.");

  return createClient(url, key);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

async function safeCount(query: any) {
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

async function safeSelect(query: any) {
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

function groupByStatus(rows: any[], field = "status") {
  const map: Record<string, number> = {};

  for (const row of rows || []) {
    const key = row?.[field] || "sem_status";
    map[key] = (map[key] || 0) + 1;
  }

  return Object.entries(map).map(([status, total]) => ({ status, total }));
}

function toNumber(value: any) {
  return Number(value || 0);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const { searchParams } = new URL(req.url);

    const period = Number(searchParams.get("period") || 30);
    const since = daysAgo(period);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Date = in30.toISOString().slice(0, 10);

    const [
      candidates,
      openJobs,
      jobs,
      slots,
      hirings,
      docs,
      leads,
      queue,
      messages,
    ] = await Promise.all([
      safeCount(
        supabase
          .from("candidate_profiles")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
      ),
      safeCount(
        supabase
          .from("jobs")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["open", "active", "aberta"])
      ),
      safeSelect(
        supabase
          .from("jobs")
          .select("id,title,status,created_at")
          .eq("company_id", companyId)
          .gte("created_at", since)
          .limit(1000)
      ),
      safeSelect(
        supabase
          .from("rh_interview_slots")
          .select("*")
          .eq("company_id", companyId)
          .gte("created_at", since)
          .limit(3000)
      ),
      safeSelect(
        supabase
          .from("rh_hirings")
          .select("*")
          .eq("company_id", companyId)
          .gte("created_at", since)
          .limit(3000)
      ),
      safeSelect(
        supabase
          .from("rh_hiring_documents")
          .select("*")
          .eq("company_id", companyId)
          .limit(5000)
      ),
      safeSelect(
        supabase
          .from("leads")
          .select("*")
          .eq("company_id", companyId)
          .limit(5000)
      ),
      safeSelect(
        supabase
          .from("automation_queue")
          .select("*")
          .eq("company_id", companyId)
          .gte("created_at", since)
          .limit(5000)
      ),
      safeSelect(
        supabase
          .from("messages")
          .select("*")
          .eq("company_id", companyId)
          .gte("created_at", since)
          .limit(5000)
      ),
    ]);

    const interviews = slots.filter((s: any) =>
      ["reserved", "confirmed", "approved", "rejected", "no_show"].includes(s.status)
    );

    const confirmedInterviews = slots.filter((s: any) => s.status === "confirmed").length;
    const approved = slots.filter((s: any) => s.status === "approved").length;
    const rejected = slots.filter((s: any) => s.status === "rejected").length;
    const noShow = slots.filter((s: any) => s.status === "no_show").length;

    const pendingDocs = docs.filter((d: any) =>
      ["pending", "sent", "rejected"].includes(d.status)
    ).length;

    const lateDocs = docs.filter((d: any) => {
      return d.status !== "approved" && d.due_date && String(d.due_date).slice(0, 10) < today;
    }).length;

    const activeContracts = hirings.filter((h: any) => h.status === "hired").length;
    const endingContracts = hirings.filter((h: any) => {
      if (!h.end_date || h.status !== "hired") return false;
      const end = String(h.end_date).slice(0, 10);
      return end >= today && end <= in30Date;
    }).length;

    const hired = hirings.filter((h: any) =>
      ["hired", "documents_approved", "admission_scheduled"].includes(h.status)
    ).length;

    const sent = messages.filter((m: any) =>
      ["outbound", "sent"].includes(m.direction || m.type || m.status)
    ).length;

    const received = messages.filter((m: any) =>
      ["inbound", "received"].includes(m.direction || m.type || m.status)
    ).length;

    const queuePending = queue.filter((q: any) => q.status === "pending").length;
    const paused = leads.filter((l: any) => l.ai_paused === true || l.paused === true).length;
    const noResponse = leads.filter((l: any) => ["enviado", "campanha"].includes(l.status)).length;

    const jobsMap: Record<string, any> = {};

    for (const job of jobs) {
      jobsMap[job.id] = {
        id: job.id,
        title: job.title || "Vaga",
        total: 0,
        approved: 0,
        hired: 0,
      };
    }

    for (const slot of slots) {
      const key = slot.job_id || "sem_vaga";
      if (!jobsMap[key]) {
        jobsMap[key] = {
          id: key,
          title: slot.title || "Sem vaga",
          total: 0,
          approved: 0,
          hired: 0,
        };
      }

      jobsMap[key].total += 1;
      if (slot.status === "approved") jobsMap[key].approved += 1;
    }

    for (const hiring of hirings) {
      const key = hiring.job_id || "sem_vaga";
      if (!jobsMap[key]) {
        jobsMap[key] = {
          id: key,
          title: hiring.job_title || "Sem vaga",
          total: 0,
          approved: 0,
          hired: 0,
        };
      }

      if (hiring.status === "hired") jobsMap[key].hired += 1;
    }

    const topJobs = Object.values(jobsMap)
      .sort((a: any, b: any) => b.total - a.total)
      .slice(0, 8);

    const funnel = [
      { label: "Leads/Candidatos", value: candidates + leads.length },
      { label: "Responderam", value: leads.filter((l: any) => ["respondeu", "respondido"].includes(l.status)).length },
      { label: "Quer agendar", value: leads.filter((l: any) => l.status === "quer_agendar_entrevista").length },
      { label: "Entrevistas", value: interviews.length },
      { label: "Confirmadas", value: confirmedInterviews },
      { label: "Aprovados", value: approved },
      { label: "Admissões", value: hirings.length },
      { label: "Contratos ativos", value: activeContracts },
    ];

    const avgDaysToHire = 0;

    const alerts = [];

    if (lateDocs > 0) {
      alerts.push({
        icon: "⚠️",
        title: "Documentos atrasados",
        message: `${lateDocs} documento(s) estão com prazo vencido.`,
      });
    }

    if (endingContracts > 0) {
      alerts.push({
        icon: "⏰",
        title: "Contratos vencendo",
        message: `${endingContracts} contrato(s) vencem nos próximos 30 dias.`,
      });
    }

    if (noShow > 0) {
      alerts.push({
        icon: "🚫",
        title: "Não comparecimento",
        message: `${noShow} candidato(s) não compareceram à entrevista no período.`,
      });
    }

    return NextResponse.json({
      success: true,
      period,
      metrics: {
        candidates,
        openJobs,
        jobs: jobs.length,
        interviews: interviews.length,
        confirmedInterviews,
        approved,
        rejected,
        noShow,
        hirings: hirings.length,
        pendingDocs,
        lateDocs,
        activeContracts,
        endingContracts,
        conversionRate: pct(activeContracts, candidates + leads.length),
      },
      whatsapp: {
        sent,
        received,
        responseRate: pct(received, sent),
        queuePending,
        paused,
        noResponse,
      },
      efficiency: {
        attendanceRate: pct(interviews.length - noShow, interviews.length),
        approvalRate: pct(approved, interviews.length),
        hiringRate: pct(activeContracts, approved || hirings.length),
        avgDaysToHire,
      },
      funnel,
      topJobs,
      documents: groupByStatus(docs),
      contracts: groupByStatus(hirings),
      alerts,
    });
  } catch (error: any) {
    console.error("GET /api/bi/overview:", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao carregar BI." },
      { status: 500 }
    );
  }
}
