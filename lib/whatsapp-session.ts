import { NextRequest } from "next/server";
import { requireCompanyAccess } from "@/lib/server-company";

export function normalizeWhatsappSessionNumber(value: any) {
  const sessionId = String(value || "1").replace(/\D/g, "");
  if (!sessionId) return "1";

  const number = Number(sessionId);
  if (!Number.isFinite(number) || number < 1 || number > 5) return "1";

  return String(number);
}

export function buildWhatsappSessionKey(params: {
  companyId: string;
  userId: string;
  sessionId: string | number;
}) {
  return `${params.companyId}_${params.userId}_${params.sessionId}`;
}

export function parseWhatsappSessionKey(rawValue: any) {
  const raw = String(rawValue || "").trim();
  const parts = raw.split("_").filter(Boolean);

  if (parts.length >= 3) {
    const sessionId = normalizeWhatsappSessionNumber(parts[parts.length - 1]);
    const userId = parts[parts.length - 2] || null;
    const companyId = parts.slice(0, -2).join("_") || null;

    return {
      raw,
      companyId,
      userId,
      sessionId: Number(sessionId),
      isUserScoped: Boolean(companyId && userId),
    };
  }

  if (parts.length === 2) {
    const sessionId = normalizeWhatsappSessionNumber(parts[1]);
    return {
      raw,
      companyId: parts[0] || null,
      userId: null,
      sessionId: Number(sessionId),
      isUserScoped: false,
    };
  }

  return {
    raw,
    companyId: null,
    userId: null,
    sessionId: Number(normalizeWhatsappSessionNumber(raw || "1")),
    isUserScoped: false,
  };
}

export async function resolveWhatsappSession(
  req: NextRequest,
  sessionId: string | number
) {
  const access = await requireCompanyAccess(req);

  if (!access.companyId) {
    throw new Error("Empresa não identificada.");
  }

  if (!access.userId) {
    throw new Error("Usuário não identificado.");
  }

  const sessionNumber = normalizeWhatsappSessionNumber(sessionId);

  return {
    companyId: access.companyId,
    userId: access.userId,
    userRole: access.userRole,
    branchId: access.branchId || null,
    sessionNumber,
    fullSessionId: buildWhatsappSessionKey({
      companyId: access.companyId,
      userId: access.userId,
      sessionId: sessionNumber,
    }),
  };
}
