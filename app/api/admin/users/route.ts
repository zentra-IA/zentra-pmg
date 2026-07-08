import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ROLES = ["GERAL", "SUPERVISOR", "VENDEDOR"];

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

function normalizeRole(role: string) {
  const value = String(role || "VENDEDOR").toUpperCase();

  if (ROLES.includes(value)) return value;

  if (value === "ADMIN" || value === "ADMINISTRADOR") return "GERAL";
  if (value === "REPRESENTANTE") return "VENDEDOR";

  return "VENDEDOR";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId obrigatório." },
        { status: 400 }
      );
    }

    const users = await prisma.company_users.findMany({
      where: {
        company_id: companyId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json({
      users,
    });
  } catch (error: any) {
    console.error("[admin/users:get]", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao buscar usuários.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let createdAuthUserId: string | null = null;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();

    const companyId = String(body.companyId || body.company_id || "").trim();
    const name = String(body.name || "").trim();

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const password = String(body.password || body.initialPassword || "12345678").trim();
    const phone = String(body.phone || "").trim() || null;
    const role = normalizeRole(body.role);

    if (!companyId || !name || !email) {
      return NextResponse.json(
        { error: "companyId, nome e e-mail são obrigatórios." },
        { status: 400 }
      );
    }

    const company = await prisma.companies.findUnique({
      where: {
        id: companyId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    const existingCompanyUser = await prisma.company_users.findFirst({
      where: {
        company_id: companyId,
        email,
      },
    });

    if (existingCompanyUser) {
      return NextResponse.json(
        { error: "Este e-mail já está vinculado a esta empresa." },
        { status: 400 }
      );
    }

    const authResult = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        company_id: companyId,
        role,
      },
    });

    if (authResult.error || !authResult.data.user?.id) {
      return NextResponse.json(
        {
          error: authResult.error?.message || "Erro ao criar usuário no Auth.",
        },
        { status: 400 }
      );
    }

    createdAuthUserId = authResult.data.user.id;

    const user = await prisma.company_users.create({
      data: {
        company_id: companyId,
        user_id: createdAuthUserId,
        name,
        email,
        phone,
        role,
        active: true,
      },
    });

    return NextResponse.json({
      success: true,
      user,
      temporaryPassword: password,
    });
  } catch (error: any) {
    console.error("[admin/users:post]", error);

    if (createdAuthUserId) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      } catch {}
    }

    return NextResponse.json(
      {
        error: error?.message || "Erro ao criar usuário.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "ID obrigatório." },
        { status: 400 }
      );
    }

    const data: any = {};

    if (body.name !== undefined) data.name = String(body.name).trim();

    if (body.email !== undefined) {
      data.email = String(body.email).trim().toLowerCase();
    }

    if (body.phone !== undefined) {
      data.phone = String(body.phone || "").trim() || null;
    }

    if (body.role !== undefined) {
      data.role = normalizeRole(body.role);
    }

    if (body.active !== undefined) {
      data.active = Boolean(body.active);
    }

    const user = await prisma.company_users.update({
      where: {
        id,
      },
      data,
    });

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error: any) {
    console.error("[admin/users:patch]", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao atualizar usuário.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID obrigatório." },
        { status: 400 }
      );
    }

    await prisma.company_users.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[admin/users:delete]", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao excluir usuário.",
      },
      { status: 500 }
    );
  }
}