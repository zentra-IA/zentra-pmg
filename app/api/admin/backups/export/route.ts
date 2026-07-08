import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase não configurado. Verifique NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function toCsv(rows: any[]) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);

  const escape = (value: any) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(",")),
  ].join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "companies";

    let table = "";
    let filename = "";

    if (type === "companies") {
      table = "companies";
      filename = "empresas.csv";
    } else if (type === "customers") {
      table = "Customer";
      filename = "clientes.csv";
    } else if (type === "orders") {
      table = "Order";
      filename = "pedidos.csv";
    } else if (type === "products") {
      table = "Product";
      filename = "produtos.csv";
    } else {
      return NextResponse.json(
        { error: "Tipo de backup inválido" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .limit(10000);

    if (error) throw new Error(error.message);

   await auditLog({
  action: "exportou_backup",
  entity: "backup",
  metadata: {
    description: `Exportou backup de ${type}`,
    type,
    total: data?.length || 0,
  },
});

    const csv = toCsv(data || []);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro ao exportar backup" },
      { status: 500 }
    );
  }
}