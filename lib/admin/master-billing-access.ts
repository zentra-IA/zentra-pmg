import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const MASTER_ROLES = new Set([
  "GERAL",
  "MASTER",
  "ADMIN_GERAL",
  "ADMIN_GLOBAL",
  "SUPER_ADMIN",
]);

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function splitEnv(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase Admin não configurado.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export class MasterAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireBillingMaster(req: NextRequest) {
  const userId = String(
    req.cookies.get("zentra_user_id")?.value || ""
  ).trim();

  if (!userId) {
    throw new MasterAccessError(
      "Sessão administrativa não identificada.",
      401
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } =
    await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    throw new MasterAccessError(
      "Usuário administrativo não encontrado.",
      401
    );
  }

  const authUser = data.user;
  const email = String(authUser.email || "")
    .trim()
    .toLowerCase();

  const allowedIds = splitEnv(
    process.env.ZENTRA_MASTER_USER_IDS
  );

  const allowedEmails = splitEnv(
    process.env.ZENTRA_MASTER_EMAILS
  );

  /*
   * Regra principal:
   * se houver allowlist configurada, só quem estiver nela entra.
   * Recomendado em produção.
   */
  if (allowedIds.length || allowedEmails.length) {
    const allowed =
      allowedIds.includes(userId.toLowerCase()) ||
      (email && allowedEmails.includes(email));

    if (!allowed) {
      throw new MasterAccessError(
        "Acesso restrito ao administrador master.",
        403
      );
    }

    return {
      userId,
      email,
      authUser,
      explicitAllowlist: true,
    };
  }

  /*
   * Fallback compatível com o login atual:
   * aceita somente um usuário com papel master no metadata
   * e sem vínculo com nenhuma empresa.
   *
   * Um administrador GERAL de uma empresa não passa aqui.
   */
  const role = normalize(
    authUser.user_metadata?.role
  );

  if (!MASTER_ROLES.has(role)) {
    throw new MasterAccessError(
      "Acesso restrito ao administrador master.",
      403
    );
  }

  const links = await prisma.company_users.count({
    where: {
      user_id: userId,
    },
  });

  if (links > 0) {
    throw new MasterAccessError(
      "Configure ZENTRA_MASTER_EMAILS ou ZENTRA_MASTER_USER_IDS para liberar este usuário master.",
      403
    );
  }

  return {
    userId,
    email,
    authUser,
    explicitAllowlist: false,
  };
}
