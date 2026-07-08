import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MASTER_ROLES = new Set([
  "GERAL",
  "MASTER",
  "ADMIN_GERAL",
  "ADMIN_GLOBAL",
  "SUPER_ADMIN",
]);

const SUPERVISOR_ROLES = new Set([
  "SUPERVISOR",
  "ADMINISTRADOR",
  "ADMIN",
  "GESTOR",
  "GERENTE",
]);

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase não configurado. Verifique NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeRole(role: unknown) {
  const raw = String(role || "VENDEDOR")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (MASTER_ROLES.has(raw)) return "GERAL";
  if (SUPERVISOR_ROLES.has(raw)) return "SUPERVISOR";

  if (raw === "REPRESENTANTE" || raw === "ATENDENTE" || raw === "USER") {
    return "VENDEDOR";
  }

  if (raw === "VENDEDOR") return "VENDEDOR";

  return "VENDEDOR";
}

function roleLabel(role: string) {
  if (role === "GERAL") return "Plano Geral";
  if (role === "SUPERVISOR") return "Plano Supervisor";
  return "Plano Vendedor";
}

function isMaster(role: string) {
  return role === "GERAL";
}

function cleanCompanySlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function getRedirectByRole(role: string) {
  if (role === "SUPERVISOR") return "/command-center";
  if (role === "GERAL") return "/crm/dashboard";
  return "/crm/dashboard";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const companySlug = cleanCompanySlug(
      body?.companySlug || body?.company || body?.empresa
    );
    const remember = Boolean(body?.remember ?? true);

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 }
      );
    }

    const authUser = data.user;
    const metadataRole = normalizeRole(authUser.user_metadata?.role);
    const userIsMetadataMaster = isMaster(metadataRole);

    const links = await prisma.company_users.findMany({
      where: {
        user_id: authUser.id,
        active: true,
      },
      include: {
        companies: true,
      },
    });

    const filteredLinks = companySlug
      ? links.filter((item: any) => {
          const company = Array.isArray(item?.companies)
            ? item.companies[0]
            : item?.companies;

          return String(company?.slug || "").toLowerCase() === companySlug;
        })
      : links;

    const selectedLink: any =
      filteredLinks.find((item: any) => {
        const company = Array.isArray(item?.companies)
          ? item.companies[0]
          : item?.companies;

        return item?.active !== false && company?.active !== false;
      }) ||
      filteredLinks[0] ||
      links[0];

    if (!selectedLink && userIsMetadataMaster) {
      const response = NextResponse.json({
        success: true,
        user: authUser,
        role: "GERAL",
        roleLabel: roleLabel("GERAL"),
        company: null,
        company_id: null,
        branch_id: null,
        redirectTo: "/admin/master/empresas",
      });

      const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;

      response.cookies.set("zentra_user_id", authUser.id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge,
      });

      response.cookies.set("zentra_user_role", "GERAL", {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge,
      });

      return response;
    }

    if (!selectedLink?.company_id) {
      return NextResponse.json(
        { error: "Usuário não está vinculado a nenhuma empresa." },
        { status: 403 }
      );
    }

    if (selectedLink.active === false) {
      return NextResponse.json(
        { error: "Usuário pausado. Entre em contato com o administrador." },
        { status: 403 }
      );
    }

    const company = Array.isArray(selectedLink.companies)
      ? selectedLink.companies[0]
      : selectedLink.companies;

    if (!company?.active) {
      return NextResponse.json(
        {
          error:
            company?.blocked_reason ||
            "Empresa pausada. Entre em contato com o suporte.",
        },
        { status: 403 }
      );
    }

    const role = isMaster(metadataRole)
      ? "GERAL"
      : normalizeRole(selectedLink.role || metadataRole);

    const branch = await prisma.branches.findFirst({
      where: {
        company_id: selectedLink.company_id,
        active: true,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    const redirectTo = getRedirectByRole(role);

    const response = NextResponse.json({
      success: true,
      user: authUser,
      company: {
        id: selectedLink.company_id,
        name: company?.name || "PMG Atacadista",
        slug: company?.slug || null,
      },
      company_id: selectedLink.company_id,
      branch_id: branch?.id || null,
      role,
      roleLabel: roleLabel(role),
      redirectTo,
    });

    const cookieConfig = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12,
    };

    response.cookies.set("zentra_user_id", authUser.id, cookieConfig);
    response.cookies.set(
      "zentra_company_id",
      selectedLink.company_id,
      cookieConfig
    );

    if (company?.slug) {
      response.cookies.set("zentra_company_slug", company.slug, {
        ...cookieConfig,
        httpOnly: false,
      });
    }

    response.cookies.set("zentra_user_role", role, {
      ...cookieConfig,
      httpOnly: false,
    });

    if (branch?.id) {
      response.cookies.set("zentra_branch_id", branch.id, cookieConfig);
    }

    return response;
  } catch (error: any) {
    console.error("ERRO LOGIN ZENTRA SALES AI:", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao fazer login." },
      { status: 500 }
    );
  }
}
