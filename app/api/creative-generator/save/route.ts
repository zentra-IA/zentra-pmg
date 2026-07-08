import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    const payload = {
      company_id: companyId,
      branch_id: branchId || null,
      type: "rh_creative",
      title: body.jobTitle || body.creativeType || "Criativo RH",
      prompt: body.prompt || null,
      settings: {
        creativeType: body.creativeType,
        style: body.style,
        format: body.format,
        jobTitle: body.jobTitle,
        city: body.city,
        salary: body.salary,
        benefits: body.benefits,
        requirements: body.requirements,
        companyName: body.companyName,
        recruiterWhatsapp: body.recruiterWhatsapp,
        extra: body.extra,
      },
      result: body.result || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("creative_generations")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("SAVE CREATIVE ERROR:", error);

      return NextResponse.json(
        {
          error:
            "Não foi possível salvar. Verifique se a tabela creative_generations existe.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      creative: data,
    });
  } catch (error: any) {
    console.error("POST /api/creative-generator/save:", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao salvar criativo.",
      },
      { status: 500 }
    );
  }
}
