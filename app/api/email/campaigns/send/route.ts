import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
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

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json();

    const campaignId = String(body.campaignId || "").trim();

    if (!campaignId) {
      return NextResponse.json(
        { success: false, error: "campaignId obrigatório" },
        { status: 400 }
      );
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("company_id", companyId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campanha não encontrada");
    }

    if (!campaign.email_account_id) {
      throw new Error("Campanha sem conta de envio vinculada");
    }

    const { data: account, error: accountError } = await supabase
      .from("email_accounts")
      .select("*")
      .eq("id", campaign.email_account_id)
      .eq("company_id", companyId)
      .single();

    if (accountError || !account) throw new Error("Conta de envio não encontrada");
    if (!account.api_key) throw new Error("Conta sem API Key Resend");
    if (!account.from_email) throw new Error("Conta sem e-mail remetente");

    const resend = new Resend(account.api_key);

    const { data: recipients, error: recipientsError } = await supabase
      .from("email_campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .limit(100);

    if (recipientsError) throw recipientsError;

    let sent = 0;

    for (const recipient of recipients || []) {
      try {
        const html = String(campaign.html || "")
          .replaceAll("[Nome]", recipient.name || "")
          .replaceAll("[Seu Nome]", account.from_name || account.from_email);

        await resend.emails.send({
          from: account.from_name
            ? `${account.from_name} <${account.from_email}>`
            : account.from_email,
          to: recipient.email,
          subject: campaign.subject || "Mensagem",
          html,
        });

        await supabase
          .from("email_campaign_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", recipient.id);

        sent++;
      } catch (e: any) {
        await supabase
          .from("email_campaign_recipients")
          .update({
            status: "error",
            error: e?.message || "Erro ao enviar",
          })
          .eq("id", recipient.id);
      }
    }

    await supabase
      .from("email_campaigns")
      .update({
        status: "sending",
        sent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
      .eq("company_id", companyId);

    return NextResponse.json({ success: true, sent });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Erro ao enviar campanha" },
      { status: 500 }
    );
  }
}