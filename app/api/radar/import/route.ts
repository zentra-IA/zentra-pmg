import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  canImportRadarContacts,
  requireCompanyAccess,
} from "@/lib/server-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: string) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

function get(row: Record<string, any>, names: string[]) {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }

  for (const name of names) {
    const value = normalized[normalizeHeader(name)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function parseDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;

    return new Date(
      Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0)
    );
  }

  const raw = clean(value);
  if (!raw) return null;

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMoney(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") return value;

  const raw = clean(value)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function normalizePhone(phone: any) {
  let digits = String(phone || "").replace(/\D/g, "");

  if (!digits) return null;

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  // Aceita celular e telefone fixo B2B.
  if (digits.length < 12 || digits.length > 13) return null;

  return digits;
}

function formatDigitsOnly(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function chunkArray<T>(array: T[], size: number) {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

export async function POST(req: NextRequest) {
  let jobId: string | null = null;

  try {
    const access = await requireCompanyAccess(req);

    if (!canImportRadarContacts(access)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Apenas usuários Master ou Supervisor podem importar clientes em massa.",
        },
        { status: 403 }
      );
    }

    const { companyId, branchId } = access;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Arquivo não enviado." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      raw: false,
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, {
      defval: "",
      raw: false,
    });

    const totalRows = rows.length;
    let created = 0;
    let updated = 0;
    let duplicated = 0;
    let invalidPhone = 0;
    let ignored = 0;

    const job = await prisma.prospectImportJob.create({
      data: {
        company_id: companyId,
        branch_id: branchId || null,
        fileName: file.name,
        totalRows,
        status: "PROCESSING",
      },
    });

    jobId = job.id;

    const prepared: any[] = [];
    const seenKeys = new Set<string>();

    for (const row of rows) {
      const externalId = clean(get(row, ["ID", "Codigo", "Código", "CodigoCliente", "CódigoCliente"]));
      const name = clean(get(row, ["NomeCliente", "Nome Cliente", "Cliente", "Empresa", "RazaoSocial", "Razão Social", "Nome"]));
      const city = clean(get(row, ["ZonaCliente", "Zona Cliente", "Cidade", "Municipio", "Município"]));
      const phone1 = normalizePhone(get(row, ["Contato", "Telefone", "Celular", "Whatsapp", "WhatsApp"]));
      const email = clean(get(row, ["Email", "E-mail"])) || null;

      const lastTransferAt = parseDate(get(row, ["UltimaTransferencia", "Última Transferência", "Ultima Transferencia"]));
      const lastActivationAt = parseDate(get(row, ["UltimaAtivacao", "Última Ativação", "Ultima Ativacao"]));
      const lastOrderAt = parseDate(get(row, ["UltimoPedido", "Último Pedido", "Ultimo Pedido"]));
      const creditLimit = parseMoney(get(row, ["LimiteCreditoPrazo", "Limite Crédito Prazo", "LimiteCredito", "Limite"]));
      const paymentMethod = clean(get(row, ["FormasPagamento", "Formas Pagamento", "FormaPagamento", "Forma de Pagamento"]));

      if (!name) {
        ignored++;
        continue;
      }

      if (!phone1) {
        invalidPhone++;
      }

      const key =
        externalId ||
        phone1 ||
        `${name.toLowerCase()}-${city.toLowerCase()}`;

      if (seenKeys.has(key)) {
        duplicated++;
        continue;
      }

      seenKeys.add(key);

      prepared.push({
        company_id: companyId,
        branch_id: branchId || null,
        externalId: externalId || null,
        name,
        age: null,
        email,
        phone1,
        phone2: null,
        gender: null,
        city,
        address: null,
        cep: null,
        lastTransferAt,
        lastActivationAt,
        lastOrderAt,
        creditLimit,
        paymentMethod: paymentMethod || null,
        sourcePayload: row,
        active: true,
      });
    }

    const batches = chunkArray(prepared, 300);

    for (const batch of batches) {
      for (const item of batch) {
        const existing = await prisma.prospect.findFirst({
          where: {
            company_id: companyId,
            OR: [
              item.externalId ? { externalId: item.externalId } : undefined,
              item.phone1 ? { phone1: item.phone1 } : undefined,
              {
                AND: [
                  { name: { equals: item.name, mode: "insensitive" } },
                  item.city
                    ? { city: { equals: item.city, mode: "insensitive" } }
                    : {},
                ],
              },
            ].filter(Boolean) as any[],
          },
          select: {
            id: true,
          },
        });

        if (existing?.id) {
          await prisma.prospect.update({
            where: { id: existing.id },
            data: item,
          });

          updated++;
        } else {
          await prisma.prospect.create({
            data: item,
          });

          created++;
        }
      }
    }

    await prisma.prospectImportJob.update({
      where: { id: jobId },
      data: {
        created,
        updated,
        duplicated,
        invalidPhone,
        underAge: 0,
        status: "COMPLETED",
      },
    });

    return NextResponse.json({
      success: true,
      jobId,
      totalRows,
      prepared: prepared.length,
      created,
      updated,
      duplicated,
      invalidPhone,
      ignored,
    });
  } catch (error: any) {
    console.error("[RADAR_IMPORT_ERROR]", error);

    if (jobId) {
      await prisma.prospectImportJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: error?.message || "Erro desconhecido",
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao importar base.",
      },
      { status: 500 }
    );
  }
}
