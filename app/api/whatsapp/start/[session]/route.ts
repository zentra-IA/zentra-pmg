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
  const sessionId = String(value || "1").replace(/\D/g, "");

  if (!sessionId) return "1";

  const number = Number(sessionId);

  if (!Number.isFinite(number) || number < 1 || number > 5) return "1";

  return String(number);
}

function buildSession(companyId: string, sessionId: string) {
  return `${companyId}_${sessionId}`;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ session: string }> | { session: string } }
) {
  try {
    const params = await context.params;
    const sessionId = normalizeSessionId(params?.session || "1");
    const companyId = await resolveCompanyId(req);

    if (!companyId) {
      return NextResponse.json(
        {
          success: false,
          error: "Empresa não identificada.",
        },
        { status: 401 }
      );
    }

    const finalSessionId = buildSession(companyId, sessionId);

    const res = await fetch(
      `${WHATSAPP_SERVER}/start/${encodeURIComponent(finalSessionId)}`,
      {
        method: "POST",
        cache: "no-store",
      }
    );

    const data = await res.json().catch(() => ({}));

    return NextResponse.json(
      {
        ...data,
        success: data?.success ?? res.ok,
        sessionId,
        companyId,
        finalSessionId,
      },
      { status: res.ok ? 200 : 500 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao iniciar WhatsApp.",
      },
      { status: 500 }
    );
  }
}
