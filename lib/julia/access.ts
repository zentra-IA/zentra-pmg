import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  verifyAdsIaAccess,
  attachRefreshedAdsIaSession,
  type AdsIaAccessResult,
} from "@/lib/ads-ia-auth";

type VerifiedAccess = Extract<AdsIaAccessResult, { ok: true }>;
const verificationCache = new WeakMap<NextRequest, Promise<{
  identity: JuliaIdentity;
  access: VerifiedAccess;
}>>();

const COOKIE = "zentra_julia_session";
const MAX_AGE = 6 * 60 * 60; // 6 horas.

type JuliaIdentity = { userId: string; companyId: string; email: string | null };

function isConfigured(): boolean {
  return Boolean(
    process.env.JULIA_ENABLED === "true" &&
    (process.env.JULIA_ALLOWED_USER_ID || process.env.JULIA_ALLOWED_EMAIL) &&
    (process.env.JULIA_PASSWORD || "").length >= 12 &&
    (process.env.JULIA_SESSION_SECRET || "").length >= 32
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

export class JuliaAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function sessionCookieName() { return COOKIE; }
export function sessionCookieMaxAge() { return MAX_AGE; }

async function verifyIdentity(req: NextRequest): Promise<{
  identity: JuliaIdentity;
  access: VerifiedAccess;
}> {
  if (!isConfigured()) {
    throw new JuliaAccessError(503, "Módulo Júlia ainda não foi configurado.");
  }
  const result = await verifyAdsIaAccess(req);
  if (result.ok === false) {
    throw new JuliaAccessError(result.status, result.message);
  }
  const { userId, companyId } = result;

  if (process.env.JULIA_ALLOWED_USER_ID &&
      !constantTimeEqual(userId, process.env.JULIA_ALLOWED_USER_ID)) {
    throw new JuliaAccessError(403, "Este módulo não está liberado para o seu usuário.");
  }

  let email: string | null = null;
  if (process.env.JULIA_ALLOWED_EMAIL) {
    const membership = await prisma.company_users.findFirst({
      where: { user_id: userId, company_id: companyId, active: true },
      select: { email: true },
    });
    email = membership?.email || null;
    if (!constantTimeEqual(
      String(email || "").trim().toLowerCase(),
      process.env.JULIA_ALLOWED_EMAIL.trim().toLowerCase()
    )) {
      throw new JuliaAccessError(403, "Este módulo não está liberado para o seu usuário.");
    }
  }
  return { identity: { userId, companyId, email }, access: result };
}

function verified(req: NextRequest) {
  let p = verificationCache.get(req);
  if (!p) {
    p = verifyIdentity(req);
    verificationCache.set(req, p);
  }
  return p;
}

export async function getJuliaIdentity(req: NextRequest): Promise<JuliaIdentity> {
  return (await verified(req)).identity;
}

// Usar em todas as respostas das rotas da Júlia, inclusive erros controlados.
export async function attachJuliaAuthResponse(
  req: NextRequest,
  response: Response
): Promise<NextResponse> {
  const result = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  result.headers.set("Cache-Control", "no-store");
  const cached = verificationCache.get(req);
  if (!cached) return result;
  try {
    return attachRefreshedAdsIaSession(result, (await cached).access);
  } catch {
    // A falha de autenticação já produziu seu próprio status HTTP.
    // Não a substituir por um erro de renovação.
    return result;
  }
}

export function checkJuliaPassword(value: unknown): boolean {
  if (!isConfigured() || typeof value !== "string" || value.length > 256) return false;
  return constantTimeEqual(value, process.env.JULIA_PASSWORD || "");
}

function sign(data: string): string {
  return createHmac("sha256", process.env.JULIA_SESSION_SECRET || "")
    .update(data).digest("base64url");
}

export function createJuliaSession(identity: JuliaIdentity): string {
  const data = Buffer.from(JSON.stringify({
    u: identity.userId,
    c: identity.companyId,
    e: Date.now() + MAX_AGE * 1000,
  }), "utf8").toString("base64url");
  return `${data}.${sign(data)}`;
}

export function hasJuliaSession(req: NextRequest, identity: JuliaIdentity): boolean {
  const token = req.cookies.get(COOKIE)?.value || "";
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [data, mac] = parts;
  if (!constantTimeEqual(sign(data), mac)) return false;
  try {
    const body = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    return body.u === identity.userId &&
      body.c === identity.companyId &&
      typeof body.e === "number" && body.e > Date.now();
  } catch {
    return false;
  }
}

export async function requireJuliaSession(req: NextRequest) {
  const identity = await getJuliaIdentity(req);
  if (!hasJuliaSession(req, identity)) {
    throw new JuliaAccessError(401, "Desbloqueie o Discador IA com sua senha.");
  }
  return identity;
}

export function enforceSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    throw new JuliaAccessError(403, "Origem não autorizada.");
  }
}

export function juliaError(error: unknown): { status: number; error: string } {
  if (error instanceof JuliaAccessError) return { status: error.status, error: error.message };
  console.error("[JULIA_ACCESS_ERROR]", error);
  return { status: 500, error: "Erro interno ao validar o acesso." };
}
