import { getSupabaseAdmin } from "@/lib/supabase-admin";

const RADAR_BUCKET = "radar-imports";

function sanitizeFileName(fileName: string): string {
  const extension = fileName.toLowerCase().endsWith(".xls")
    ? ".xls"
    : ".xlsx";

  const baseName = fileName
    .replace(/\.(xlsx|xls)$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return `${baseName || "clientes-inativos"}${extension}`;
}

export function buildRadarStoragePath(params: {
  companyId: string;
  snapshotId: string;
  fileName: string;
}): string {
  const safeFileName = sanitizeFileName(params.fileName);

  return [
    params.companyId,
    params.snapshotId,
    safeFileName,
  ].join("/");
}

export async function uploadRadarFile(params: {
  storagePath: string;
  file: File;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const buffer = Buffer.from(
    await params.file.arrayBuffer()
  );

  const { error } = await supabase.storage
    .from(RADAR_BUCKET)
    .upload(params.storagePath, buffer, {
      contentType:
        params.file.type ||
        "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Falha ao salvar a planilha: ${error.message}`
    );
  }
}

export async function removeRadarFile(
  storagePath: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(RADAR_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error(
      "[Radar Storage] Falha ao remover arquivo:",
      error.message
    );
  }
}