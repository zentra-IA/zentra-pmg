import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase não configurado.");

  return createClient(url, key);
}

function clean(value: any) {
  return value === undefined || value === null ? "" : String(value).trim();
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);

    const { data, error } = await supabase
      .from("rh_recruiting_costs")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error && !String(error.message).includes("does not exist")) {
      throw new Error(error.message);
    }

    const costs = data || [];
    const total = costs.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);

    return NextResponse.json({
      success: true,
      costs,
      summary: {
        total,
        count: costs.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao carregar custos." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    const payload = {
      company_id: companyId,
      branch_id: branchId || null,
      title: clean(body.title) || "Custo RH",
      category: clean(body.category) || "divulgacao",
      job_id: clean(body.jobId || body.job_id) || null,
      amount: Number(body.amount || 0),
      notes: clean(body.notes) || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("rh_recruiting_costs")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, cost: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao salvar custo." },
      { status: 500 }
    );
  }
}
