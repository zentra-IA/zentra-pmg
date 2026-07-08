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

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
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
      .from("company_radar_grants")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      grants: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar créditos do Radar Comercial" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await req.json();

    const companyId = String(body.companyId || "").trim();
    const contactsExtra = Number(body.contactsExtra || 0);
    const days = Number(body.days || 0);
    const notes = String(body.notes || "").trim() || null;

    if (!companyId) {
      return NextResponse.json(
        { error: "Empresa obrigatória" },
        { status: 400 }
      );
    }

    if (contactsExtra <= 0) {
      return NextResponse.json(
        { error: "Quantidade inválida" },
        { status: 400 }
      );
    }

    let expiresAt: string | null = null;

    if (days > 0) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      expiresAt = date.toISOString();
    }

    const month = getCurrentMonth();

    const { data, error } = await supabaseAdmin
      .from("company_radar_grants")
      .insert({
        company_id: companyId,
        month,
        contacts_extra: contactsExtra,
        reason: notes || "Crédito extra do Radar Comercial adicionado pelo admin",
        active: true,
        expires_at: expiresAt,
        notes,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      grant: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao adicionar créditos do Radar Comercial" },
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

    const { error } = await supabaseAdmin
      .from("company_radar_grants")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao remover créditos do Radar Comercial" },
      { status: 500 }
    );
  }
}