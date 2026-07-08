import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);

    const [items, movements] = await Promise.all([
      supabase
        .from("stock_items")
        .select("*")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name"),

      supabase
        .from("stock_movements")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (items.error) throw items.error;
    if (movements.error) throw movements.error;

    const itemMap = new Map(
      (items.data || []).map((item: any) => [item.id, item])
    );

    const movementsWithItems = (movements.data || []).map((movement: any) => ({
      ...movement,
      stock_items: itemMap.get(movement.stock_item_id) || null,
    }));

    const alerts = (items.data || []).filter(
      (item: any) =>
        Number(item.current_quantity || 0) <= Number(item.min_quantity || 0)
    );

    return NextResponse.json({
      success: true,
      items: items.data || [],
      movements: movementsWithItems,
      alerts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao carregar estoque" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    if (body.action === "item") {
      if (!body.name) {
        return NextResponse.json(
          { success: false, error: "Nome do produto obrigatório" },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("stock_items")
        .insert({
          company_id: companyId,
          branch_id: branchId || null,
          supplier_id: body.supplier_id || null,
          name: body.name,
          category: body.category || "Geral",
          unit: body.unit || "un",
          current_quantity: Number(body.current_quantity || 0),
          min_quantity: Number(body.min_quantity || 0),
          average_cost: Number(body.average_cost || 0),
          active: true,
        })
        .select("*")
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, data });
    }

    if (body.action === "movement") {
      const stockItemId = body.stock_item_id;
      const type = body.type || "entrada";
      const quantity = Number(body.quantity || 0);
      const unitCost = Number(body.unit_cost || 0);
      const totalCost = quantity * unitCost;

      if (!stockItemId) {
        return NextResponse.json(
          { success: false, error: "Produto obrigatório" },
          { status: 400 }
        );
      }

      if (!quantity || quantity <= 0) {
        return NextResponse.json(
          { success: false, error: "Quantidade inválida" },
          { status: 400 }
        );
      }

      const { data: item, error: itemError } = await supabase
        .from("stock_items")
        .select("*")
        .eq("id", stockItemId)
        .eq("company_id", companyId)
        .single();

      if (itemError || !item) {
        return NextResponse.json(
          { success: false, error: "Item não encontrado" },
          { status: 404 }
        );
      }

      let nextQuantity = Number(item.current_quantity || 0);

      if (type === "entrada") nextQuantity += quantity;
      if (type === "saida") nextQuantity -= quantity;
      if (type === "perda") nextQuantity -= quantity;
      if (type === "ajuste") nextQuantity = quantity;

      if (nextQuantity < 0) nextQuantity = 0;

      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          company_id: companyId,
          branch_id: branchId || null,
          stock_item_id: stockItemId,
          type,
          quantity,
          unit_cost: unitCost,
          total_cost: totalCost,
          reason: body.reason || null,
        });

      if (movementError) throw movementError;

      const updatePayload: any = {
        current_quantity: nextQuantity,
        updated_at: new Date().toISOString(),
      };

      if (type === "entrada" && unitCost > 0) {
        updatePayload.average_cost = unitCost;
      }

      const { error: updateError } = await supabase
        .from("stock_items")
        .update(updatePayload)
        .eq("id", stockItemId)
        .eq("company_id", companyId);

      if (updateError) throw updateError;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Ação inválida" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao salvar estoque" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json();

    if (body.action === "item") {
      const { error } = await supabase
        .from("stock_items")
        .update({
          name: body.name,
          category: body.category || "Geral",
          unit: body.unit || "un",
          current_quantity: Number(body.current_quantity || 0),
          min_quantity: Number(body.min_quantity || 0),
          average_cost: Number(body.average_cost || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.id)
        .eq("company_id", companyId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Ação inválida" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao atualizar estoque" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID obrigatório" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("stock_items")
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao excluir item" },
      { status: 500 }
    );
  }
}