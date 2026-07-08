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
      .from("Order")
      .select("total, createdAt")
      .eq("company_id", companyId)
      .order("createdAt");

    if (error) throw new Error(error.message);

    const grouped: Record<string, number> = {};

    for (const order of data || []) {
      const date = new Date(order.createdAt).toLocaleDateString("pt-BR");

      grouped[date] = (grouped[date] || 0) + Number(order.total || 0);
    }

    return NextResponse.json(
      Object.entries(grouped).map(([date, total]) => ({
        date,
        total,
      }))
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao carregar gráfico" },
      { status: 500 }
    );
  }
}