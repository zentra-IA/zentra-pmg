import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER ||
  process.env.WHATSAPP_SERVER ||
  "http://localhost:3011";

const DEFAULT_SESSION = Number(process.env.RH_REMINDER_SESSION || 1);

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

function onlyDigits(value: any) {
  return clean(value).replace(/\D/g, "");
}

function normalizePhone(value: any) {
  let digits = onlyDigits(value);
  if (!digits) return "";
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}

function normalizeLid(value: any) {
  const text = clean(value);
  if (!text) return null;

  if (text.includes("@lid") || text.includes("@s.whatsapp.net")) {
    return text;
  }

  return null;
}

function buildSession(companyId: string, lead: any) {
  const sessionId = Number(lead?.session_id || DEFAULT_SESSION || 1);
  return `${companyId}_${sessionId}`;
}

function getDestination(lead: any, fallbackPhone?: any) {
  /*
    Inbox manual:
    - Prioridade absoluta: telefone real do lead ou informado pelo front.
    - Se NÃO existir telefone real mas existir @lid, permite responder por @lid.
    - Nunca transforma @lid em phone.
  */

  const phone = normalizePhone(
    lead?.phone ||
      lead?.mobile ||
      lead?.telefone ||
      fallbackPhone ||
      ""
  );

  if (phone) {
    return {
      number: phone,
      phone,
      lid: null,
      jid: `${phone}@s.whatsapp.net`,
      isLid: false,
    };
  }

  const lid = normalizeLid(lead?.whatsapp_lid || lead?.remote_jid);

  if (lid && String(lid).includes("@lid")) {
    return {
      number: "",
      phone: "",
      lid,
      jid: lid,
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

async function sendToWhatsapp(payload: any) {
  const res = await fetch(`${WHATSAPP_SERVER}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

async function saveSentMessage({
  supabase,
  companyId,
  branchId,
  leadId,
  message,
  whatsappResult,
}: {
  supabase: any;
  companyId: string;
  branchId?: string | null;
  leadId: string;
  message: string;
  whatsappResult: any;
}) {
  const { error } = await supabase.from("messages").insert({
    company_id: companyId,
    branch_id: branchId || null,
    lead_id: leadId,
    direction: "sent",
    topic: "whatsapp",
    extension: "text",
    content: message,
    event: "message_sent",
    payload: {
      source: "inbox_manual",
      whatsapp_message_id: whatsappResult?.messageId || null,
      jid: whatsappResult?.jid || null,
    },
    status: "sent",
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("ERRO AO SALVAR MENSAGEM MANUAL:", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json();

    const leadId = clean(body.leadId || body.lead_id || body.id);
    const message = clean(body.message || body.text || body.body);
    const fallbackPhone = clean(body.phone || body.number || body.telefone);

    if (!leadId) {
      return NextResponse.json(
        { success: false, error: "leadId obrigatório." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Mensagem obrigatória." },
        { status: 400 }
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) throw new Error(leadError.message);

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead não encontrado nesta empresa." },
        { status: 404 }
      );
    }

    const destination = getDestination(lead, fallbackPhone);

    if (!destination.phone && !destination.lid && !destination.jid) {
      console.warn("WHATSAPP INBOX SKIPPED_NO_DESTINATION:", {
        leadId: lead.id,
        leadName: lead.name,
        leadPhone: lead.phone,
        fallbackPhone,
        lid: lead.whatsapp_lid,
        remoteJid: lead.remote_jid,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "Este contato não tem telefone nem identificador WhatsApp válido para resposta.",
        },
        { status: 400 }
      );
    }

    if (!lead.phone && destination.phone) {
      await supabase
        .from("leads")
        .update({
          phone: destination.phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id)
        .eq("company_id", companyId);
    }

    const sessionId = buildSession(companyId, lead);

    const result = await sendToWhatsapp({
      sessionId,
      ...destination,
      message,
    });

    await saveSentMessage({
      supabase,
      companyId,
      branchId: lead.branch_id || null,
      leadId: lead.id,
      message,
      whatsappResult: result,
    });

    await supabase
      .from("leads")
      .update({
        last_message: message,
        last_message_at: new Date().toISOString(),
        ai_paused: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .eq("company_id", companyId);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("POST /api/whatsapp/inbox-send:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao enviar mensagem pelo inbox.",
      },
      { status: 500 }
    );
  }
}
