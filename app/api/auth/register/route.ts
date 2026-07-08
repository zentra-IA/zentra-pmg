import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["VENDEDOR", "SUPERVISOR", "GERAL"]);

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Admin não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function slugify(text: string) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function normalizeRole(value: unknown) {
  const raw = String(value || "VENDEDOR")
    .trim()
    .toUpperCase();

  if (raw === "GERAL") return "GERAL";
  if (raw === "SUPERVISOR") return "SUPERVISOR";
  if (raw === "VENDEDOR") return "VENDEDOR";

  if (raw === "ADMIN" || raw === "ADMINISTRADOR") return "GERAL";
  if (raw === "REPRESENTANTE") return "VENDEDOR";

  return VALID_ROLES.has(raw) ? raw : "VENDEDOR";
}

function roleLabel(role: string) {
  if (role === "GERAL") return "Plano Geral";
  if (role === "SUPERVISOR") return "Plano Supervisor";
  return "Plano Vendedor";
}

export async function POST(req: NextRequest) {
  let createdAuthUserId: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const name = String(body?.name || body?.ownerName || body?.nome || "").trim();

    const email = String(body?.email || "")
      .trim()
      .toLowerCase();

    const password = String(body?.password || body?.senha || "").trim();

    const phone =
      String(body?.phone || body?.whatsapp || body?.celular || "").trim() ||
      null;

    const requestedRole = normalizeRole(body?.role || body?.plan || body?.plano);

    const companyIdFromBody = String(
      body?.companyId || body?.company_id || ""
    ).trim();

    const companyName = String(
      body?.companyName || body?.empresa || body?.company || ""
    ).trim();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const authResult = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        phone,
        role: requestedRole,
        role_label: roleLabel(requestedRole),
        product: "zentra-sales-ai",
      },
    });

    if (authResult.error || !authResult.data.user?.id) {
      return NextResponse.json(
        { error: authResult.error?.message || "Erro ao criar usuário." },
        { status: 400 }
      );
    }

    createdAuthUserId = authResult.data.user.id;

    if (requestedRole === "GERAL" && !companyIdFromBody && !companyName) {
      return NextResponse.json({
        success: true,
        user_id: createdAuthUserId,
        role: "GERAL",
        roleLabel: roleLabel("GERAL"),
        company_id: null,
        redirectTo: "/admin/master/empresas",
      });
    }

    let companyId = companyIdFromBody;
    let createdCompany: any = null;

    if (!companyId) {
      if (!companyName) {
        return NextResponse.json(
          {
            error:
              "Informe uma empresa existente ou o nome da nova empresa para vincular o usuário.",
          },
          { status: 400 }
        );
      }

      const baseSlug = slugify(companyName) || "empresa";
      const slug = `${baseSlug}-${Date.now()}`;

      const company = await prisma.companies.create({
        data: {
          name: companyName,
          slug,
          active: true,
        },
      });

      createdCompany = company;
      companyId = company.id;

      await prisma.branches.create({
        data: {
          company_id: companyId,
          name: "Matriz",
          slug: "matriz",
          active: true,
        },
      });
    }

    const company = await prisma.companies.findUnique({
      where: {
        id: companyId,
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    const existingLink = await prisma.company_users.findFirst({
      where: {
        company_id: companyId,
        email,
      },
    });

    if (existingLink) {
      return NextResponse.json(
        { error: "Este e-mail já está vinculado a esta empresa." },
        { status: 400 }
      );
    }

    await prisma.company_users.create({
      data: {
        company_id: companyId,
        user_id: createdAuthUserId,
        name,
        email,
        phone,
        role: requestedRole,
        active: true,
      },
    });

    return NextResponse.json({
      success: true,
      user_id: createdAuthUserId,
      company_id: companyId,
      company: createdCompany,
      role: requestedRole,
      roleLabel: roleLabel(requestedRole),
      redirectTo: "/login",
    });
  } catch (error: any) {
    console.error("ERRO REGISTER ZENTRA SALES AI:", error);

    if (createdAuthUserId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.auth.admin.deleteUser(createdAuthUserId);
      } catch {}
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao cadastrar." },
      { status: 500 }
    );
  }
}