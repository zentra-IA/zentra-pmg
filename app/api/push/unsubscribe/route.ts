import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireCompany(request);
    const body = (await request.json().catch(() => ({}))) as {
      endpoint?: unknown;
    };

    const endpoint =
      typeof body.endpoint === "string" ? body.endpoint.trim() : "";

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint não informado." },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.updateMany({
      where: {
        endpoint,
        company_id: access.companyId,
      },
      data: {
        active: false,
        last_seen_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Notificações desativadas neste navegador.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor.";

    console.error("[PUSH_UNSUBSCRIBE_DELETE]", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes("Empresa não identificada") ? 401 : 500 }
    );
  }
}
