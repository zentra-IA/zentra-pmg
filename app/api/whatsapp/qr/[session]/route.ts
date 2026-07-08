import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/server-company";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3011";

type Context = {
  params: Promise<{ session: string }>;
};

export async function GET(req: NextRequest, context: Context) {
  try {
    const { session } = await context.params;

    const companyId =
      await getCompanyId(req) ||
      process.env.DEFAULT_COMPANY_ID ||
      "b7336aa2-345d-4624-8141-0ea0de084c3d";

    const finalSession = `${companyId}_${session}`;

    const res = await fetch(`${WHATSAPP_SERVER}/qr/${finalSession}`, {
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({
      status: "offline",
      qr: null,
    }));

    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "offline",
        qr: null,
        error: error?.message || "Erro ao buscar QR",
      },
      { status: 500 }
    );
  }
}