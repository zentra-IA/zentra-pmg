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

function monthRef() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const month = new URL(req.url).searchParams.get("month") || monthRef();

    const [
      suppliers,
      invoices,
      purchases,
      employees,
      expenses,
      products,
      appRevenues,
    ] = await Promise.all([
      supabase.from("suppliers").select("*").eq("company_id", companyId).order("name"),
      supabase.from("purchase_invoices").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("purchase_items").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("employees").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("business_expenses").select("*").eq("company_id", companyId).eq("reference_month", month).order("created_at", { ascending: false }),
      supabase.from("Product").select("id,name,price,costPrice,active").eq("company_id", companyId).order("name"),
      supabase.from("app_revenues").select("*").eq("company_id", companyId).order("received_date", { ascending: false }),
    ]);

    const supplierMap = new Map((suppliers.data || []).map((s: any) => [s.id, s]));

    const invoicesWithSuppliers = (invoices.data || []).map((inv: any) => ({
      ...inv,
      suppliers: inv.supplier_id
        ? { name: supplierMap.get(inv.supplier_id)?.name || "Fornecedor" }
        : null,
      items: (purchases.data || []).filter((p: any) => p.invoice_id === inv.id),
    }));

    const purchasesWithSuppliers = (purchases.data || []).map((p: any) => ({
      ...p,
      suppliers: p.supplier_id
        ? { name: supplierMap.get(p.supplier_id)?.name || "Fornecedor" }
        : null,
    }));

    const today = todayISO();
    const tomorrow = tomorrowISO();

    const reminders = [
      ...invoicesWithSuppliers
        .filter((x: any) => !x.paid && x.due_date)
        .map((x: any) => ({
          id: x.id,
          table: "purchase_invoices",
          type: "Nota fiscal",
          title: x.invoice_number || "Nota sem número",
          amount: x.total_amount,
          due_date: x.due_date,
          status:
            x.due_date < today
              ? "overdue"
              : x.due_date === today
              ? "today"
              : x.due_date === tomorrow
              ? "tomorrow"
              : "future",
        })),
      ...(expenses.data || [])
        .filter((x: any) => !x.paid && x.due_day)
        .map((x: any) => {
          const now = new Date();
          const due = new Date(now.getFullYear(), now.getMonth(), Number(x.due_day))
            .toISOString()
            .slice(0, 10);

          return {
            id: x.id,
            table: "business_expenses",
            type: "Conta",
            title: x.name,
            amount: x.amount,
            due_date: due,
            status:
              due < today
                ? "overdue"
                : due === today
                ? "today"
                : due === tomorrow
                ? "tomorrow"
                : "future",
          };
        }),
    ].filter((x: any) => ["overdue", "today", "tomorrow"].includes(x.status));

    return NextResponse.json({
      success: true,
      month,
      suppliers: suppliers.data || [],
      invoices: invoicesWithSuppliers,
      purchases: purchasesWithSuppliers,
      employees: employees.data || [],
      expenses: expenses.data || [],
      products: products.data || [],
      appRevenues: appRevenues.data || [],
      reminders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao buscar ERP" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId, branchId } = await requireCompany(req);
    const body = await req.json();

    const base = {
      company_id: companyId,
      branch_id: branchId || null,
    };

    const actions: Record<string, string> = {
      "purchase-invoice": "purchase_invoices",
      supplier: "suppliers",
      purchase: "purchase_items",
      "app-revenue": "app_revenues",
      employee: "employees",
      expense: "business_expenses",
    };

    if (body.action === "purchase-bulk") {
      const rows = Array.isArray(body.items) ? body.items : [];
      let invoiceId = body.invoice_id || null;

      if (!invoiceId && body.create_invoice !== false) {
        const invoiceTotal =
          Number(body.total_amount || 0) ||
          rows.reduce((sum: number, item: any) => sum + Number(item.total_amount || 0), 0);

        const createdInvoice = await supabase
          .from("purchase_invoices")
          .insert({
            ...base,
            supplier_id: body.supplier_id || null,
            invoice_number: body.invoice_number || null,
            payment_method: body.payment_method || "avista",
            due_date: body.due_date || null,
            total_amount: invoiceTotal,
            paid: Boolean(body.paid),
            notes: body.notes || null,
          })
          .select("*")
          .single();

        if (createdInvoice.error) throw createdInvoice.error;
        invoiceId = createdInvoice.data.id;
      }

      const payload = rows.map((item: any) => ({
        ...base,
        invoice_id: invoiceId,
        name: item.name,
        supplier_id: item.supplier_id || body.supplier_id || null,
        quantity: Number(item.quantity || 0),
        unit: item.unit || "un",
        unit_price: Number(item.unit_price || 0),
        total_amount: Number(item.total_amount || 0),
        payment_method: item.payment_method || body.payment_method || "avista",
        due_date: item.due_date || body.due_date || null,
        paid: Boolean(item.paid || body.paid),
        invoice_number: item.invoice_number || body.invoice_number || null,
        notes: item.notes || null,
      }));

      const { data, error } = await supabase.from("purchase_items").insert(payload).select("*");
      if (error) throw error;

      return NextResponse.json({ success: true, invoice_id: invoiceId, data });
    }

    const table = actions[body.action];

    if (!table) {
      return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
    }

    const payloadByAction: any = {
      "purchase-invoice": {
        ...base,
        supplier_id: body.supplier_id || null,
        invoice_number: body.invoice_number || null,
        payment_method: body.payment_method || "avista",
        due_date: body.due_date || null,
        total_amount: Number(body.total_amount || 0),
        paid: Boolean(body.paid),
        notes: body.notes || null,
      },
      supplier: {
        ...base,
        name: body.name,
        phone: body.phone || null,
        document: body.document || null,
      },
      purchase: {
        ...base,
        invoice_id: body.invoice_id || null,
        name: body.name,
        supplier_id: body.supplier_id || null,
        quantity: Number(body.quantity || 0),
        unit: body.unit || "un",
        unit_price: Number(body.unit_price || 0),
        total_amount: Number(body.total_amount || 0),
        payment_method: body.payment_method || "avista",
        due_date: body.due_date || null,
        paid: Boolean(body.paid),
        invoice_number: body.invoice_number || null,
        notes: body.notes || null,
      },
      "app-revenue": {
        ...base,
        app_name: body.app_name,
        received_date: body.received_date,
        gross_amount: Number(body.gross_amount || 0),
        fee_amount: Number(body.fee_amount || 0),
        net_amount: Number(body.net_amount || 0),
        notes: body.notes || null,
      },
      employee: {
        ...base,
        name: body.name,
        role: body.role || null,
        salary: Number(body.salary || 0),
        payment_day_1: Number(body.payment_day_1 || 5),
        payment_day_2: Number(body.payment_day_2 || 20),
        has_advance: Boolean(body.has_advance),
        advance_amount: Number(body.advance_amount || 0),
        notes: body.notes || null,
        active: true,
      },
      expense: {
        ...base,
        name: body.name,
        type: body.type || "fixed",
        category: body.category || "Outros",
        amount: Number(body.amount || 0),
        due_day: body.due_day ? Number(body.due_day) : null,
        paid: Boolean(body.paid),
        recurring: body.recurring !== false,
        payment_method: body.payment_method || "boleto",
        notes: body.notes || null,
        reference_month: body.reference_month || monthRef(),
      },
    };

    const { data, error } = await supabase
      .from(table)
      .insert(payloadByAction[body.action])
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao salvar ERP" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const body = await req.json();
    const updated_at = new Date().toISOString();

    const actionMap: any = {
      "purchase-invoice": {
        table: "purchase_invoices",
        data: {
          supplier_id: body.supplier_id || null,
          invoice_number: body.invoice_number || null,
          payment_method: body.payment_method || "avista",
          due_date: body.due_date || null,
          total_amount: Number(body.total_amount || 0),
          paid: Boolean(body.paid),
          notes: body.notes || null,
          updated_at,
        },
      },
      "purchase-invoice-paid": {
        table: "purchase_invoices",
        data: { paid: Boolean(body.paid), updated_at },
      },
      "product-cost": {
        table: "Product",
        data: { costPrice: Number(body.costPrice || 0) },
        idField: "productId",
      },
      "app-revenue": {
        table: "app_revenues",
        data: {
          app_name: body.app_name,
          received_date: body.received_date,
          gross_amount: Number(body.gross_amount || 0),
          fee_amount: Number(body.fee_amount || 0),
          net_amount: Number(body.net_amount || 0),
          notes: body.notes || null,
          updated_at,
        },
      },
      "purchase-paid": {
        table: "purchase_items",
        data: { paid: Boolean(body.paid), updated_at },
      },
      "expense-paid": {
        table: "business_expenses",
        data: { paid: Boolean(body.paid), updated_at },
      },
    };

    const config = actionMap[body.action];

    if (!config) {
      return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
    }

    const id = config.idField ? body[config.idField] : body.id;

    const { error } = await supabase
      .from(config.table)
      .update(config.data)
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao atualizar ERP" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { companyId } = await requireCompany(req);
    const { searchParams } = new URL(req.url);

    const table = searchParams.get("table");
    const id = searchParams.get("id");

    if (!table || !id) {
      return NextResponse.json(
        { success: false, error: "table e id obrigatórios" },
        { status: 400 }
      );
    }

    const allowedTables = [
      "suppliers",
      "purchase_items",
      "purchase_invoices",
      "employees",
      "business_expenses",
      "app_revenues",
    ];

    if (!allowedTables.includes(table)) {
      return NextResponse.json(
        { success: false, error: "Tabela inválida" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao excluir ERP" },
      { status: 500 }
    );
  }
}