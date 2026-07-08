import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_PLANS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Plano Vendedor",
    active: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Plano Supervisor",
    active: true,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Plano Geral",
    active: true,
  },
];

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

function slugify(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function ensureDefaultPlans() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plans.upsert({
      where: {
        id: plan.id,
      },
      update: {
        name: plan.name,
        active: plan.active,
      },
      create: {
        id: plan.id,
        name: plan.name,
        active: plan.active,
      },
    });
  }

  return prisma.plans.findMany({
    where: {
      active: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function GET() {
  try {
    const plans = await ensureDefaultPlans();
    return NextResponse.json(plans);
  } catch (error: any) {
    console.error("[companies/create:get]", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao carregar planos" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let createdAuthUserId: string | null = null;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    await ensureDefaultPlans();

    const body = await req.json();

    const companyName = String(
      body.restaurantName || body.companyName || body.name || ""
    ).trim();

    const ownerName = String(
      body.ownerName || body.responsibleName || body.responsavel || ""
    ).trim();

    const email = String(body.email || body.adminEmail || "")
      .trim()
      .toLowerCase();

    const password = String(body.password || "").trim();

    const phone = String(body.phone || body.celular || "").trim() || null;

    const whatsapp = String(body.whatsapp || "").trim() || null;

    const planId = String(body.planId || body.plan_id || "").trim();

    if (!companyName || !ownerName || !email || !password || !planId) {
      return NextResponse.json(
        { error: "Preencha empresa, responsável, e-mail, senha e plano." },
        { status: 400 }
      );
    }

    const plan = await prisma.plans.findFirst({
      where: {
        id: planId,
        active: true,
      },
    });

    if (!plan) {
      return NextResponse.json(
        { error: "Plano inválido ou inativo." },
        { status: 400 }
      );
    }

    const authResult = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: ownerName,
        role: "GERAL",
        company_name: companyName,
      },
    });

    if (authResult.error || !authResult.data.user?.id) {
      return NextResponse.json(
        { error: authResult.error?.message || "Erro ao criar usuário." },
        { status: 400 }
      );
    }

    createdAuthUserId = authResult.data.user.id;

    const baseSlug = slugify(companyName) || `empresa-${Date.now()}`;

    const company = await prisma.companies.create({
      data: {
        name: companyName,
        slug: `${baseSlug}-${Date.now()}`,
        active: true,
        plan_id: planId,
        whatsapp,
        phone,
      },
    });

    const branch = await prisma.branches.create({
      data: {
        company_id: company.id,
        name: "Matriz",
        slug: "matriz",
        active: true,
      },
    });

    await prisma.company_users.create({
      data: {
        company_id: company.id,
        user_id: createdAuthUserId,
        name: ownerName,
        email,
        phone,
        role: "GERAL",
        active: true,
      },
    });

    return NextResponse.json({
      success: true,
      company,
      branch,
      user: {
        id: createdAuthUserId,
        email,
        name: ownerName,
        role: "GERAL",
      },
    });
  } catch (error: any) {
    console.error("[companies/create:post]", error);

    if (createdAuthUserId) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      } catch {}
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao criar empresa" },
      { status: 500 }
    );
  }
}