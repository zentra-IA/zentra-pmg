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

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    const name = String(body.name || "").trim();
    const subject = String(body.subject || "").trim();
    const html = String(body.html || "").trim();
    const emailAccountId = String(body.emailAccountId || "").trim();
    const batchId = String(body.batchId || "").trim();

    if (!name || !subject || !html || !emailAccountId || !batchId) {
      return NextResponse.json(
        {
          success: false,
          error: "Nome, assunto, mensagem, conta e lote são obrigatórios",
        },
        { status: 400 }
      );
    }

    const { data: batch, error: batchError } = await supabase
      .from("email_contact_batches")
      .select("*")
      .eq("id", batchId)
      .eq("company_id", companyId)
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        {
          success: false,
          error: "Lote não encontrado",
        },
        { status: 404 }
      );
    }

    const { data: batchContacts, error: batchContactsError } = await supabase
      .from("email_batch_contacts")
      .select("contact_id")
      .eq("batch_id", batchId)
      .eq("company_id", companyId);

    if (batchContactsError) throw batchContactsError;

    const contactIds = (batchContacts || []).map(
      (item: any) => item.contact_id
    );

    if (!contactIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Este lote não possui contatos",
        },
        { status: 400 }
      );
    }

    const { data: contacts, error: contactsError } = await supabase
      .from("email_contacts")
      .select("*")
      .in("id", contactIds)
      .eq("company_id", companyId);

    if (contactsError) throw contactsError;

    const validContacts = (contacts || []).filter((c: any) => c.email);

    if (!validContacts.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum contato válido no lote",
        },
        { status: 400 }
      );
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .insert({
        company_id: companyId,
        branch_id: branchId || batch.branch_id || null,
        email_account_id: emailAccountId,
        name,
        subject,
        html,
        status: "draft",
        total: validContacts.length,
        sent: 0,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (campaignError) throw campaignError;

    const recipients = validContacts.map((contact: any) => ({
      campaign_id: campaign.id,
      contact_id: contact.id,
      email: contact.email,
      name: contact.nome || contact.name || "Sem nome",
      status: "pending",
    }));

    const { error: recipientsError } = await supabase
      .from("email_campaign_recipients")
      .insert(recipients);

    if (recipientsError) throw recipientsError;

    return NextResponse.json({
      success: true,
      campaign,
      recipients: recipients.length,
    });
  } catch (error: any) {
    console.error("CREATE EMAIL CAMPAIGN FROM BATCH:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao criar campanha",
      },
      { status: 500 }
    );
  }
}