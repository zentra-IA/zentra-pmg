import { parseRadarExcelFile } from "../lib/radar/excel-parser";

const filePath = process.argv[2];

if (!filePath) {
  console.error(
    [
      "Informe o caminho da planilha.",
      "",
      "Exemplo:",
      'npx tsx scripts/test-radar-excel.ts "C:\\Users\\grego\\Downloads\\clientes.xlsx"',
    ].join("\n")
  );

  process.exit(1);
}

try {
  const result = parseRadarExcelFile(filePath);

  console.log("\n=== PLANILHA ===");
  console.log("Arquivo:", result.fileName);
  console.log("Aba:", result.sheetName);

  console.log("\n=== CABEÇALHOS ===");
  console.log(
    "Detectados:",
    result.headerValidation.detectedHeaders
  );

  console.log(
    "Obrigatórios ausentes:",
    result.headerValidation.missingRequired
  );

  console.log(
    "Opcionais ausentes:",
    result.headerValidation.missingOptional
  );

  console.log("\n=== RESUMO ===");
  console.table(result.summary);

  const invalidRows = result.rows
    .filter(
      (row) =>
        row.validationStatus !== "valid"
    )
    .slice(0, 20);

  if (invalidRows.length > 0) {
    console.log(
      "\n=== PRIMEIROS REGISTROS COM PROBLEMA ==="
    );

    console.table(
      invalidRows.map((row) => ({
        rowNumber: row.rowNumber,
        externalCustomerId:
          row.externalCustomerId,
        name: row.name,
        status: row.validationStatus,
        errors: row.validationErrors.join(" | "),
      }))
    );
  } else {
    console.log(
      "\nNenhum registro inválido ou duplicado."
    );
  }

  console.log(
    "\nTeste concluído sem gravar dados no banco."
  );
} catch (error) {
  console.error("\nFalha ao processar a planilha:");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
}