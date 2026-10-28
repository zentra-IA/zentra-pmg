import { attachJuliaAuthResponse } from "@/lib/julia/access";
import { NextRequest, NextResponse } from "next/server";
import {
  createJuliaSession, getJuliaIdentity, checkJuliaPassword, hasJuliaSession,
  enforceSameOrigin, juliaError, sessionCookieName, sessionCookieMaxAge
} from "@/lib/julia/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Limitação: este limitador é por instância. Antes de disponibilizar em
// produção para outros usuários, substituir por rate limit persistente.
const attempts = new Map<string, { count: number; until: number }>();

async function __pmg_original_GET(req: NextRequest) {
  try {
    const identity = await getJuliaIdentity(req);
    return NextResponse.json({
      success: true,
      unlocked: hasJuliaSession(req, identity),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = juliaError(error);
    return NextResponse.json({ success: false, error: e.error }, { status: e.status });
  }
}

async function __pmg_original_POST(req: NextRequest) {
  try {
    enforceSameOrigin(req);
    const identity = await getJuliaIdentity(req);
    const key = `${identity.companyId}:${identity.userId}`;
    const now = Date.now();
    const entry = attempts.get(key);
    if (entry && now < entry.until && entry.count >= 5) {
      return NextResponse.json({ success: false, error: "Muitas tentativas. Tente mais tarde." }, { status: 429 });
    }
    const body = await req.json();
    if (!checkJuliaPassword(body?.password)) {
      const curr = entry && now < entry.until ? entry.count : 0;
      attempts.set(key, { count: curr + 1, until: now + 15 * 60_000 });
      return NextResponse.json({ success: false, error: "Senha incorreta." }, { status: 401 });
    }
    attempts.delete(key);
    const res = NextResponse.json({ success: true, unlocked: true });
    res.cookies.set(sessionCookieName(), createJuliaSession(identity), {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: sessionCookieMaxAge(),
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    const e = juliaError(error);
    return NextResponse.json({ success: false, error: e.error }, { status: e.status });
  }
}

async function __pmg_original_DELETE(req: NextRequest) {
  try { enforceSameOrigin(req); } catch (error) {
    const e = juliaError(error);
    return NextResponse.json({ success: false, error: e.error }, { status: e.status });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(sessionCookieName(), "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

// PMG: preserva a implementação original da rota e propaga cookies Supabase.
export async function GET(
  ...args: Parameters<typeof __pmg_original_GET>
): Promise<Response> {
  const response = await __pmg_original_GET(...args);
  return attachJuliaAuthResponse(args[0], response);
}

// PMG: preserva a implementação original da rota e propaga cookies Supabase.
export async function POST(
  ...args: Parameters<typeof __pmg_original_POST>
): Promise<Response> {
  const response = await __pmg_original_POST(...args);
  return attachJuliaAuthResponse(args[0], response);
}

// PMG: preserva a implementação original da rota e propaga cookies Supabase.
export async function DELETE(
  ...args: Parameters<typeof __pmg_original_DELETE>
): Promise<Response> {
  const response = await __pmg_original_DELETE(...args);
  return attachJuliaAuthResponse(args[0], response);
}
