import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

const ROLES = [
  "administrador",
  "supervisor",
  "gerente_comercial",
  "representante",
  "vendedor",
  "atendimento",
  "marketing",
  "financeiro",
  "visualizador",
];

async function getUserLimit(companyId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("plan_id")
    .eq("id", companyId)
    .single();

  if (!company?.plan_id) return 1;

  const { data: feature } = await supabaseAdmin
    .from("plan_features")
    .select("limit_value")
    .eq("plan_id", company.plan_id)
    .eq("feature", "usuarios")
    .eq("enabled", true)
    .maybeSingle();

  return Number(feature?.limit_value || 1);
}

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId obrigatório" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("company_users")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const limit = await getUserLimit(companyId);

    return NextResponse.json({
      success: true,
      users: data || [],
      limit,
      used: (data || []).filter((user: any) => user.active !== false).length,
      roles: ROLES,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar usuários" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await req.json();

    const companyId = String(body.companyId || "").trim();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "").trim();
    const role = String(body.role || "representante").trim();

    if (!companyId || !name || !email || !password) {
      return NextResponse.json(
        { error: "Empresa, nome, e-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    if (!ROLES.includes(role)) {
      return NextResponse.json({ error: "Cargo inválido." }, { status: 400 });
    }

    const limit = await getUserLimit(companyId);

    const { count } = await supabaseAdmin
      .from("company_users")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("active", true);

    if ((count || 0) >= limit) {
      return NextResponse.json(
        { error: `Limite do plano atingido. Limite: ${limit} usuário(s).` },
        { status: 403 }
      );
    }

    const { data: createdUser, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone,
          role,
        },
      });

    if (userError || !createdUser?.user?.id) {
      throw new Error(userError?.message || "Erro ao criar usuário");
    }

    const { data: link, error: linkError } = await supabaseAdmin
      .from("company_users")
      .insert({
        company_id: companyId,
        user_id: createdUser.user.id,
        name,
        email,
        phone,
        role,
        active: true,
      })
      .select()
      .single();

    if (linkError) throw new Error(linkError.message);

    return NextResponse.json({
      success: true,
      user: link,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao criar usuário" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await req.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const updateData: any = {};

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.email !== undefined) {
      updateData.email = String(body.email).trim().toLowerCase();
    }
    if (body.phone !== undefined) updateData.phone = String(body.phone).trim();
    if (body.active !== undefined) updateData.active = Boolean(body.active);

    if (body.role !== undefined) {
      const role = String(body.role).trim();

      if (!ROLES.includes(role)) {
        return NextResponse.json({ error: "Cargo inválido." }, { status: 400 });
      }

      updateData.role = role;
    }

    const { data, error } = await supabaseAdmin
      .from("company_users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      user: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar usuário" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const { data: link } = await supabaseAdmin
      .from("company_users")
      .select("user_id")
      .eq("id", id)
      .single();

    const { error } = await supabaseAdmin
      .from("company_users")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    if (link?.user_id) {
      const { count } = await supabaseAdmin
        .from("company_users")
        .select("*", { count: "exact", head: true })
        .eq("user_id", link.user_id);

      if ((count || 0) === 0) {
        await supabaseAdmin.auth.admin.deleteUser(link.user_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao excluir usuário" },
      { status: 500 }
    );
  }
}