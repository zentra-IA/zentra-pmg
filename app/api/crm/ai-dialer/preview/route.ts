import { attachJuliaAuthResponse } from "@/lib/julia/access";
import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin, juliaError, requireJuliaSession } from "@/lib/julia/access";
import { parseJuliaContacts } from "@/lib/julia/phones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function __pmg_original_POST(req: NextRequest) {
  try {
    enforceSameOrigin(req);
    await requireJuliaSession(req);
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text : "";
    if (text.length > 70_000 || text.split(/\r?\n/).length > 400) {
      return NextResponse.json({
        success: false, error: "Limite de 400 linhas ou 70 mil caracteres."
      }, { status: 400 });
    }
    return NextResponse.json({
      success: true, contacts: parseJuliaContacts(text),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = juliaError(error);
    return NextResponse.json({ success: false, error: e.error }, { status: e.status });
  }
}

// PMG: preserva a implementação original da rota e propaga cookies Supabase.
export async function POST(
  ...args: Parameters<typeof __pmg_original_POST>
): Promise<Response> {
  const response = await __pmg_original_POST(...args);
  return attachJuliaAuthResponse(args[0], response);
}
