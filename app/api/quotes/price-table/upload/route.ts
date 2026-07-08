import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/server-company";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type ParsedPdfItem = {
  code: string;
  name: string;
  sellUnit: string;
  price: number;
  page?: number;
  raw?: string;
};

async function ensureQuoteDailyPricesTable() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS quote_daily_prices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      branch_id uuid NULL,
      catalog_product_id uuid NULL,
      code text NOT NULL,
      pdf_name text NULL,
      product_name_from_pdf text NOT NULL,
      sell_unit text NOT NULL,
      price numeric(12,2) NOT NULL,
      table_date date NOT NULL,
      raw_line text NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS quote_daily_prices_company_code_date_idx
    ON quote_daily_prices (company_id, code, table_date)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS quote_daily_prices_company_date_idx
    ON quote_daily_prices (company_id, table_date)
  `);
}

function runPythonParser(pdfPath: string, timeoutMs = 120000): Promise<any> {
  return new Promise((resolve, reject) => {
    const parserPath = path.join(process.cwd(), "scripts", "pmg-pdf-parser.py");

    if (!existsSync(parserPath)) {
      reject(new Error(`Parser Python não encontrado em: ${parserPath}`));
      return;
    }

    const candidates: Array<{ cmd: string; args: string[] }> = [
      { cmd: "py", args: ["-X", "utf8", parserPath, pdfPath] },
      { cmd: "python", args: [parserPath, pdfPath] },
      { cmd: "python3", args: [parserPath, pdfPath] },
    ];

    let index = 0;
    const errors: string[] = [];

    const tryNext = () => {
      const current = candidates[index++];

      if (!current) {
        reject(
          new Error(
            "Não consegui executar o parser Python.\n" +
              "Rode: py -m pip install -r requirements-quotes.txt\n\n" +
              errors.join("\n---\n")
          )
        );
        return;
      }

      console.log(`[quotes/upload] iniciando parser: ${current.cmd} ${current.args.join(" ")}`);

      const child = spawn(current.cmd, current.args, {
        cwd: process.cwd(),
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
      });

      let stdout = "";
      let stderr = "";
      let finished = false;

      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        child.kill("SIGKILL");
        errors.push(`${current.cmd}: timeout após ${timeoutMs / 1000}s\n${stderr.slice(0, 1000)}`);
        tryNext();
      }, timeoutMs);

      child.stdout.on("data", (data) => {
        stdout += data.toString("utf8");
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString("utf8");
      });

      child.on("error", (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        errors.push(`${current.cmd}: ${err.message}`);
        tryNext();
      });

      child.on("close", (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        if (stderr.trim()) {
          console.warn(`[quotes/upload] stderr python (${current.cmd}):`, stderr.slice(0, 1200));
        }

        if (!stdout.trim()) {
          errors.push(`${current.cmd}: sem saída. Exit ${code}. ${stderr.slice(0, 1000)}`);
          tryNext();
          return;
        }

        try {
          // Garante que, se alguma lib imprimir lixo antes/depois, pegamos só o JSON.
          const start = stdout.indexOf("{");
          const end = stdout.lastIndexOf("}");
          const jsonText = start >= 0 && end >= start ? stdout.slice(start, end + 1) : stdout;
          const data = JSON.parse(jsonText);

          if (!data.success) {
            errors.push(`${current.cmd}: ${data.error || "Parser retornou erro."}`);
            tryNext();
            return;
          }

          console.log(`[quotes/upload] parser OK: ${data.count || data.items?.length || 0} produtos`);
          resolve(data);
        } catch (err: any) {
          errors.push(
            `${current.cmd}: JSON inválido: ${err?.message || err}\nSTDOUT: ${stdout.slice(0, 1000)}\nSTDERR: ${stderr.slice(0, 1000)}`
          );
          tryNext();
        }
      });
    };

    tryNext();
  });
}

async function getCatalogMap(companyId: string, codes: string[]) {
  if (!codes.length) return new Map<string, string>();

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; code: string }>>(
    `SELECT id, code
       FROM quote_catalog_products
      WHERE company_id = $1::uuid
        AND code = ANY($2::text[])`,
    companyId,
    codes
  );

  return new Map(rows.map((r) => [String(r.code), String(r.id)]));
}

async function upsertDailyPricesBatch(params: {
  companyId: string;
  branchId: string | null;
  pdfName: string;
  tableDate: string;
  items: ParsedPdfItem[];
  catalogMap: Map<string, string>;
}) {
  const chunkSize = 250;
  let updated = 0;
  let unmatched = 0;

  for (let offset = 0; offset < params.items.length; offset += chunkSize) {
    const chunk = params.items.slice(offset, offset + chunkSize);
    const valuesSql: string[] = [];
    const values: any[] = [];

    for (const item of chunk) {
      const catalogProductId = params.catalogMap.get(item.code) || null;
      if (!catalogProductId) unmatched++;

      const base = values.length;
      valuesSql.push(
        `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}::uuid, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::date, $${base + 10}, now())`
      );

      values.push(
        params.companyId,
        params.branchId,
        catalogProductId,
        item.code,
        params.pdfName,
        item.name,
        item.sellUnit,
        Number(item.price),
        params.tableDate,
        item.raw || `${item.code} ${item.name} ${item.sellUnit} R$ ${item.price}`
      );
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO quote_daily_prices
        (
          company_id,
          branch_id,
          catalog_product_id,
          code,
          pdf_name,
          product_name_from_pdf,
          sell_unit,
          price,
          table_date,
          raw_line,
          updated_at
        )
       VALUES ${valuesSql.join(",")}
       ON CONFLICT (company_id, code, table_date)
       DO UPDATE SET
          catalog_product_id = EXCLUDED.catalog_product_id,
          pdf_name = EXCLUDED.pdf_name,
          product_name_from_pdf = EXCLUDED.product_name_from_pdf,
          sell_unit = EXCLUDED.sell_unit,
          price = EXCLUDED.price,
          raw_line = EXCLUDED.raw_line,
          updated_at = now()`,
      ...values
    );

    updated += chunk.length;
    console.log(`[quotes/upload] gravado lote ${offset + chunk.length}/${params.items.length}`);
  }

  return { updated, unmatched };
}

export async function POST(req: NextRequest) {
  let tempPath = "";
  const startedAt = Date.now();

  try {
    console.log("[quotes/upload] POST recebido");

    const auth = await requireCompanyAccess(req);
    await ensureQuoteDailyPricesTable();

    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Envie o PDF da tabela do dia." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (!buffer.length) {
      return NextResponse.json(
        { success: false, error: "O arquivo PDF está vazio." },
        { status: 400 }
      );
    }

    tempPath = path.join(
      os.tmpdir(),
      `pmg-price-table-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`
    );

    await writeFile(tempPath, buffer);
    console.log(`[quotes/upload] PDF salvo temporário: ${tempPath} (${buffer.length} bytes)`);

    const parsed = await runPythonParser(tempPath);
    const items: ParsedPdfItem[] = parsed.items || [];

    if (!items.length) {
      return NextResponse.json(
        {
          success: false,
          error: "O PDF foi aberto, mas nenhum produto foi identificado pelo parser Python.",
          debug: {
            ignoredCount: parsed.ignoredCount || 0,
            ignoredSample: parsed.ignoredSample || [],
          },
        },
        { status: 422 }
      );
    }

    const codes = Array.from(new Set(items.map((item) => String(item.code))));
    const catalogMap = await getCatalogMap(auth.companyId, codes);
    const tableDate = new Date().toISOString().slice(0, 10);

    console.log(`[quotes/upload] catálogo encontrado para ${catalogMap.size}/${codes.length} códigos`);

    const { updated, unmatched } = await upsertDailyPricesBatch({
      companyId: auth.companyId,
      branchId: auth.branchId || null,
      pdfName: file.name,
      tableDate,
      items,
      catalogMap,
    });

    return NextResponse.json({
      success: true,
      engine: "python-pdfplumber-batch",
      file: file.name,
      parsed: items.length,
      updated,
      unmatched,
      catalogMatched: catalogMap.size,
      tableDate,
      ms: Date.now() - startedAt,
      sample: items.slice(0, 10),
      ignoredCount: parsed.ignoredCount || 0,
      ignoredSample: parsed.ignoredSample || [],
    });
  } catch (err: any) {
    console.error("[quotes/price-table/upload]", err);

    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Erro ao ler PDF.",
      },
      { status: 500 }
    );
  } finally {
    if (tempPath) {
      unlink(tempPath).catch(() => {});
    }
  }
}
