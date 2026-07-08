import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit";

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

const FEATURES = [
  "dashboard_comercial",
  "clientes",
  "radar_comercial",
  "inbox_whatsapp",
  "campanhas_whatsapp",
  "mensagens_comerciais",
  "conteudo_ia",
  "cotador_ia",
  "pedidos",
  "cotacoes",
  "metas",
  "bi_comercial",
  "central_ia",
  "ocr_pedidos",
  "whatsapp_multi_numeros",
  "sistema_antibanimento",
];

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
      .from("feature_grants")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      grants: data || [],
      features: FEATURES,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar liberações" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();

    const companyId = String(body.companyId || "").trim();
    const feature = String(body.feature || "").trim();
    const days = Number(body.days || 0);
    const notes = String(body.notes || "").trim() || null;

    if (!companyId || !feature) {
      return NextResponse.json(
        { error: "Empresa e funcionalidade são obrigatórias" },
        { status: 400 }
      );
    }

    if (!FEATURES.includes(feature)) {
      return NextResponse.json(
        { error: "Funcionalidade inválida" },
        { status: 400 }
      );
    }

    let expiresAt: string | null = null;

    if (days > 0) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      expiresAt = date.toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("feature_grants")
      .insert({
        company_id: companyId,
        feature,
        active: true,
        expires_at: expiresAt,
        notes,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await auditLog({
      companyId,
      action: "liberou_funcionalidade",
      entity: "feature_grants",
      metadata: { feature, days, expiresAt, notes, grantId: data.id },
    });

    return NextResponse.json({
      success: true,
      grant: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao liberar funcionalidade" },
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

    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.expires_at !== undefined) {
      updateData.expires_at = body.expires_at || null;
    }
    if (body.notes !== undefined) {
      updateData.notes = String(body.notes || "").trim() || null;
    }

    const { data, error } = await supabaseAdmin
      .from("feature_grants")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await auditLog({
      companyId: data.company_id,
      action: "editou_liberacao_funcionalidade",
      entity: "feature_grants",
      metadata: { grantId: id, feature: data.feature, updateData },
    });

    return NextResponse.json({
      success: true,
      grant: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar liberação" },
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

    const { data: current } = await supabaseAdmin
      .from("feature_grants")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("feature_grants")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    await auditLog({
      companyId: current?.company_id || null,
      action: "removeu_liberacao_funcionalidade",
      entity: "feature_grants",
      metadata: { grantId: id, current },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao remover liberação" },
      { status: 500 }
    );
  }
}