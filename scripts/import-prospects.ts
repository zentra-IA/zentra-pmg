import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Use: npx tsx scripts/import-prospects.ts ./base.xlsx");
  process.exit(1);
}

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeEmail(email: any) {
  const value = clean(email).toLowerCase();
  return value.includes("@") ? value : null;
}

function normalizePhone(phone: any, city?: string) {
  let digits = String(phone || "").replace(/\D/g, "");

  if (!digits) return null;

  if (digits.length === 9 && clean(city).toLowerCase().includes("são paulo")) {
    digits = `11${digits}`;
  }

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  if (digits.length !== 13) return null;
  if (digits[4] !== "9") return null;

  return digits;
}

function chunkArray<T>(array: T[], size: number) {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

async function main() {
  console.log("Lendo planilha:", filePath);

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);

  let totalRows = rows.length;
  let created = 0;
  let updated = 0;
  let duplicated = 0;
  let invalidPhone = 0;
  let underAge = 0;

  const companyId =
  process.env.DEFAULT_COMPANY_ID ||
  process.env.PUBLIC_APPLY_COMPANY_ID;

if (!companyId) {
  throw new Error("DEFAULT_COMPANY_ID ou PUBLIC_APPLY_COMPANY_ID não configurado.");
}

const job = await prisma.prospectImportJob.create({
  data: {
    company_id: companyId,
    fileName: filePath,
    totalRows,
    status: "PROCESSING",
  },
});

  const prepared: any[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const name = clean(row.nome);
    const age = Number(row.idade || 0);
    const city = clean(row.cidade);
    const email = normalizeEmail(row.email);

    const phone1 = normalizePhone(row.celular1, city);
    const phone2 = normalizePhone(row.celular2, city);

    if (!name) continue;

    if (age < 18) {
      underAge++;
      continue;
    }

    if (!phone1 && !phone2) {
      invalidPhone++;
      continue;
    }

    const key = email || phone1 || phone2;

    if (!key) {
      invalidPhone++;
      continue;
    }

    if (seenKeys.has(key)) {
      duplicated++;
      continue;
    }

    seenKeys.add(key);

    prepared.push({
      name,
      age,
      email,
      phone1,
      phone2,
      gender: clean(row.sexo),
      city,
      address: clean(row.endereco),
      cep: clean(row.cep),
    });
  }

  console.log("Linhas lidas:", totalRows);
  console.log("Preparados:", prepared.length);

  const batches = chunkArray(prepared, 1000);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    console.log(`Processando lote ${i + 1}/${batches.length}`);

    const emails = batch.map((item) => item.email).filter(Boolean);
    const phones = batch.flatMap((item) => [item.phone1, item.phone2]).filter(Boolean);

    const existing = await prisma.prospect.findMany({
      where: {
        OR: [
          emails.length ? { email: { in: emails } } : undefined,
          phones.length ? { phone1: { in: phones } } : undefined,
          phones.length ? { phone2: { in: phones } } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        id: true,
        email: true,
        phone1: true,
        phone2: true,
        name: true,
        age: true,
        gender: true,
        city: true,
        address: true,
        cep: true,
      },
    });

    const existingMap = new Map<string, any>();

    for (const item of existing) {
      if (item.email) existingMap.set(item.email, item);
      if (item.phone1) existingMap.set(item.phone1, item);
      if (item.phone2) existingMap.set(item.phone2, item);
    }

    const toCreate: any[] = [];

    for (const item of batch) {
      const match =
        (item.email && existingMap.get(item.email)) ||
        (item.phone1 && existingMap.get(item.phone1)) ||
        (item.phone2 && existingMap.get(item.phone2));

      if (match) {
        duplicated++;

        await prisma.prospect.update({
          where: { id: match.id },
          data: {
            name: match.name || item.name,
            age: match.age || item.age,
            email: match.email || item.email,
            phone1: match.phone1 || item.phone1,
            phone2: match.phone2 || item.phone2,
            gender: match.gender || item.gender,
            city: match.city || item.city,
            address: match.address || item.address,
            cep: match.cep || item.cep,
          },
        });

        updated++;
      } else {
        toCreate.push(item);
      }
    }

    if (toCreate.length) {
      await prisma.prospect.createMany({
        data: toCreate,
        skipDuplicates: true,
      });

      created += toCreate.length;
    }
  }

  await prisma.prospectImportJob.update({
    where: { id: job.id },
    data: {
      created,
      updated,
      duplicated,
      invalidPhone,
      underAge,
      status: "DONE",
    },
  });

  console.log("Importação finalizada:");
  console.log({
    totalRows,
    created,
    updated,
    duplicated,
    invalidPhone,
    underAge,
  });

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Erro:", error);
  await prisma.$disconnect();
  process.exit(1);
});