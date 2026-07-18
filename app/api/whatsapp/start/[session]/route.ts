import { NextRequest, NextResponse } from "next/server";
import { normalizeWhatsappSessionNumber, resolveWhatsappSession } from "@/lib/whatsapp-session";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ session: string }> | { session: string } }
) {
  try {
    const params = await context.params;
    const sessionId = normalizeWhatsappSessionNumber(params?.session || "1");

    const session = await resolveWhatsappSession(req, sessionId);
    const role = String(session.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        {
          success: false,
          error: "Acesso negado.",
        },
        { status: 403 }
      );
    }

    const finalSessionId = session.fullSessionId;

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
        companyId: session.companyId,
        userId: session.userId,
        finalSessionId,
      },
      { status: res.status }
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
