import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const DEFAULT_BRANCH_ID = "1f07f893-48c6-4b9c-9c5f-4b680a4fef6c";

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
      .from("email_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      accounts: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao carregar contas",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    const domain = String(body.domain || "").trim().toLowerCase();
    const fromEmail = String(body.from_email || "").trim().toLowerCase();
    const fromName = String(body.from_name || "").trim();
    const apiKey = String(body.api_key || "").trim();

    if (!domain || !fromEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Domínio e e-mail remetente são obrigatórios",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("email_accounts")
      .insert({
        company_id: companyId,
        branch_id: branchId || DEFAULT_BRANCH_ID,
        provider: "resend",
        domain,
        from_email: fromEmail,
        from_name: fromName || null,
        api_key: apiKey || null,
        status: apiKey ? "active" : "pending",
        active: Boolean(apiKey),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      account: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao salvar conta",
      },
      { status: 500 }
    );
  }
}