import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/server-company";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

async function resolveCompanyId(req: NextRequest) {
  const companyId = await getCompanyId(req);

  return (
    req.headers.get("x-company-id") ||
    companyId
  );
}

function buildSession(companyId: string, sessionId: string) {
  return `${companyId}_${sessionId}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") || "1";

    const companyId = await resolveCompanyId(req);

    if (!companyId) {
      return NextResponse.json(
        {
          status: "offline",
          qr: null,
          me: null,
          error: "Empresa não identificada",
        },
        { status: 401 }
      );
    }

    const finalSessionId = buildSession(companyId, sessionId);

    const res = await fetch(
      `${WHATSAPP_SERVER}/qr/${encodeURIComponent(finalSessionId)}`,
      { cache: "no-store" }
    );

    const data = await res.json().catch(() => ({
      status: "offline",
      qr: null,
      me: null,
    }));

    return NextResponse.json({
      ...data,
      sessionId,
      companyId,
      finalSessionId,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "offline",
        qr: null,
        me: null,
        error: error?.message || "Erro ao buscar QR",
      },
      { status: 500 }
    );
  }
}