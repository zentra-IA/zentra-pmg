import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SESSIONS = [1, 2, 3, 4, 5];

function isUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function toInt(value: unknown, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

async function getLead(leadId: string) {
  return prisma.leads.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      company_id: true,
      branch_id: true,
      phone: true,
      session_id: true,
      status: true,
      name: true,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId =
      searchParams.get("companyId") ||
      searchParams.get("company_id") ||
      null;

    const whereCompany = isUuid(companyId) ? { company_id: companyId as string } : {};

    const [pending, processing, sent, failed, paused] = await Promise.all([
      prisma.automation_queue.count({
        where: { ...whereCompany, status: "pending" },
      }),
      prisma.automation_queue.count({
        where: { ...whereCompany, status: "processing" },
      }),
      prisma.automation_queue.count({
        where: { ...whereCompany, status: "sent" },
      }),
      prisma.automation_queue.count({
        where: { ...whereCompany, status: "failed" },
      }),
      prisma.automation_queue.count({
        where: { ...whereCompany, status: "paused" },
      }),
    ]);

    const stats: Record<number, any> = {};

    for (const sessionId of SESSIONS) {
      const used = await prisma.automation_queue.count({
        where: {
          ...whereCompany,
          session_id: sessionId,
          status: "sent",
          sent_at: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      });

      const queued = await prisma.automation_queue.count({
        where: {
          ...whereCompany,
          session_id: sessionId,
          status: "pending",
        },
      });

      stats[sessionId] = {
        online: false,
        used,
        queued,
        limit: Number(process.env.CRM_MAX_PER_SESSION_DAY || 80),
      };
    }

    return NextResponse.json({
      success: true,
      pending,
      processing,
      sent,
      failed,
      paused,
      stats,
      antiban: {
        maxPerSessionDay: Number(process.env.CRM_MAX_PER_SESSION_DAY || 80),
        delayMinMs: Number(process.env.CRM_DELAY_MIN_MS || 120000),
        delayMaxMs: Number(process.env.CRM_DELAY_MAX_MS || 300000),
      },
    });
  } catch (error) {
    console.error("CRM_QUEUE_GET_ERROR", error);
    return NextResponse.json(
      { success: false, error: "Erro ao carregar fila." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const leadId = String(body.lead_id || body.leadId || "").trim();

    if (!isUuid(leadId)) {
      return NextResponse.json(
        { success: false, error: "lead_id inválido." },
        { status: 400 }
      );
    }

    const lead = await getLead(leadId);

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead não encontrado." },
        { status: 404 }
      );
    }

    const companyId = lead.company_id;

    if (!isUuid(companyId)) {
      return NextResponse.json(
        { success: false, error: "Lead sem company_id válido." },
        { status: 400 }
      );
    }

    const smartSession = Number(body.session_id ?? body.sessionId ?? lead.session_id ?? 1) === 0;

    const sessionId = smartSession
      ? 1
      : Math.max(1, Math.min(5, toInt(body.session_id ?? body.sessionId ?? lead.session_id, 1)));

    const intent = String(body.intent || body.type || "RH_ABERTURA").trim();

    const queueItem = await prisma.automation_queue.create({
      data: {
        company_id: companyId,
        branch_id: lead.branch_id || null,
        lead_id: lead.id,
        phone: normalizePhone(body.phone || lead.phone),
        session_id: sessionId,
        type: intent,
        status: "pending",
        scheduled_at: new Date(),
        attempts: 0,
        message: typeof body.message === "string" && body.message.trim() ? body.message.trim() : null,
      },
    });

    await prisma.leads.update({
      where: { id: lead.id },
      data: {
        status: "campanha",
        campaign_status: "queued" as any,
        current_job_id: isUuid(body.job_id || body.jobId) ? String(body.job_id || body.jobId) : undefined,
        batch_id: isUuid(body.batch_id || body.batchId) ? String(body.batch_id || body.batchId) : undefined,
        updated_at: new Date(),
      } as any,
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      item: queueItem,
    });
  } catch (error) {
    console.error("CRM_QUEUE_POST_ERROR", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar item na fila." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();

    if (!["pause", "resume", "retry"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Ação inválida." },
        { status: 400 }
      );
    }

    let result;

    if (action === "pause") {
      result = await prisma.automation_queue.updateMany({
        where: { status: "pending" },
        data: { status: "paused" },
      });
    }

    if (action === "resume") {
      result = await prisma.automation_queue.updateMany({
        where: { status: "paused" },
        data: { status: "pending" },
      });
    }

    if (action === "retry") {
      result = await prisma.automation_queue.updateMany({
        where: { status: "failed" },
        data: { status: "pending", attempts: 0, error: null },
      });
    }

    return NextResponse.json({
      success: true,
      updated: result?.count || 0,
    });
  } catch (error) {
    console.error("CRM_QUEUE_PATCH_ERROR", error);
    return NextResponse.json(
      { success: false, error: "Erro ao atualizar fila." },
      { status: 500 }
    );
  }
}
