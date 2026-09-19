import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const endpoint = clean(new URL(req.url).searchParams.get("endpoint"));

    if (!endpoint) {
      return NextResponse.json(
        { success: true, active: false }
      );
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ active: boolean }>>(
      `SELECT active
       FROM seller_push_subscriptions
       WHERE company_id = $1::uuid
         AND seller_id = $2::uuid
         AND endpoint = $3
       LIMIT 1`,
      access.companyId,
      access.userId,
      endpoint
    );

    return NextResponse.json({
      success: true,
      active: Boolean(rows[0]?.active),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao consultar Push do vendedor." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const body = await req.json().catch(() => ({}));

    const endpoint = clean(body?.endpoint);
    const p256dh = clean(body?.keys?.p256dh);
    const auth = clean(body?.keys?.auth);

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { success: false, error: "Assinatura Push incompleta." },
        { status: 400 }
      );
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO seller_push_subscriptions (
         company_id,
         seller_id,
         endpoint,
         p256dh,
         auth_key,
         permission,
         active,
         revoked_at,
         created_at,
         updated_at
       )
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,'granted',true,NULL,now(),now())
       ON CONFLICT (endpoint)
       DO UPDATE SET
         company_id = EXCLUDED.company_id,
         seller_id = EXCLUDED.seller_id,
         p256dh = EXCLUDED.p256dh,
         auth_key = EXCLUDED.auth_key,
         permission = 'granted',
         active = true,
         revoked_at = NULL,
         updated_at = now()`,
      access.companyId,
      access.userId,
      endpoint,
      p256dh,
      auth
    );

    return NextResponse.json({ success: true, active: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao registrar Push do vendedor." },
      { status: 500 }
    );
  }
}
