import { attachJuliaAuthResponse } from "@/lib/julia/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { juliaError, requireJuliaSession } from "@/lib/julia/access";
import { normalizeJuliaRows } from "@/lib/julia/phones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX = 300;

async function __pmg_original_GET(req: NextRequest) {
  try {
    const { companyId, userId } = await requireJuliaSession(req);
    const source = new URL(req.url).searchParams.get("source");
    if (source !== "prospects" && source !== "clientes") {
      return NextResponse.json({ success: false, error: "Origem inválida." }, { status: 400 });
    }

    let rows: Array<{ name: string; phone: string | null }> = [];

    if (source === "prospects") {
      // Mantém a regra de revelação do Radar do discador existente.
      const items = await prisma.prospect.findMany({
        where: {
          company_id: companyId,
          active: true,
          exports: { some: { company_id: companyId, clientId: userId } },
        },
        select: { name: true, phone1: true, phone2: true },
        orderBy: { createdAt: "desc" },
        take: MAX,
      });
      rows = items.flatMap((p) => [
        { name: p.name, phone: p.phone1 },
        ...(p.phone2 ? [{ name: p.name, phone: p.phone2 }] : []),
      ]);
    } else {
      // Apenas clientes que pertencem ao usuário; não expor carteiras alheias.
      const items = await prisma.salesCustomer.findMany({
        where: { company_id: companyId, seller_id: userId },
        select: { legal_name: true, trade_name: true, phone: true },
        orderBy: { updated_at: "desc" },
        take: MAX,
      });
      rows = items.map((p) => ({
        name: p.trade_name || p.legal_name,
        phone: p.phone,
      }));
    }

    return NextResponse.json({
      success: true, source, contacts: normalizeJuliaRows(rows),
      note: source === "prospects"
        ? "Até 300 prospects recentemente revelados (podem ter telefone principal e secundário)."
        : "Até 300 clientes vinculados ao usuário logado.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = juliaError(error);
    return NextResponse.json({ success: false, error: e.error }, { status: e.status });
  }
}

// PMG: preserva a implementação original da rota e propaga cookies Supabase.
export async function GET(
  ...args: Parameters<typeof __pmg_original_GET>
): Promise<Response> {
  const response = await __pmg_original_GET(...args);
  return attachJuliaAuthResponse(args[0], response);
}
