import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

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

async function sendWhatsApp({
  sessionId,
  number,
  message,
}: {
  sessionId: number;
  number: string;
  message: string;
}) {
  const res = await fetch(`${WHATSAPP_SERVER}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: String(sessionId),
      number,
      message,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao enviar WhatsApp.");
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json().catch(() => ({}));

    const limit = Math.min(Number(body?.limit || 5), 20);
    const now = new Date().toISOString();

    const { data: items, error } = await supabase
      .from("automation_queue")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    const results: any[] = [];

    for (const item of items || []) {
      try {
        const number = normalizePhone(item.phone);
        const message = String(item.message || "").trim();

        if (!number) throw new Error("Item sem telefone.");
        if (!message) throw new Error("Item sem mensagem.");

        await sendWhatsApp({
          sessionId: Number(item.session_id || 1),
          number,
          message,
        });

        await supabase
          .from("automation_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error: null,
            attempts: Number(item.attempts || 0) + 1,
          })
          .eq("id", item.id)
          .eq("company_id", companyId);

        results.push({ id: item.id, status: "sent" });
      } catch (error: any) {
        await supabase
          .from("automation_queue")
          .update({
            status: "error",
            error: error?.message || "Erro ao enviar.",
            attempts: Number(item.attempts || 0) + 1,
          })
          .eq("id", item.id)
          .eq("company_id", companyId);

        results.push({ id: item.id, status: "error", error: error?.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      sent: results.filter((item) => item.status === "sent").length,
      errors: results.filter((item) => item.status === "error").length,
      results,
    });
  } catch (error: any) {
    console.error("AUTOMATION PROCESS QUEUE:", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao processar fila." },
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
    console.error("AUTOMATION PROCESS QUEUE PATCH:", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao atualizar fila." },
      { status: 500 }
    );
  }
}
