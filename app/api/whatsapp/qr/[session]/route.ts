import { NextRequest, NextResponse } from "next/server";
import { normalizeWhatsappSessionNumber, resolveWhatsappSession } from "@/lib/whatsapp-session";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

type Context = {
  params: Promise<{ session: string }> | { session: string };
};

export async function GET(req: NextRequest, context: Context) {
  try {
    const params = await context.params;
    const sessionId = normalizeWhatsappSessionNumber(params?.session || "1");

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

    return NextResponse.json(
      {
        ...data,
        sessionId,
        companyId: session.companyId,
        userId: session.userId,
        finalSessionId,
      },
      { status: res.status }
    );
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
