import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function clean(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeRole(role?: string | null) {
  const value = clean(role).toUpperCase();

  if (["GERAL", "MASTER", "ADMIN", "OWNER"].includes(value)) return "GERAL";
  if (["SUPERVISOR", "GESTOR", "MANAGER"].includes(value)) return "SUPERVISOR";
  return "VENDEDOR";
}

function normalizeName(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeHeader(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeStatus(value: unknown) {
  const status = clean(value).toLowerCase();
  if (!status) return "ativo";
  if (["ativo", "ativa", "active"].includes(status)) return "ativo";
  if (["inativo", "inativa", "inactive"].includes(status)) return "inativo";
  return status;
}

function getCell(row: Record<string, unknown>, possibleNames: string[]) {
  const normalizedRow = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalizedRow.set(normalizeHeader(key), value);
  }

  for (const name of possibleNames) {
    const value = normalizedRow.get(normalizeHeader(name));
    if (value !== undefined && value !== null) return clean(value);
  }
  return "";
}

function setIfFilled(target: Record<string, any>, field: string, value: unknown) {
  const text = clean(value);
  if (text) target[field] = text;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Supervisor não possui acesso a esta importação operacional." },
        { status: 403 }
      );
    }

    if (!access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Selecione uma planilha Excel." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Formato inválido. Envie uma planilha .xlsx ou .xls." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return NextResponse.json(
        { error: "A planilha não possui nenhuma aba." },
        { status: 400 }
      );
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });

    if (!rows.length) {
      return NextResponse.json({ error: "A planilha está vazia." }, { status: 400 });
    }

    // Segurança: só carrega a carteira do vendedor autenticado.
    const existingCustomers = await prisma.salesCustomer.findMany({
      where: {
        company_id: access.companyId,
        seller_id: access.userId,
      },
      select: {
        id: true,
        internal_code: true,
        trade_name: true,
        legal_name: true,
        buyer_name: true,
        phone: true,
        whatsapp: true,
        status: true,
      },
    });

    const byInternalCode = new Map<string, any>();
    const byTradeName = new Map<string, any>();

    for (const customer of existingCustomers) {
      const internalCode = clean(customer.internal_code);
      const tradeName = normalizeName(customer.trade_name);
      if (internalCode) byInternalCode.set(internalCode, customer);
      if (tradeName) byTradeName.set(tradeName, customer);
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let ignored = 0;
    let errors = 0;

    const errorDetails: Array<{
      row: number;
      id?: string;
      fantasia?: string;
      error: string;
    }> = [];

    const processedIds = new Set<string>();
    const processedNames = new Set<string>();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const excelRow = index + 2;

      try {
        const internalCode = getCell(row, ["ID", "Código", "Codigo"]);
        const tradeName = getCell(row, ["Fantasia", "Nome Fantasia"]);
        const buyerName = getCell(row, ["Contato"]);
        const phone = getCell(row, ["Telefone Comercial"]);
        const whatsapp = getCell(row, ["Celular", "Telefone Celular"]);
        const statusRaw = getCell(row, ["Status"]);
        const normalizedTradeName = normalizeName(tradeName);

        if (!internalCode && !tradeName) {
          ignored += 1;
          continue;
        }

        let existing = internalCode
          ? byInternalCode.get(internalCode)
          : undefined;

        if (!existing && normalizedTradeName) {
          existing = byTradeName.get(normalizedTradeName);
        }

        if (
          (internalCode && processedIds.has(internalCode)) ||
          (normalizedTradeName && processedNames.has(normalizedTradeName))
        ) {
          existing =
            (internalCode ? byInternalCode.get(internalCode) : undefined) ||
            (normalizedTradeName ? byTradeName.get(normalizedTradeName) : undefined);
        }

        if (existing) {
          const updateData: Record<string, any> = {};

          setIfFilled(updateData, "internal_code", internalCode);
          setIfFilled(updateData, "trade_name", tradeName);
          setIfFilled(updateData, "buyer_name", buyerName);
          setIfFilled(updateData, "phone", phone);
          setIfFilled(updateData, "whatsapp", whatsapp);

          if (clean(statusRaw)) {
            updateData.status = normalizeStatus(statusRaw);
          }

          const changed = Object.entries(updateData).some(
            ([field, value]) => clean((existing as any)[field]) !== clean(value)
          );

          if (!changed) {
            unchanged += 1;
          } else {
            const customer = await prisma.salesCustomer.update({
              where: { id: existing.id },
              data: {
                ...updateData,
                updated_at: new Date(),
              },
            });

            updated += 1;

            if (clean(customer.internal_code)) {
              byInternalCode.set(clean(customer.internal_code), customer);
            }
            if (normalizeName(customer.trade_name)) {
              byTradeName.set(normalizeName(customer.trade_name), customer);
            }
          }
        } else {
          const legalName = tradeName || `Cliente PMG ${internalCode}`;

          const customer = await prisma.salesCustomer.create({
            data: {
              company_id: access.companyId,
              // Nunca aceitamos seller_id da planilha: vem da sessão.
              seller_id: access.userId,
              internal_code: internalCode || null,
              legal_name: legalName,
              trade_name: tradeName || legalName,
              buyer_name: buyerName || null,
              phone: phone || null,
              whatsapp: whatsapp || null,
              status: normalizeStatus(statusRaw || "ativo"),
            },
          });

          created += 1;

          if (clean(customer.internal_code)) {
            byInternalCode.set(clean(customer.internal_code), customer);
          }
          if (normalizeName(customer.trade_name)) {
            byTradeName.set(normalizeName(customer.trade_name), customer);
          }
        }

        if (internalCode) processedIds.add(internalCode);
        if (normalizedTradeName) processedNames.add(normalizedTradeName);
      } catch (error: any) {
        errors += 1;
        errorDetails.push({
          row: excelRow,
          id: getCell(row, ["ID"]),
          fantasia: getCell(row, ["Fantasia", "Nome Fantasia"]),
          error: error?.message || "Erro desconhecido ao importar cliente.",
        });

        console.error(`[customers:import] linha ${excelRow}`, error);
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        processed: rows.length,
        created,
        updated,
        unchanged,
        ignored,
        errors,
      },
      errors: errorDetails.slice(0, 50),
    });
  } catch (error: any) {
    console.error("[customers:import]", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao importar clientes do sistema PMG." },
      { status: 500 }
    );
  }
}
