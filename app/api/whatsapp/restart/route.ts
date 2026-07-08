import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || "";

async function resolveCompanyId(req: NextRequest) {
  return req.headers.get("x-company-id") || await getCompanyId(req) || DEFAULT_COMPANY_ID;
}

function normalizeSessionId(value: any) {
  const n = String(value || "1").replace(/\D/g, "");
  const num = Number(n);
  if (!num || num < 1 || num > 5) return "1";
  return String(num);
}

function buildSession(companyId: string, sessionId: string) {
  return `${companyId}_${sessionId}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionId = normalizeSessionId(body?.sessionId);
    const companyId = await resolveCompanyId(req);

    const finalSessionId = buildSession(companyId, sessionId);

    const res = await fetch(
      `${WHATSAPP_SERVER}/restart/${encodeURIComponent(finalSessionId)}`,
      { method: "POST", cache: "no-store" }
    );

    const data = await res.json().catch(() => ({}));

    return NextResponse.json({
      success: res.ok,
      sessionId,
      companyId,
      finalSessionId,
      ...data,
    });
  } catch (error:any) {
    return NextResponse.json(
      { success:false, error:error?.message || "Erro ao reiniciar WhatsApp" },
      { status:500 }
    );
  }
}
