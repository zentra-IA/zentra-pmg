import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const campaignId = String(body.campaignId || "").trim();

    if (!campaignId) {
      return NextResponse.json(
        { success: false, error: "campaignId obrigatório" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("email_campaigns")
      .update({
        name: body.name,
        subject: body.subject,
        html: body.html,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Erro ao atualizar campanha" },
      { status: 500 }
    );
  }
}