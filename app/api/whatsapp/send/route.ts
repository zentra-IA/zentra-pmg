import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

// Antiban manual: limite por sessão/WhatsApp por dia.
// Pode ajustar no .env.local com CRM_MAX_PER_SESSION_DAY=80
const MAX_PER_SESSION_DAY = Number(process.env.CRM_MAX_PER_SESSION_DAY || 80);

function clean(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: any) {
  const phone = clean(value);

  if (!phone) return "";
  if (phone.startsWith("55")) return phone;
  if (phone.length === 10 || phone.length === 11) return `55${phone}`;

  return phone;
}

function normalizeLid(value: any) {
  if (!value) return null;

  const raw = String(value);

  if (raw.includes("@lid")) return raw;

  const cleaned = clean(raw);

  return cleaned ? `${cleaned}@lid` : null;
}

function normalizeSessionNumber(value: any) {
  const number = Number(value || 1);

  if (!Number.isFinite(number) || number < 1) return 1;

  return Math.round(number);
}

function buildSession(companyId: string, sessionId: string | number) {
  return `${companyId}_${sessionId || 1}`;
}

async function isSessionOnline(companyId: string, sessionNumber: number) {
  try {
    const finalSessionId = buildSession(companyId, sessionNumber);

    const res = await fetch(`${WHATSAPP_SERVER}/status/${finalSessionId}`, {
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    return data.status === "online" && Boolean(data?.me?.id || data?.me);
  } catch {
    return false;
  }
}

async function countQueueSentToday(companyId: string, sessionNumber: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("automation_queue")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("session_id", sessionNumber)
    .eq("status", "sent")
    .gte("sent_at", today.toISOString());

  return count || 0;
}

async function countManualSentToday(companyId: string, finalSessionId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("direction", "sent")
    .eq("topic", "whatsapp")
    .contains("payload", {
      company_id: companyId,
      session_id: finalSessionId,
    })
    .gte("created_at", today.toISOString());

  return count || 0;
}

async function countTotalSentToday(
  companyId: string,
  sessionNumber: number,
  finalSessionId: string
) {
  const [queueSent, manualSent] = await Promise.all([
    countQueueSentToday(companyId, sessionNumber),
    countManualSentToday(companyId, finalSessionId),
  ]);

  return queueSent + manualSent;
}

function nextLeadStatus(currentStatus: any) {
  const status = String(currentStatus || "novo").trim();

  const legacyMap: Record<string, string> = {
    respondido: "respondeu",
    interesse: "quer_agendar_entrevista",
    pedido: "entrevista_agendada",
    reativar_futuro: "reagendar_futuro",
    finalizado: "contratado",
  };

  const normalized = legacyMap[status] || status;

  if (!normalized || normalized === "novo") return "enviado";

  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    const companyId =
      await getCompanyId(req) ||
      process.env.DEFAULT_COMPANY_ID ||
      "41edd938-3eb4-420e-9675-2e53703ed70b";

    const body = await req.json();

    const contactId = body.contactId || body.leadId || body.id;
    const message = String(body.message || "").trim();
    const sessionNumber = normalizeSessionNumber(
      body.sessionId || body.session_id || "1"
    );

    if (!contactId || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "contactId/leadId e message obrigatórios",
        },
        { status: 400 }
      );
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", contactId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !lead) {
      return NextResponse.json(
        {
          success: false,
          error: "Contato não encontrado nesta empresa",
        },
        { status: 404 }
      );
    }

    const finalSession = buildSession(companyId, sessionNumber);

    const online = await isSessionOnline(companyId, sessionNumber);

    if (!online) {
      return NextResponse.json(
        {
          success: false,
          error: `WhatsApp ${sessionNumber} não está online.`,
        },
        { status: 400 }
      );
    }

    const usedToday = await countTotalSentToday(
      companyId,
      sessionNumber,
      finalSession
    );

    if (usedToday >= MAX_PER_SESSION_DAY) {
      return NextResponse.json(
        {
          success: false,
          error: `WhatsApp ${sessionNumber} atingiu o limite diário de ${MAX_PER_SESSION_DAY} disparos.`,
          usedToday,
          limit: MAX_PER_SESSION_DAY,
        },
        { status: 429 }
      );
    }

    const lid = normalizeLid(lead.whatsapp_lid || lead.remote_jid);
    const phone = lid ? "" : normalizePhone(lead.phone || lead.telefone || lead.mobile || "");

    if (!phone && !lid) {
      return NextResponse.json(
        {
          success: false,
          error: "Contato sem telefone ou LID válido",
        },
        { status: 400 }
      );
    }

    const response = await fetch(`${WHATSAPP_SERVER}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: finalSession,
        number: phone,
        phone,
        lid,
        jid: lid,
        message,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Falha ao enviar pelo WhatsApp",
          result,
        },
        { status: 500 }
      );
    }

    await supabase.from("messages").insert({
      lead_id: lead.id,
      direction: "sent",
      topic: "whatsapp",
      extension: "text",
      content: message,
      event: "manual_message_sent",
      payload: {
        company_id: companyId,
        session_number: sessionNumber,
        session_id: finalSession,
        jid: result.jid || null,
        message_id: result.messageId || null,
        antiban_limit: MAX_PER_SESSION_DAY,
        sent_today_before_this_message: usedToday,
      },
      created_at: new Date().toISOString(),
    });

    await supabase
      .from("leads")
      .update({
        status: nextLeadStatus(lead.status),
        last_message: message,
        last_message_at: new Date().toISOString(),
        campaign_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .eq("company_id", companyId);

    return NextResponse.json({
      success: true,
      sessionId: finalSession,
      sessionNumber,
      phone,
      lid,
      usedToday: usedToday + 1,
      remainingToday: Math.max(0, MAX_PER_SESSION_DAY - usedToday - 1),
      limit: MAX_PER_SESSION_DAY,
      result,
    });
  } catch (error: any) {
    console.error("WHATSAPP SEND ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao enviar WhatsApp",
      },
      { status: 500 }
    );
  }
}
