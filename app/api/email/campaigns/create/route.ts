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

    const contacts = Array.isArray(body.contacts) ? body.contacts : [];

    const { data: campaign, error } = await supabase
      .from("email_campaigns")
      .insert({
        name: body.name,
        subject: body.subject,
        html: body.html,
        status: "draft",
        total: contacts.length,
        sent: 0,
      })
      .select("*")
      .single();

    if (error) throw error;

    const recipients = contacts.map((c: any) => ({
      campaign_id: campaign.id,
      contact_id: c.id,
      email: c.email,
      name: c.nome || c.name || "Sem nome",
      status: "pending",
    }));

    if (recipients.length) {
      const { error: recipientsError } = await supabase
        .from("email_campaign_recipients")
        .insert(recipients);

      if (recipientsError) throw recipientsError;
    }

    return NextResponse.json({ success: true, campaign });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Erro ao criar campanha" },
      { status: 500 }
    );
  }
}