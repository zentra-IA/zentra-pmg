import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/server-company";
import { dispatchPromotionPush } from "@/lib/promotions/dispatch-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(role?: string | null) {
  const value = String(role || "").trim().toUpperCase();

  if (["GERAL", "MASTER", "ADMIN", "OWNER"].includes(value)) {
    return "GERAL";
  }

  if (["SUPERVISOR", "GESTOR", "MANAGER"].includes(value)) {
    return "SUPERVISOR";
  }

  return "VENDEDOR";
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const role = normalizeRole(access.userRole);

    if (role === "VENDEDOR") {
      return NextResponse.json(
        { error: "Apenas gestores podem reenviar Push manualmente." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const promotionId = text(body?.promotion_id);

    if (!promotionId) {
      return NextResponse.json(
        { error: "Informe promotion_id." },
        { status: 400 }
      );
    }

    const result = await dispatchPromotionPush({
      companyId: access.companyId,
      promotionId,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({
      success: true,
      promotion_id: promotionId,
      ...result,
      message:
        result.subscriptions === 0
          ? "Nenhum cliente do público possui Push ativo."
          : `Push concluído: ${result.sent} enviado(s), ${result.failed} falha(s) e ${result.withoutSubscription} sem inscrição.`,
    });
  } catch (error) {
    console.error("[PUSH_SEND_POST]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao enviar Push.",
      },
      { status: 500 }
    );
  }
}
