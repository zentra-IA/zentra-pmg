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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    const batchName =
      String(body.batchName || "").trim() ||
      `Lote ${new Date().toLocaleString("pt-BR")}`;

    const lines = String(body.contacts || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const contacts = [];

    for (const line of lines) {
      let nome = "";
      let email = "";
      let telefone = "";

      if (line.includes(",")) {
        const parts = line.split(",").map((v) => v.trim());
        nome = parts[0] || "";
        email = parts[1] || "";
        telefone = parts[2] || "";
      } else {
        email = line;
      }

      if (!isValidEmail(email)) continue;

      contacts.push({
        company_id: companyId,
        branch_id: branchId || null,
        nome: nome || null,
        email: email.toLowerCase(),
        telefone,
        origem: "EMAIL",
        status: "NOVO",
        updated_at: new Date().toISOString(),
      });
    }

    if (!contacts.length) {
      return NextResponse.json(
        { success: false, error: "Nenhum email válido encontrado" },
        { status: 400 }
      );
    }

    const { data: savedContacts, error: contactsError } = await supabase
      .from("email_contacts")
      .upsert(contacts, {
        onConflict: "company_id,email",
      })
      .select("*");

    if (contactsError) throw contactsError;

    const { data: batch, error: batchError } = await supabase
      .from("email_contact_batches")
      .insert({
        company_id: companyId,
        branch_id: branchId || null,
        name: batchName,
        total: savedContacts?.length || 0,
      })
      .select("*")
      .single();

    if (batchError) throw batchError;

    const links =
      savedContacts?.map((contact: any) => ({
        company_id: companyId,
        branch_id: branchId || null,
        batch_id: batch.id,
        contact_id: contact.id,
      })) || [];

    if (links.length) {
      const { error: linksError } = await supabase
        .from("email_batch_contacts")
        .insert(links);

      if (linksError) throw linksError;
    }

    return NextResponse.json({
      success: true,
      imported: savedContacts?.length || 0,
      batch,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao importar lote" },
      { status: 500 }
    );
  }
}