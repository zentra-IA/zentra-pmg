import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const PORTAL_CHAT_BUCKET = "whatsapp-media";
export const PORTAL_CHAT_MAX_MEDIA_BYTES = 100 * 1024 * 1024;

export type PortalMediaKind =
  | "image"
  | "video"
  | "audio"
  | "document";

export function portalChatClean(value: unknown) {
  return String(value ?? "").trim();
}

export function portalTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getPortalChatAccess(token: string) {
  const cleanToken = portalChatClean(token);

  if (!cleanToken || cleanToken.length < 32) {
    return null;
  }

  return prisma.webPromotionAccess.findFirst({
    where: {
      token_hash: portalTokenHash(cleanToken),
      token_value: cleanToken,
      active: true,
    },
    select: {
      id: true,
      company_id: true,
      customer_id: true,
      seller_id: true,
      customer: {
        select: {
          id: true,
          legal_name: true,
          trade_name: true,
          whatsapp: true,
          phone: true,
        },
      },
    },
  });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeBase64(value: unknown) {
  let base64 = portalChatClean(value);

  if (!base64) return "";

  if (base64.startsWith("data:")) {
    const comma = base64.indexOf(",");
    if (comma >= 0) base64 = base64.slice(comma + 1);
  }

  return base64;
}

export function normalizePortalMediaKind(
  value: unknown,
  mimeType?: unknown
): PortalMediaKind | null {
  const raw = portalChatClean(value).toLowerCase();
  const mime = portalChatClean(mimeType).toLowerCase();

  if (raw.includes("image") || mime.startsWith("image/")) {
    return "image";
  }

  if (raw.includes("video") || mime.startsWith("video/")) {
    return "video";
  }

  if (
    raw.includes("audio") ||
    raw.includes("ptt") ||
    mime.startsWith("audio/")
  ) {
    return "audio";
  }

  if (
    raw.includes("document") ||
    raw.includes("file") ||
    Boolean(mime)
  ) {
    return "document";
  }

  return null;
}

function safeFileName(value: unknown) {
  return portalChatClean(value)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function extensionFromMime(
  mimeType: string,
  kind: PortalMediaKind
) {
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "xlsx",
    "text/plain": "txt",
  };

  if (known[mimeType]) return known[mimeType];

  const subtype = mimeType.split("/")[1]?.split(";")[0]?.trim();
  if (subtype) return subtype.replace("jpeg", "jpg");

  if (kind === "image") return "jpg";
  if (kind === "video") return "mp4";
  if (kind === "audio") return "webm";
  return "bin";
}

export async function uploadPortalChatMedia(options: {
  companyId: string;
  sellerId: string;
  customerId: string;
  base64: unknown;
  mediaType: unknown;
  mimeType: unknown;
  fileName: unknown;
}) {
  const base64 = normalizeBase64(options.base64);

  if (!base64) {
    return {
      mediaUrl: null,
      mediaType: null,
      mimeType: null,
      fileName: null,
      fileSize: null,
    };
  }

  const mimeType =
    portalChatClean(options.mimeType) ||
    "application/octet-stream";

  const mediaType = normalizePortalMediaKind(
    options.mediaType,
    mimeType
  );

  if (!mediaType) {
    throw new Error("Tipo de mídia inválido.");
  }

  const bytes = Buffer.from(base64, "base64");

  if (!bytes.length) {
    throw new Error("Arquivo de mídia vazio.");
  }

  if (bytes.length > PORTAL_CHAT_MAX_MEDIA_BYTES) {
    throw new Error("O arquivo excede o limite de 100 MB.");
  }

  const originalName = safeFileName(options.fileName);
  const extension = extensionFromMime(mimeType, mediaType);

  const finalName = originalName
    ? `${crypto.randomUUID()}-${originalName}`
    : `${crypto.randomUUID()}.${extension}`;

  const path = [
    "portal-chat",
    options.companyId,
    options.sellerId,
    options.customerId,
    new Date().toISOString().slice(0, 10),
    finalName,
  ].join("/");

  const supabase = getSupabase();

  const { error } = await supabase.storage
    .from(PORTAL_CHAT_BUCKET)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Erro ao salvar mídia: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(PORTAL_CHAT_BUCKET)
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error("Não foi possível gerar a URL da mídia.");
  }

  return {
    mediaUrl: data.publicUrl,
    mediaType,
    mimeType,
    fileName: originalName || finalName,
    fileSize: bytes.length,
  };
}

export function portalMessageLabel(
  type: string | null | undefined,
  fileName?: string | null
) {
  if (type === "image") return "📷 Imagem";
  if (type === "video") return "🎥 Vídeo";
  if (type === "audio") return "🎙 Áudio";
  if (type === "document") {
    return fileName ? `📎 ${fileName}` : "📎 Documento";
  }
  return "Mensagem";
}
