import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireCompanyAccess } from "@/lib/server-company";
import { buildWhatsappSessionKey } from "@/lib/whatsapp-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

// Antiban manual: limite por sessão/WhatsApp por dia.
// Pode ajustar no .env.local com CRM_MAX_PER_SESSION_DAY=80
const MAX_PER_SESSION_DAY = Number(
  process.env.CRM_MAX_PER_SESSION_DAY || 80
);

function clean(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: any) {
  const phone = clean(value);

  if (!phone) return "";
  if (phone.startsWith("55")) return phone;
  if (phone.length === 10 || phone.length === 11) {
    return `55${phone}`;
  }

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

function buildSession(
  companyId: string,
  userId: string,
  sessionId: string | number
) {
  return buildWhatsappSessionKey({
    companyId,
    userId,
    sessionId: sessionId || 1,
  });
}

async function isSessionOnline(
  companyId: string,
  userId: string,
  sessionNumber: number
) {
  try {
    const finalSessionId = buildSession(
      companyId,
      userId,
      sessionNumber
    );

    const res = await fetch(
      `${WHATSAPP_SERVER}/status/${finalSessionId}`,
      {
        cache: "no-store",
      }
    );

    const data = await res.json().catch(() => ({}));

    return (
      data.status === "online" &&
      Boolean(data?.me?.id || data?.me)
    );
  } catch {
    return false;
  }
}

async function countQueueSentToday(
  companyId: string,
  userId: string,
  sessionNumber: number
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("automation_queue")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .eq("session_id", sessionNumber)
    .eq("status", "sent")
    .gte("sent_at", today.toISOString());

  if (error) {
    console.error(
      "WHATSAPP_SEND_COUNT_QUEUE_ERROR:",
      error
    );
    return 0;
  }

  return count || 0;
}

async function countManualSentToday(
  companyId: string,
  userId: string,
  finalSessionId: string
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("direction", "sent")
    .eq("topic", "whatsapp")
    .contains("payload", {
      company_id: companyId,
      user_id: userId,
      session_id: finalSessionId,
    })
    .gte("created_at", today.toISOString());

  if (error) {
    console.error(
      "WHATSAPP_SEND_COUNT_MANUAL_ERROR:",
      error
    );
    return 0;
  }

  return count || 0;
}

async function countTotalSentToday(
  companyId: string,
  userId: string,
  sessionNumber: number,
  finalSessionId: string
) {
  const [queueSent, manualSent] = await Promise.all([
    countQueueSentToday(companyId, userId, sessionNumber),
    countManualSentToday(companyId, userId, finalSessionId),
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

  if (!normalized || normalized === "novo") {
    return "enviado";
  }

  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        {
          success: false,
          error: "Acesso negado.",
        },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Empresa ou usuário não identificado.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const contactId =
      body.contactId || body.leadId || body.id;

    const message = String(body.message || "").trim();

    const sessionNumber = normalizeSessionNumber(
      body.sessionId || body.session_id || "1"
    );

    if (!contactId || !message) {
      return NextResponse.json(
        {
          success: false,
          error:
            "contactId/leadId e message obrigatórios",
        },
        { status: 400 }
      );
    }

    let leadQuery = supabase
      .from("leads")
      .select("*")
      .eq("id", contactId)
      .eq("company_id", companyId);

    if (role === "VENDEDOR") {
      leadQuery = leadQuery.eq("owner_user_id", userId);
    }

    const { data: lead, error: leadError } =
      await leadQuery.maybeSingle();

    if (leadError || !lead) {
      return NextResponse.json(
        {
          success: false,
          error: "Contato não encontrado nesta empresa",
        },
        { status: 404 }
      );
    }

    const finalSession = buildSession(
      companyId,
      userId,
      sessionNumber
    );

    const online = await isSessionOnline(
      companyId,
      userId,
      sessionNumber
    );

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
      userId,
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

    const lid = normalizeLid(
      lead.whatsapp_lid || lead.remote_jid
    );

    const normalizedLeadPhone = normalizePhone(
      lead.phone || lead.telefone || lead.mobile || ""
    );

    const phone = lid ? "" : normalizedLeadPhone;

    if (!phone && !lid) {
      return NextResponse.json(
        {
          success: false,
          error: "Contato sem telefone ou LID válido",
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${WHATSAPP_SERVER}/send`,
      {
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
      }
    );

    const result = await response
      .json()
      .catch(() => ({}));

    if (!response.ok || result.success === false) {
      return NextResponse.json(
        {
          success: false,
          error:
            result.error ||
            "Falha ao enviar pelo WhatsApp",
          result,
        },
        { status: 500 }
      );
    }

    const sentAt = new Date().toISOString();

    /*
     * Mantém o comportamento original:
     * registra a mensagem enviada na tabela messages.
     *
     * O erro é registrado no log, mas não transforma um envio já
     * confirmado pelo WhatsApp em falha para o usuário.
     */
    const { error: messageInsertError } = await supabase
      .from("messages")
      .insert({
        lead_id: lead.id,
        direction: "sent",
        topic: "whatsapp",
        extension: "text",
        content: message,
        event: "manual_message_sent",
        payload: {
          company_id: companyId,
          user_id: userId,
          session_number: sessionNumber,
          session_id: finalSession,
          jid: result.jid || null,
          message_id: result.messageId || null,
          antiban_limit: MAX_PER_SESSION_DAY,
          sent_today_before_this_message: usedToday,
        },
        created_at: sentAt,
      });

    if (messageInsertError) {
      console.error(
        "WHATSAPP_SEND_MESSAGE_INSERT_ERROR:",
        messageInsertError
      );
    }

    /*
     * Sincronização com o Command Center.
     *
     * A atividade identifica o vendedor responsável pelo lead.
     * Ela é best-effort: se falhar, o envio do WhatsApp continua
     * sendo considerado bem-sucedido.
     */
    let commandCenterSynced = false;

try {
  console.log("=== TESTE COMMAND CENTER ===");

  await prisma.salesCustomerActivity.create({
    data: {
      company_id: companyId,
      seller_id: userId,
      customer_id: null,
      lead_id: lead.id,
      phone: normalizedLeadPhone || null,
      type: "mensagem",
      origin: "whatsapp",
      title: "Mensagem enviada",
      description: message,
      priority: "media",
      status: "concluida",
      created_at: new Date(sentAt),
    },
  });

  console.log("ATIVIDADE GRAVADA COM SUCESSO");

  commandCenterSynced = true;
} catch (activityError) {
  console.error("ERRO AO GRAVAR ATIVIDADE");
  console.error(activityError);
}

    /*
     * Atualiza o lead sem bloquear o envio caso o CRM falhe.
     */
    let leadUpdateQuery = supabase
      .from("leads")
      .update({
        status: nextLeadStatus(lead.status),
        last_message: message,
        last_message_at: sentAt,
        campaign_sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq("id", lead.id)
      .eq("company_id", companyId);

    if (role === "VENDEDOR") {
      leadUpdateQuery = leadUpdateQuery.eq(
        "owner_user_id",
        userId
      );
    }

    const { error: leadUpdateError } = await leadUpdateQuery;

    if (leadUpdateError) {
      console.error(
        "WHATSAPP_SEND_LEAD_UPDATE_ERROR:",
        leadUpdateError
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: finalSession,
      sessionNumber,
      userId,
      phone,
      lid,
      usedToday: usedToday + 1,
      remainingToday: Math.max(
        0,
        MAX_PER_SESSION_DAY - usedToday - 1
      ),
      limit: MAX_PER_SESSION_DAY,
      commandCenterSynced,
      result,
    });
  } catch (error: any) {
    console.error("WHATSAPP SEND ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "Erro ao enviar WhatsApp",
      },
      { status: 500 }
    );
  }
}
