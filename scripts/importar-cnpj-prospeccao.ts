import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import * as dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Zentra Sales AI — Importador CNPJ Prospecção V2
 *
 * Fonte:
 *   espelho público dos Dados Abertos do CNPJ/Receita Federal.
 *
 * Filtro V2:
 *   - UF = SP
 *   - Situação cadastral = 02 (ATIVA)
 *   - CNAEs ligados a alimentação / food service / varejo alimentar
 *   - Pelo menos um telefone informado (fixo, móvel ou não classificado)
 *
 * Uso:
 *   npx.cmd tsx scripts\importar-cnpj-prospeccao.ts --teste
 *   npx.cmd tsx scripts\importar-cnpj-prospeccao.ts --diagnostico
 *   npx.cmd tsx scripts\importar-cnpj-prospeccao.ts
 *
 * Atualização mensal / reconstrução:
 *   npx.cmd tsx scripts\importar-cnpj-prospeccao.ts --reconstruir
 */

const ROOT_URL =
  process.env.CNPJ_PROSPECTING_ROOT_URL ||
  "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/";

const CACHE_DIR = path.resolve(
  process.cwd(),
  ".cache",
  "cnpj-prospeccao"
);

const CHECKPOINT_PATH = path.join(CACHE_DIR, "checkpoint.json");

const args = new Set(process.argv.slice(2));
const TEST_MODE = args.has("--teste");
const REBUILD_MODE = args.has("--reconstruir");
const ENRICH_COMPANIES = args.has("--com-empresas");
const DIAGNOSTIC_MODE = args.has("--diagnostico");

type Checkpoint = {
  baseUrl: string;
  snapshot: string;
  completedFiles: string[];
  completedCompanyFiles: string[];
  totalRead: number;
  totalAccepted: number;
  totalInserted: number;
  updatedAt: string;
};

type ProspectRow = {
  cnpj: string;
  cnpj_basico: string;
  cnpj_ordem: string;
  cnpj_dv: string;
  trade_name: string | null;
  cnae_main: string;
  cnae_secondary: string[];
  cnae_description: string | null;
  segment_tags: string[];
  status_code: string;
  start_date: Date | null;
  uf: string;
  city_code: string;
  city: string;
  city_search: string;
  neighborhood: string | null;
  neighborhood_search: string | null;
  street_type: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  postal_code: string | null;
  phone: string;
  phone_digits: string;
  email: string | null;
  source_month: string;
  source_snapshot_date: Date | null;
};

const CNAE_TAGS: Record<string, string[]> = {
  // Serviços de alimentação
  "5611201": ["restaurante"],
  "5611202": ["bar"],
  "5611203": ["lanchonete", "cafeteria"],
  "5612100": ["food_service"],
  "5620101": ["food_service", "cozinha_industrial"],
  "5620102": ["food_service", "buffet"],
  "5620103": ["food_service", "cantina"],
  "5620104": ["food_service", "marmitaria"],

  // Padarias / confeitarias
  "1091102": ["padaria", "confeitaria"],
  "4721101": ["padaria", "confeitaria"],
  "4721102": ["padaria", "confeitaria"],
  "4721103": ["laticinios", "frios"],
  "4721104": ["doceria", "confeitaria"],

  // Mercados e varejo alimentar
  "4711301": ["hipermercado", "supermercado", "mercado"],
  "4711302": ["supermercado", "mercado"],
  "4712100": ["minimercado", "mercado", "mercearia"],
  "4722901": ["acougue"],
  "4722902": ["peixaria"],
  "4723700": ["bebidas"],
  "4724500": ["hortifruti"],
  "4729699": ["alimentos", "conveniencia"],
};

const FOOD_CNAES = new Set(Object.keys(CNAE_TAGS));

function loadEnvironment() {
  const root = process.cwd();

  dotenv.config({
    path: path.join(root, ".env.local"),
    override: false,
  });

  dotenv.config({
    path: path.join(root, ".env"),
    override: false,
  });
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function digits(value: unknown) {
  return clean(value, 100).replace(/\D/g, "");
}

function normalizeSearch(value: unknown) {
  return clean(value, 300)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === ";" && !quoted) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current.replace(/\r$/, ""));
  return result;
}

function parseDateYYYYMMDD(raw: string) {
  const value = digits(raw);

  if (value.length !== 8) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function parseSnapshotDate(snapshot: string) {
  const match = snapshot.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );
}

function isProbableMobile(dddRaw: string, phoneRaw: string) {
  const ddd = digits(dddRaw);
  const phone = digits(phoneRaw);

  return ddd.length === 2 && phone.length === 9 && phone.startsWith("9");
}

type SelectedPhone = {
  display: string;
  digits: string;
  kind: "mobile" | "landline" | "unknown";
};

function formatAnyPhone(
  dddRaw: string,
  phoneRaw: string
): SelectedPhone | null {
  const ddd = digits(dddRaw);
  const phone = digits(phoneRaw);

  if (!phone) return null;

  const hasValidDdd = ddd.length === 2;
  const probableMobile = isProbableMobile(ddd, phone);
  const probableLandline =
    hasValidDdd &&
    phone.length === 8 &&
    /^[2-5]/.test(phone);

  let display = phone;

  if (hasValidDdd && phone.length === 9) {
    display = `(${ddd}) ${phone.slice(0, 5)}-${phone.slice(5)}`;
  } else if (hasValidDdd && phone.length === 8) {
    display = `(${ddd}) ${phone.slice(0, 4)}-${phone.slice(4)}`;
  } else if (hasValidDdd) {
    display = `(${ddd}) ${phone}`;
  }

  return {
    display,
    digits: hasValidDdd ? `55${ddd}${phone}` : phone,
    kind: probableMobile
      ? "mobile"
      : probableLandline
        ? "landline"
        : "unknown",
  };
}

function pickPhone(fields: string[]) {
  const first = formatAnyPhone(
    fields[21] || "",
    fields[22] || ""
  );
  if (first) return first;

  const second = formatAnyPhone(
    fields[23] || "",
    fields[24] || ""
  );
  if (second) return second;

  return null;
}

function allCnaes(main: string, secondaryRaw: string) {
  const secondary = clean(secondaryRaw, 2000)
    .split(",")
    .map((item) => digits(item))
    .filter(Boolean);

  return {
    main: digits(main),
    secondary,
    all: [digits(main), ...secondary].filter(Boolean),
  };
}

function classifySegments(
  cnaes: string[],
  tradeName: string
) {
  const tags = new Set<string>();

  for (const cnae of cnaes) {
    for (const tag of CNAE_TAGS[cnae] || []) {
      tags.add(tag);
    }
  }

  const name = normalizeSearch(tradeName);

  if (/\bpizz|pizza|pizzeria/.test(name)) tags.add("pizzaria");

  if (
    /\bhamburg|hamburger|burger|burguer/.test(name)
  ) {
    tags.add("hamburgueria");
  }

  if (/\bmarmit|quentinh/.test(name)) tags.add("marmitaria");

  if (
    /\bpadar|panific|confeit/.test(name)
  ) {
    tags.add("padaria");
  }

  if (/\bacougue|carnes\b|casa de carnes/.test(name)) {
    tags.add("acougue");
  }

  if (/\bpeix|pescad/.test(name)) tags.add("peixaria");

  if (
    /\bsupermerc|mercado|minimerc|mercearia/.test(name)
  ) {
    tags.add("mercado");
  }

  if (/\bcafe|cafeter|coffee/.test(name)) tags.add("cafeteria");

  if (/\bbuffet|bufe/.test(name)) tags.add("buffet");

  if (/\bbar\b|boteco|choperia/.test(name)) tags.add("bar");

  if (/\bconvenien/.test(name)) tags.add("conveniencia");

  return [...tags].sort();
}

function isFoodBusiness(cnaes: string[]) {
  return cnaes.some((cnae) => FOOD_CNAES.has(cnae));
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ZentraSalesAI-CNPJ-Importer/2.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ao acessar ${url}`
    );
  }

  return response.text();
}

async function discoverLatestSnapshot() {
  const html = await fetchText(ROOT_URL);

  const dates = [...html.matchAll(/href=["'](\d{4}-\d{2}-\d{2})\/?["']/gi)]
    .map((match) => match[1])
    .filter(Boolean)
    .sort();

  if (!dates.length) {
    throw new Error(
      "Não consegui descobrir a pasta mensal mais recente da base CNPJ."
    );
  }

  const snapshot = dates[dates.length - 1];
  const baseUrl = new URL(`${snapshot}/`, ROOT_URL).toString();

  return {
    snapshot,
    baseUrl,
  };
}

async function listFiles(baseUrl: string) {
  const html = await fetchText(baseUrl);

  const names = [
    ...html.matchAll(
      /href=["']([^"']+\.zip)["']/gi
    ),
  ].map((match) => decodeURIComponent(match[1]));

  return [...new Set(names)];
}

function numericSuffix(filename: string) {
  const match = filename.match(/(\d+)\.zip$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function downloadWithRetries(
  url: string,
  destination: string,
  maxAttempts = 3
) {
  if (fs.existsSync(destination)) {
    const stat = await fsp.stat(destination);
    if (stat.size > 1024) {
      console.log(`   ↪ arquivo já baixado: ${path.basename(destination)}`);
      return;
    }
  }

  const part = `${destination}.part`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fsp.rm(part, { force: true });

      const response = await fetch(url, {
        headers: {
          "User-Agent": "ZentraSalesAI-CNPJ-Importer/2.0",
        },
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const total = Number(
        response.headers.get("content-length") || 0
      );

      const file = fs.createWriteStream(part);
      const reader = response.body.getReader();

      let downloaded = 0;
      let lastPrint = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        await new Promise<void>((resolve, reject) => {
          file.write(Buffer.from(value), (error) =>
            error ? reject(error) : resolve()
          );
        });

        downloaded += value.byteLength;

        const now = Date.now();

        if (now - lastPrint >= 1500) {
          lastPrint = now;

          if (total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(
              `\r   ↓ ${pct}% (${(
                downloaded /
                1024 /
                1024
              ).toFixed(0)} MB)`
            );
          } else {
            process.stdout.write(
              `\r   ↓ ${(
                downloaded /
                1024 /
                1024
              ).toFixed(0)} MB`
            );
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        file.once("error", reject);
        file.end(() => resolve());
      });

      process.stdout.write("\n");
      await fsp.rename(part, destination);
      return;
    } catch (error) {
      console.error(
        `\n   ⚠ tentativa ${attempt}/${maxAttempts} falhou:`,
        error
      );

      if (attempt >= maxAttempts) throw error;

      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 3000)
      );
    }
  }
}

async function extractZip(zipPath: string, destination: string) {
  await fsp.rm(destination, {
    recursive: true,
    force: true,
  });

  await ensureDir(destination);

  const tar = spawnSync(
    "tar",
    ["-xf", zipPath, "-C", destination],
    {
      stdio: "inherit",
      shell: false,
    }
  );

  if (tar.status === 0) return;

  if (process.platform === "win32") {
    const escapedZip = zipPath.replace(/'/g, "''");
    const escapedDest = destination.replace(/'/g, "''");

    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
      ],
      {
        stdio: "inherit",
      }
    );

    if (ps.status === 0) return;
  }

  throw new Error(
    `Não consegui extrair ${path.basename(zipPath)}.`
  );
}

async function findDataFile(dir: string): Promise<string | null> {
  const entries = await fsp.readdir(dir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isFile()) return full;

    if (entry.isDirectory()) {
      const nested = await findDataFile(full);
      if (nested) return nested;
    }
  }

  return null;
}

async function loadSimpleMap(
  baseUrl: string,
  filename: string
) {
  const zipPath = path.join(CACHE_DIR, filename);
  const extractDir = path.join(
    CACHE_DIR,
    `_${filename.replace(/\.zip$/i, "")}`
  );

  console.log(`\nAuxiliar: ${filename}`);

  await downloadWithRetries(
    new URL(filename, baseUrl).toString(),
    zipPath
  );

  await extractZip(zipPath, extractDir);

  const dataFile = await findDataFile(extractDir);

  if (!dataFile) {
    throw new Error(
      `Arquivo de dados não encontrado em ${filename}.`
    );
  }

  const map = new Map<string, string>();
  const stream = fs.createReadStream(dataFile, {
    encoding: "latin1",
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    const fields = parseCsvLine(line);

    const code = clean(fields[0], 30);
    const description = clean(fields[1], 300);

    if (code && description) {
      map.set(code, description);
    }
  }

  await fsp.rm(extractDir, {
    recursive: true,
    force: true,
  });

  await fsp.rm(zipPath, { force: true });

  return map;
}

async function loadCheckpoint(
  baseUrl: string,
  snapshot: string
): Promise<Checkpoint> {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    return {
      baseUrl,
      snapshot,
      completedFiles: [],
      completedCompanyFiles: [],
      totalRead: 0,
      totalAccepted: 0,
      totalInserted: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  const parsed = JSON.parse(
    await fsp.readFile(CHECKPOINT_PATH, "utf8")
  ) as Checkpoint;

  if (
    parsed.baseUrl !== baseUrl &&
    parsed.completedFiles?.length
  ) {
    throw new Error(
      [
        "Foi encontrada uma versão mensal diferente da usada no checkpoint.",
        `Checkpoint: ${parsed.snapshot}`,
        `Disponível agora: ${snapshot}`,
        "",
        "Para atualizar a base para o novo mês, rode:",
        "npx.cmd tsx scripts\\importar-cnpj-prospeccao.ts --reconstruir",
      ].join("\n")
    );
  }

  return {
    ...parsed,
    baseUrl,
    snapshot,
    completedFiles: parsed.completedFiles || [],
    completedCompanyFiles: parsed.completedCompanyFiles || [],
  };
}

async function saveCheckpoint(checkpoint: Checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();

  await fsp.writeFile(
    CHECKPOINT_PATH,
    JSON.stringify(checkpoint, null, 2),
    "utf8"
  );
}

async function flushBatch(
  prisma: PrismaClient,
  batch: ProspectRow[]
) {
  if (!batch.length) return 0;

  const result = await prisma.cnpjProspectingCompany.createMany({
    data: batch,
    skipDuplicates: true,
  });

  batch.length = 0;
  return result.count;
}

async function processEstablishmentsFile(input: {
  prisma: PrismaClient;
  baseUrl: string;
  snapshot: string;
  filename: string;
  municipalities: Map<string, string>;
  cnaes: Map<string, string>;
  checkpoint: Checkpoint;
}) {
  const {
    prisma,
    baseUrl,
    snapshot,
    filename,
    municipalities,
    cnaes,
    checkpoint,
  } = input;

  const zipPath = path.join(CACHE_DIR, filename);
  const extractDir = path.join(
    CACHE_DIR,
    `_${filename.replace(/\.zip$/i, "")}`
  );

  console.log("\n" + "=".repeat(72));
  console.log(`PROCESSANDO ${filename}`);
  console.log("=".repeat(72));

  await downloadWithRetries(
    new URL(filename, baseUrl).toString(),
    zipPath
  );

  console.log("   Extraindo...");
  await extractZip(zipPath, extractDir);

  const dataFile = await findDataFile(extractDir);

  if (!dataFile) {
    throw new Error(
      `Não encontrei o CSV dentro de ${filename}.`
    );
  }

  const batch: ProspectRow[] = [];
  const batchSize = 500;

  let read = 0;
  let accepted = 0;
  let inserted = 0;

  const stats = {
    layoutOk: 0,
    sp: 0,
    active: 0,
    food: 0,
    foodWithAnyPhone: 0,
    probableMobile: 0,
    selectedPhone: 0,
    classified: 0,
    malformed: 0,
  };

  const stream = fs.createReadStream(dataFile, {
    encoding: "latin1",
    highWaterMark: 1024 * 1024,
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  const snapshotDate = parseSnapshotDate(snapshot);
  const sourceMonth = snapshot.slice(0, 7);

  for await (const line of rl) {
    read += 1;

    if (!line.trim()) continue;

    const fields = parseCsvLine(line);

    if (fields.length < 28) {
      stats.malformed += 1;
      continue;
    }

    stats.layoutOk += 1;

    // Layout oficial Estabelecimentos:
    //  4 nome fantasia
    //  5 situação cadastral
    // 11 CNAE principal
    // 12 CNAEs secundários
    // 17 bairro
    // 18 CEP
    // 19 UF
    // 20 município
    // 21/22 telefone 1
    // 23/24 telefone 2
    // 27 e-mail
    const uf = clean(fields[19], 2).toUpperCase();

    if (uf !== "SP") {
      continue;
    }

    stats.sp += 1;

    const status = digits(fields[5] || "");

    // A base normalmente traz "02". Aceitamos também "2"
    // para não perder registro por normalização da origem.
    if (status !== "02" && status !== "2") {
      continue;
    }

    stats.active += 1;

    const cnaeInfo = allCnaes(
      fields[11] || "",
      fields[12] || ""
    );

    if (!isFoodBusiness(cnaeInfo.all)) {
      continue;
    }

    stats.food += 1;

    const phone1 = digits(fields[22] || "");
    const phone2 = digits(fields[24] || "");

    if (!phone1 && !phone2) {
      continue;
    }

    stats.foodWithAnyPhone += 1;

    if (
      isProbableMobile(fields[21] || "", fields[22] || "") ||
      isProbableMobile(fields[23] || "", fields[24] || "")
    ) {
      stats.probableMobile += 1;
    }

    const selectedPhone = pickPhone(fields);

    if (!selectedPhone) {
      continue;
    }

    stats.selectedPhone += 1;

    const cnpjBase = clean(fields[0], 20).toUpperCase();
    const cnpjOrder = clean(fields[1], 12).toUpperCase();
    const cnpjDv = clean(fields[2], 6).toUpperCase();

    if (!cnpjBase || !cnpjOrder || !cnpjDv) {
      continue;
    }

    const cnpj = `${cnpjBase}${cnpjOrder}${cnpjDv}`;
    const tradeName = clean(fields[4], 180) || "";
    const cityCode = clean(fields[20], 20);
    const city =
      municipalities.get(cityCode) ||
      cityCode ||
      "Município não informado";

    const neighborhood = clean(fields[17], 180);
    const segmentTags = classifySegments(
      cnaeInfo.all,
      tradeName
    );

    if (!segmentTags.length) {
      continue;
    }

    stats.classified += 1;

    const row: ProspectRow = {
      cnpj,
      cnpj_basico: cnpjBase,
      cnpj_ordem: cnpjOrder,
      cnpj_dv: cnpjDv,
      trade_name: tradeName || null,
      cnae_main: cnaeInfo.main,
      cnae_secondary: cnaeInfo.secondary,
      cnae_description:
        cnaes.get(cnaeInfo.main) || null,
      segment_tags: segmentTags,
      status_code: "02",
      start_date: parseDateYYYYMMDD(fields[10] || ""),
      uf: "SP",
      city_code: cityCode,
      city,
      city_search: normalizeSearch(city),
      neighborhood: neighborhood || null,
      neighborhood_search: neighborhood
        ? normalizeSearch(neighborhood)
        : null,
      street_type: clean(fields[13], 80) || null,
      street: clean(fields[14], 250) || null,
      number: clean(fields[15], 80) || null,
      complement: clean(fields[16], 180) || null,
      postal_code: digits(fields[18] || "") || null,
      phone: selectedPhone.display,
      phone_digits: selectedPhone.digits,
      email:
        clean(fields[27], 180).toLowerCase() || null,
      source_month: sourceMonth,
      source_snapshot_date: snapshotDate,
    };

    batch.push(row);
    accepted += 1;

    if (batch.length >= batchSize) {
      inserted += await flushBatch(prisma, batch);
    }

    if (read % 100000 === 0) {
      process.stdout.write(
        `\r   Lidos: ${read.toLocaleString("pt-BR")} | ` +
          `SP: ${stats.sp.toLocaleString("pt-BR")} | ` +
          `ativas: ${stats.active.toLocaleString("pt-BR")} | ` +
          `alimentação: ${stats.food.toLocaleString("pt-BR")} | ` +
          `com telefone: ${stats.selectedPhone.toLocaleString("pt-BR")} | ` +
          `novos: ${inserted.toLocaleString("pt-BR")}`
      );
    }

    // Modo diagnóstico é só para entender o funil sem varrer o arquivo inteiro.
    if (DIAGNOSTIC_MODE && read >= 500000) {
      console.log(
        "\n\n🔬 Diagnóstico limitado às primeiras 500.000 linhas."
      );
      break;
    }
  }

  inserted += await flushBatch(prisma, batch);

  process.stdout.write("\n");

  console.log("\nFUNIL DO FILTRO");
  console.log("-".repeat(72));
  console.log(`Linhas lidas:                  ${read.toLocaleString("pt-BR")}`);
  console.log(`Layout válido:                 ${stats.layoutOk.toLocaleString("pt-BR")}`);
  console.log(`UF = SP:                       ${stats.sp.toLocaleString("pt-BR")}`);
  console.log(`SP + situação ativa:           ${stats.active.toLocaleString("pt-BR")}`);
  console.log(`SP + ativa + alimentação:      ${stats.food.toLocaleString("pt-BR")}`);
  console.log(`Alimentação com algum telefone:${stats.foodWithAnyPhone.toLocaleString("pt-BR")}`);
  console.log(`Com celular provável (info):   ${stats.probableMobile.toLocaleString("pt-BR")}`);
  console.log(`Com telefone selecionado:      ${stats.selectedPhone.toLocaleString("pt-BR")}`);
  console.log(`Classificados pelo Zentra:     ${stats.classified.toLocaleString("pt-BR")}`);
  console.log(`Linhas malformadas:            ${stats.malformed.toLocaleString("pt-BR")}`);

  // No diagnóstico não marcamos o arquivo como concluído.
  if (DIAGNOSTIC_MODE) {
    console.log(
      "\n🔬 Diagnóstico concluído. O arquivo NÃO foi marcado como processado."
    );
    return;
  }

  // Zero aprovados em milhões de linhas não deve ser silenciosamente aceito.
  // Mantemos cache/checkpoint para investigar sem esconder o problema.
  if (accepted === 0) {
    throw new Error(
      [
        `${filename} terminou com ZERO registros aprovados.`,
        "Isso indica filtro/layout incompatível e não uma base vazia.",
        "",
        "Veja o FUNIL DO FILTRO acima para identificar em qual etapa zerou.",
        "O arquivo não foi marcado como concluído.",
      ].join("\n")
    );
  }

  checkpoint.totalRead += read;
  checkpoint.totalAccepted += accepted;
  checkpoint.totalInserted += inserted;

  if (!checkpoint.completedFiles.includes(filename)) {
    checkpoint.completedFiles.push(filename);
  }

  await saveCheckpoint(checkpoint);

  console.log(
    `\n   ✅ ${filename}: ` +
      `${read.toLocaleString("pt-BR")} lidos | ` +
      `${accepted.toLocaleString("pt-BR")} aprovados | ` +
      `${inserted.toLocaleString("pt-BR")} novos`
  );

  await fsp.rm(extractDir, {
    recursive: true,
    force: true,
  });

  await fsp.rm(zipPath, { force: true });
}

type CompanyEnrichment = {
  cnpj_basico: string;
  legal_name: string;
  company_size_code: string | null;
  capital_social: number | null;
};

function parseBrazilianDecimal(value: string) {
  const raw = clean(value, 80)
    .replace(/\./g, "")
    .replace(",", ".");

  if (!raw) return null;

  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

async function flushCompanyEnrichment(
  prisma: PrismaClient,
  batch: CompanyEnrichment[]
) {
  if (!batch.length) return;

  const tuples = batch.map((row) =>
    Prisma.sql`(
      CAST(${row.cnpj_basico} AS text),
      CAST(${row.legal_name} AS text),
      CAST(${row.company_size_code} AS text),
      CAST(${row.capital_social} AS numeric)
    )`
  );

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "cnpj_prospecting_companies" AS c
      SET
        "legal_name" = v.legal_name,
        "company_size_code" = v.company_size_code,
        "capital_social" = v.capital_social,
        "updated_at" = now()
      FROM (
        VALUES ${Prisma.join(tuples)}
      ) AS v(
        cnpj_basico,
        legal_name,
        company_size_code,
        capital_social
      )
      WHERE c."cnpj_basico" = v.cnpj_basico
    `
  );

  batch.length = 0;
}

async function loadTargetBases(prisma: PrismaClient) {
  console.log(
    "\nCarregando CNPJs-base filtrados para enriquecer razão social/porte..."
  );

  const rows = await prisma.cnpjProspectingCompany.findMany({
    select: {
      cnpj_basico: true,
    },
    distinct: ["cnpj_basico"],
  });

  const set = new Set(
    rows.map((row) => row.cnpj_basico)
  );

  console.log(
    `   Bases alvo: ${set.size.toLocaleString("pt-BR")}`
  );

  return set;
}

async function processCompaniesFile(input: {
  prisma: PrismaClient;
  baseUrl: string;
  filename: string;
  targetBases: Set<string>;
  checkpoint: Checkpoint;
}) {
  const {
    prisma,
    baseUrl,
    filename,
    targetBases,
    checkpoint,
  } = input;

  const zipPath = path.join(CACHE_DIR, filename);
  const extractDir = path.join(
    CACHE_DIR,
    `_${filename.replace(/\.zip$/i, "")}`
  );

  console.log("\n" + "=".repeat(72));
  console.log(`ENRIQUECENDO ${filename}`);
  console.log("=".repeat(72));

  await downloadWithRetries(
    new URL(filename, baseUrl).toString(),
    zipPath
  );

  console.log("   Extraindo...");
  await extractZip(zipPath, extractDir);

  const dataFile = await findDataFile(extractDir);

  if (!dataFile) {
    throw new Error(
      `Não encontrei o CSV dentro de ${filename}.`
    );
  }

  const batch: CompanyEnrichment[] = [];
  const batchSize = 400;

  let read = 0;
  let matched = 0;

  const stream = fs.createReadStream(dataFile, {
    encoding: "latin1",
    highWaterMark: 1024 * 1024,
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    read += 1;

    if (!line.trim()) continue;

    const fields = parseCsvLine(line);

    // Layout Empresas:
    // 0 CNPJ básico
    // 1 razão social
    // 4 capital social
    // 5 porte
    const cnpjBase = clean(fields[0], 20).toUpperCase();

    if (!targetBases.has(cnpjBase)) {
      continue;
    }

    const legalName = clean(fields[1], 250);

    if (!legalName) continue;

    batch.push({
      cnpj_basico: cnpjBase,
      legal_name: legalName,
      company_size_code: clean(fields[5], 20) || null,
      capital_social: parseBrazilianDecimal(fields[4] || ""),
    });

    matched += 1;

    if (batch.length >= batchSize) {
      await flushCompanyEnrichment(prisma, batch);
    }

    if (read % 200000 === 0) {
      process.stdout.write(
        `\r   Lidos: ${read.toLocaleString("pt-BR")} | ` +
          `correspondentes: ${matched.toLocaleString("pt-BR")}`
      );
    }
  }

  await flushCompanyEnrichment(prisma, batch);
  process.stdout.write("\n");

  if (!checkpoint.completedCompanyFiles.includes(filename)) {
    checkpoint.completedCompanyFiles.push(filename);
  }

  await saveCheckpoint(checkpoint);

  console.log(
    `   ✅ ${filename}: ${matched.toLocaleString("pt-BR")} empresas enriquecidas`
  );

  await fsp.rm(extractDir, {
    recursive: true,
    force: true,
  });

  await fsp.rm(zipPath, { force: true });
}

async function main() {
  loadEnvironment();
  await ensureDir(CACHE_DIR);

  // Para importação local, priorizamos uma URL própria / pooler.
  // A conexão direta db.<projeto>.supabase.co:5432 pode exigir IPv6.
  const dbUrl =
    process.env.CNPJ_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL;

  const dbSource = process.env.CNPJ_DATABASE_URL
    ? "CNPJ_DATABASE_URL"
    : process.env.DATABASE_URL
      ? "DATABASE_URL"
      : "DIRECT_URL";

  if (!dbUrl) {
    throw new Error(
      "CNPJ_DATABASE_URL/DATABASE_URL/DIRECT_URL não encontrado no .env.local."
    );
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

  try {
    console.log("\nZENTRA SALES AI — BASE CNPJ DE PROSPECÇÃO");
    console.log("-".repeat(72));
    console.log(`Conexão de banco selecionada: ${dbSource}`);

    // Testa o banco ANTES de baixar centenas de MB.
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("Banco de dados: ✅ conexão OK");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      throw new Error(
        [
          "Não consegui conectar ao PostgreSQL antes de iniciar a importação.",
          "",
          `Variável usada: ${dbSource}`,
          "",
          "Se a URL apontar para db.<projeto>.supabase.co:5432,",
          "use no .env.local uma CNPJ_DATABASE_URL com o",
          "Supabase Session Pooler (porta 5432), copiada em:",
          "Supabase → Connect → Session pooler.",
          "",
          `Erro original: ${message}`,
        ].join("\n")
      );
    }
    console.log("-".repeat(72));
    console.log("Filtro: SP + ATIVAS + ALIMENTAÇÃO + QUALQUER TELEFONE");
    console.log("Fonte: Dados Abertos do CNPJ/Receita (espelho público)");
    console.log("-".repeat(72));

    const { snapshot, baseUrl } =
      await discoverLatestSnapshot();

    console.log(`\nSnapshot encontrado: ${snapshot}`);
    console.log(`Fonte: ${baseUrl}`);

    if (REBUILD_MODE) {
      console.log(
        "\n⚠ --reconstruir: limpando somente a BASE-FONTE CNPJ."
      );
      console.log(
        "Os leads/prospects comerciais dos vendedores NÃO serão apagados."
      );

      await prisma.cnpjProspectingCompany.deleteMany({});
      await fsp.rm(CHECKPOINT_PATH, { force: true });
    }

    const checkpoint = await loadCheckpoint(
      baseUrl,
      snapshot
    );

    const files = await listFiles(baseUrl);

    if (!files.includes("Cnaes.zip")) {
      throw new Error("Cnaes.zip não encontrado.");
    }

    if (!files.includes("Municipios.zip")) {
      throw new Error("Municipios.zip não encontrado.");
    }

    const establishmentFiles = files
      .filter((name) =>
        /^Estabelecimentos\d+\.zip$/i.test(name)
      )
      .sort(
        (a, b) =>
          numericSuffix(a) - numericSuffix(b)
      );

    if (!establishmentFiles.length) {
      throw new Error(
        "Nenhum Estabelecimentos*.zip encontrado."
      );
    }

    const companyFiles = files
      .filter((name) =>
        /^Empresas\d+\.zip$/i.test(name)
      )
      .sort(
        (a, b) =>
          numericSuffix(a) - numericSuffix(b)
      );

    const cnaes = await loadSimpleMap(
      baseUrl,
      "Cnaes.zip"
    );

    const municipalities = await loadSimpleMap(
      baseUrl,
      "Municipios.zip"
    );

    console.log(
      `\nCNAEs carregados: ${cnaes.size.toLocaleString("pt-BR")}`
    );
    console.log(
      `Municípios carregados: ${municipalities.size.toLocaleString("pt-BR")}`
    );

    let queue = establishmentFiles;

    if (TEST_MODE) {
      const preferred =
        establishmentFiles.find(
          (name) =>
            name.toLowerCase() ===
            "estabelecimentos1.zip"
        ) || establishmentFiles[0];

      queue = [preferred];

      console.log(
        `\n🧪 MODO TESTE: será processado somente ${preferred}.`
      );
    }

    for (const filename of queue) {
      if (
        checkpoint.completedFiles.includes(filename) &&
        !TEST_MODE &&
        !DIAGNOSTIC_MODE
      ) {
        console.log(
          `\n↪ ${filename} já concluído. Pulando.`
        );
        continue;
      }

      if (
        checkpoint.completedFiles.includes(filename) &&
        (TEST_MODE || DIAGNOSTIC_MODE)
      ) {
        console.log(
          `\n↻ ${filename} já estava no checkpoint, mas será reprocessado em modo de teste/diagnóstico.`
        );
      }

      await processEstablishmentsFile({
        prisma,
        baseUrl,
        snapshot,
        filename,
        municipalities,
        cnaes,
        checkpoint,
      });
    }

    if (ENRICH_COMPANIES) {
      if (!companyFiles.length) {
        throw new Error("Nenhum Empresas*.zip encontrado.");
      }

      const targetBases = await loadTargetBases(prisma);

      for (const filename of companyFiles) {
        if (
          checkpoint.completedCompanyFiles.includes(filename)
        ) {
          console.log(
            `\n↪ ${filename} já enriquecido. Pulando.`
          );
          continue;
        }

        await processCompaniesFile({
          prisma,
          baseUrl,
          filename,
          targetBases,
          checkpoint,
        });
      }
    }

    const total = await prisma.cnpjProspectingCompany.count();

    console.log("\n" + "=".repeat(72));
    console.log("IMPORTAÇÃO CONCLUÍDA");
    console.log("=".repeat(72));
    console.log(`Snapshot: ${snapshot}`);
    console.log(
      `Empresas disponíveis na base: ${total.toLocaleString("pt-BR")}`
    );
    console.log(
      `Linhas lidas nesta base/checkpoint: ${checkpoint.totalRead.toLocaleString(
        "pt-BR"
      )}`
    );
    console.log(
      `Empresas que passaram no filtro: ${checkpoint.totalAccepted.toLocaleString(
        "pt-BR"
      )}`
    );
    console.log(
      `Novos registros inseridos: ${checkpoint.totalInserted.toLocaleString(
        "pt-BR"
      )}`
    );

    if (TEST_MODE) {
      const cityGroups =
        await prisma.cnpjProspectingCompany.groupBy({
          by: ["city"],
          _count: {
            _all: true,
          },
        });

      const topCities = cityGroups
        .sort(
          (a, b) =>
            b._count._all - a._count._all
        )
        .slice(0, 10);

      if (topCities.length) {
        console.log("\nCidades com mais registros neste teste:");
        for (const item of topCities) {
          console.log(
            `  - ${item.city}: ${item._count._all.toLocaleString(
              "pt-BR"
            )}`
          );
        }
      }

      console.log(
        "\nTeste concluído. Antes da carga completa, confira os números acima."
      );
      console.log(
        "Para continuar com os demais arquivos:"
      );
      console.log(
        "npx.cmd tsx scripts\\importar-cnpj-prospeccao.ts"
      );
      console.log(
        "\nDepois, para enriquecer razão social/porte/capital:"
      );
      console.log(
        "npx.cmd tsx scripts\\importar-cnpj-prospeccao.ts --com-empresas"
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\n❌ IMPORTAÇÃO INTERROMPIDA");
  console.error(
    error instanceof Error ? error.message : error
  );
  console.error(
    "\nO checkpoint foi preservado. Corrija o problema e rode o comando novamente."
  );
  process.exitCode = 1;
});
