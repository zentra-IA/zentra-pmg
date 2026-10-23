import { createClient, type Session } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Autenticação exclusiva do Ads IA.
 * Nunca confie em zentra_user_id, x-user-id ou x-company-id como prova de login.
 * Supabase valida a identidade; company_users valida a autorização.
 */
const ACCESS_COOKIE = "zentra_ads_access";
const REFRESH_COOKIE = "zentra_ads_refresh";
const REMEMBER_COOKIE = "zentra_ads_remember";
const MAX_PERSISTENT_SECONDS = 30 * 24 * 60 * 60;
const MAX_SHORT_SECONDS = 12 * 60 * 60;

function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // A chave pública é preferível; service role é fallback apenas no servidor.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase Auth não configurado.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function setAdsIaSessionCookies(
  response: NextResponse,
  session: Pick<Session, "access_token" | "refresh_token" | "expires_in">,
  remember: boolean
) {
  const lifetime = remember ? MAX_PERSISTENT_SECONDS : MAX_SHORT_SECONDS;
  const shared = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };

  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    ...shared,
    maxAge: Math.min(lifetime, Math.max(30, Number(session.expires_in) || 3600)),
  });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    ...shared,
    maxAge: lifetime,
  });
  response.cookies.set(REMEMBER_COOKIE, remember ? "1" : "0", {
    ...shared,
    maxAge: lifetime,
  });

  return response;
}

export type AdsIaAccessResult =
  | { ok: true; userId: string; companyId: string; renewedSession: Session | null; remember: boolean }
  | { ok: false; status: number; message: string };

function deny(status: number, message: string): AdsIaAccessResult {
  return { ok: false, status, message };
}

export async function verifyAdsIaAccess(request: NextRequest): Promise<AdsIaAccessResult> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value || "";
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value || "";
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === "1";

  // Compatibilidade com logout da sessão Zentra existente:
  // o cookie legado deve estar presente e pertencer ao MESMO usuário verificado.
  // Ele sozinho nunca autoriza uma chamada.
  const legacyUserId = request.cookies.get("zentra_user_id")?.value || "";
  const companyId = request.cookies.get("zentra_company_id")?.value || "";

  if (!legacyUserId || !companyId || (!accessToken && !refreshToken)) {
    return deny(401, "Faça login novamente no Zentra para utilizar o Ads IA.");
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return deny(403, "Empresa inválida.");
  }

  try {
    const supabase = createAuthClient();
    let userId: string | null = null;
    let renewedSession: Session | null = null;

    if (accessToken) {
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (!error && data.user?.id) {
        userId = data.user.id;
      }
    }

    if (!userId && refreshToken) {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session?.access_token || !data.session.refresh_token) {
        return deny(401, "Sua sessão expirou. Entre novamente no Zentra.");
      }

      // getUser confirma no Supabase Auth a identidade do token recém emitido.
      const verified = await supabase.auth.getUser(data.session.access_token);
      if (verified.error || !verified.data.user?.id) {
        return deny(401, "Não foi possível validar sua sessão.");
      }

      userId = verified.data.user.id;
      renewedSession = data.session;
    }

    if (!userId || userId !== legacyUserId) {
      return deny(401, "Sessão inválida. Faça login novamente.");
    }

    const [membership, company] = await Promise.all([
      prisma.company_users.findFirst({
        where: {
          user_id: userId,
          company_id: companyId,
          active: true,
        },
        select: { user_id: true },
      }),
      prisma.companies.findUnique({
        where: { id: companyId },
        select: { active: true },
      }),
    ]);

    if (!membership || company?.active !== true) {
      return deny(403, "Usuário sem vínculo ativo com a empresa selecionada.");
    }

    return { ok: true, userId, companyId, renewedSession, remember };
  } catch (error) {
    console.error("[ADS_IA_AUTH] Falha ao validar sessão:", error instanceof Error ? error.message : "Erro");
    return deny(503, "Não foi possível verificar seu acesso. Tente novamente.");
  }
}

export function attachRefreshedAdsIaSession(
  response: NextResponse,
  access: Extract<AdsIaAccessResult, { ok: true }>
) {
  if (access.renewedSession) {
    setAdsIaSessionCookies(response, access.renewedSession, access.remember);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
