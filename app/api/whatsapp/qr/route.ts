import { NextRequest, NextResponse } from "next/server";
import { normalizeWhatsappSessionNumber, resolveWhatsappSession } from "@/lib/whatsapp-session";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = normalizeWhatsappSessionNumber(searchParams.get("sessionId") || "1");

    const session = await resolveWhatsappSession(req, sessionId);
    const finalSessionId = session.fullSessionId;

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
      companyId: session.companyId,
      userId: session.userId,
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
