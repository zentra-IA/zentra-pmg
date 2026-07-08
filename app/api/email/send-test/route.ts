import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados"
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();

    const { companyId } = await requireCompany(req);

    const body = await req.json();

    const to = String(
      body?.to || ""
    ).trim();

    const accountId = String(
      body?.accountId || ""
    ).trim();

    if (!to) {
      return NextResponse.json(
        {
          success: false,
          error: "Email de destino obrigatório",
        },
        { status: 400 }
      );
    }

    let query = supabase
      .from("email_accounts")
      .select("*")
      .eq("company_id", companyId)
      .eq("active", true);

    let accountResult;

    if (accountId) {
      accountResult = await query
        .eq("id", accountId)
        .maybeSingle();
    } else {
      accountResult = await query
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();
    }

    const {
      data: account,
      error,
    } = accountResult;

    if (error || !account) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Conta de email ativa não encontrada",
        },
        { status: 404 }
      );
    }

    if (!account.api_key) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Conta sem API Key Resend",
        },
        { status: 400 }
      );
    }

    const resend = new Resend(
      account.api_key
    );

    const result =
      await resend.emails.send({
        from: account.from_name
          ? `${account.from_name} <${account.from_email}>`
          : account.from_email,

        to,

        subject:
          body.subject ||
          "Email de teste",

        html:
          body.html ||
          "<p>Email de teste enviado pelo Zentra.</p>",
      });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error(
      "EMAIL TEST ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao enviar teste",
      },
      { status: 500 }
    );
  }
}