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

    const { data, error } = await supabase
      .from("OrderItem")
      .select("*")
      .eq("company_id", companyId);

    if (error) throw error;

    const products: Record<
      string,
      {
        name: string;
        quantity: number;
        revenue: number;
      }
    > = {};

    for (const item of data || []) {
      if (!products[item.name]) {
        products[item.name] = {
          name: item.name,
          quantity: 0,
          revenue: 0,
        };
      }

      products[item.name].quantity += Number(item.quantity || 0);
      products[item.name].revenue +=
        Number(item.price || 0) * Number(item.quantity || 0);
    }

    const ranking = Object.values(products)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return NextResponse.json(ranking);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar produtos mais vendidos" },
      { status: 500 }
    );
  }
}