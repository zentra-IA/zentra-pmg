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

function cleanPhone(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function parseCSV(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = lines[0]
    .split(",")
    .map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  });
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();

    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const whatsappAccountId = String(formData.get("whatsappAccountId") || "1");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Arquivo obrigatório" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseCSV(text);
    const importBatchId = crypto.randomUUID();

    const contacts = rows
      .map((row) => ({
        nome: row.nome || row.name || "Sem nome",
        telefone: cleanPhone(row.telefone || row.phone || row.whatsapp),
        status: "novo",
        conversation_stage: "new",
        ai_paused: false,
        whatsapp_account_id: whatsappAccountId,
        import_batch_id: importBatchId,
        criado_em: new Date().toISOString(),
      }))
      .filter((contact) => contact.telefone);

    if (contacts.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhum contato válido encontrado" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("contacts").insert(contacts);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      imported: contacts.length,
      importBatchId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao importar" },
      { status: 500 }
    );
  }
}