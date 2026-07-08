import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase não configurado. Verifique NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function GET() {
  try {
    const companies = await prisma.companies.findMany({
      orderBy: {
        created_at: "desc",
      },
      include: {
        plans: true,
      },
    });

    return NextResponse.json(companies);
  } catch (error: any) {
    console.error("[admin/companies:get]", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao buscar empresas",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();

    const companyName = String(
      body.name || body.companyName || body.company_name || ""
    ).trim();

    const ownerName = String(
      body.ownerName ||
        body.owner_name ||
        body.responsibleName ||
        body.responsavel ||
        ""
    ).trim();

    const email = String(
      body.email || body.adminEmail || body.admin_email || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body.password || body.initialPassword || body.initial_password || ""
    ).trim();

    const document = String(body.document || body.cnpj || "").trim() || null;
    const phone = String(body.phone || body.celular || "").trim() || null;
    const whatsapp =
      String(body.whatsapp || body.companyWhatsapp || "").trim() || null;

    const billingNotes =
      String(body.contactExtra || body.extra_contact || "").trim() || null;

    let planId = body.plan_id || body.planId || null;

    if (!companyName) {
      return NextResponse.json(
        { error: "Nome da empresa obrigatório." },
        { status: 400 }
      );
    }

    if (!ownerName) {
      return NextResponse.json(
        { error: "Nome do responsável obrigatório." },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "E-mail do administrador obrigatório." },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Senha inicial obrigatória com no mínimo 6 caracteres." },
        { status: 400 }
      );
    }

    if (!planId) {
      const existingPlan = await prisma.plans.findFirst({
        where: {
          active: true,
        },
        orderBy: {
          created_at: "asc",
        },
      });

      if (existingPlan) {
        planId = existingPlan.id;
      } else {
        const newPlan = await prisma.plans.create({
          data: {
            name: "MASTER",
            active: true,
          },
        });

        planId = newPlan.id;
      }
    }

    const baseSlug = slugify(companyName);
    let slug = baseSlug || `empresa-${Date.now()}`;

    const duplicatedSlug = await prisma.companies.findFirst({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    });

    if (duplicatedSlug) {
      slug = `${slug}-${Date.now()}`;
    }

    const authResult = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: ownerName,
        role: "GERAL",
      },
    });

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error.message },
        { status: 400 }
      );
    }

    const userId = authResult.data.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não foi criado no Supabase Auth." },
        { status: 500 }
      );
    }

    try {
      const company = await prisma.companies.create({
        data: {
          name: companyName,
          slug,
          active: true,
          plan_id: planId,
          document,
          phone,
          whatsapp,
          owner_name: ownerName,
          billing_notes: billingNotes,
          payment_method: "PIX",
          monthly_value: 0,
          due_day: 10,
        },
      });

      await prisma.company_users.create({
        data: {
          company_id: company.id,
          user_id: userId,
          name: ownerName,
          email,
          phone,
          role: "GERAL",
          active: true,
        },
      });

      await prisma.branches.create({
        data: {
          company_id: company.id,
          name: "Matriz",
          slug: "matriz",
          active: true,
        },
      });

      return NextResponse.json({
        success: true,
        company,
        user: {
          id: userId,
          email,
          name: ownerName,
          role: "GERAL",
        },
      });
    } catch (dbError: any) {
      await supabaseAdmin.auth.admin.deleteUser(userId);

      console.error("[admin/companies:post:db]", dbError);

      return NextResponse.json(
        {
          error:
            dbError?.message ||
            "Empresa não criada. Usuário de autenticação removido.",
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[admin/companies:post]", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao criar empresa",
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
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const updateData: any = {};

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.plan_id !== undefined) updateData.plan_id = body.plan_id || null;
    if (body.active !== undefined) updateData.active = Boolean(body.active);

    if (body.blocked_reason !== undefined) {
      updateData.blocked_reason =
        String(body.blocked_reason || "").trim() || null;
    }

    if (body.monthly_value !== undefined) {
      updateData.monthly_value = Number(body.monthly_value || 0);
    }

    if (body.due_day !== undefined) {
      const day = Number(body.due_day || 10);
      updateData.due_day = Math.min(31, Math.max(1, day));
    }

    if (body.payment_method !== undefined) {
      updateData.payment_method = String(body.payment_method || "PIX");
    }

    if (body.billing_notes !== undefined) {
      updateData.billing_notes =
        String(body.billing_notes || "").trim() || null;
    }

    const company = await prisma.companies.update({
      where: {
        id,
      },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      company,
    });
  } catch (error: any) {
    console.error("[admin/companies:patch]", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao atualizar empresa",
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
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    await prisma.branches.deleteMany({
      where: {
        company_id: id,
      },
    });

    await prisma.company_users.deleteMany({
      where: {
        company_id: id,
      },
    });

    await prisma.companies.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[admin/companies:delete]", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao excluir empresa",
      },
      { status: 500 }
    );
  }
}