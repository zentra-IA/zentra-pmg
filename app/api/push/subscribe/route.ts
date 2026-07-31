import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const endpoint =
      typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh =
      typeof body?.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
    const auth =
      typeof body?.keys?.auth === "string" ? body.keys.auth.trim() : "";
    const portalToken =
      typeof body?.portalToken === "string" ? body.portalToken.trim() : "";

    if (!endpoint || !p256dh || !auth || !portalToken) {
      return NextResponse.json(
        {
          error:
            "endpoint, p256dh, auth e portalToken são obrigatórios.",
        },
        { status: 400 }
      );
    }

    const access = await prisma.webPromotionAccess.findFirst({
      where: {
        token_hash: hashToken(portalToken),
        token_value: portalToken,
        active: true,
      },
      select: {
        id: true,
        company_id: true,
        customer_id: true,
        seller_id: true,
      },
    });

    if (!access) {
      return NextResponse.json(
        { error: "Portal do cliente inválido ou revogado." },
        { status: 404 }
      );
    }

    const now = new Date();

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        company_id: access.company_id,
        customer_id: access.customer_id,
        seller_id: access.seller_id,
        endpoint,
        p256dh,
        auth_key: auth,
        user_agent: request.headers.get("user-agent"),
        active: true,
        permission: "granted",
        permission_updated_at: now,
        last_seen_at: now,
      },
      update: {
        company_id: access.company_id,
        customer_id: access.customer_id,
        seller_id: access.seller_id,
        p256dh,
        auth_key: auth,
        user_agent: request.headers.get("user-agent"),
        active: true,
        permission: "granted",
        permission_updated_at: now,
        last_seen_at: now,
        revoked_at: null,
      },
      select: {
        id: true,
        customer_id: true,
        active: true,
        permission: true,
      },
    });

    await prisma.webPromotionAccess.update({
      where: { id: access.id },
      data: {
        push_permission: "granted",
        push_permission_updated_at: now,
        push_requested_at: now,
        push_granted_at: now,
        push_denied_at: null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Navegador vinculado ao cliente.",
        subscription,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[PUSH_SUBSCRIBE_POST]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao salvar Push.",
      },
      { status: 500 }
    );
  }
}
