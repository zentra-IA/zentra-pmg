import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET_NAME = "products";

const MIME_BY_EXTENSION: Record<string, string> = {
  // Imagens
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",

  // Áudios
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",

  // Vídeos
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",

  // Documentos
  pdf: "application/pdf",
};

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function detectMediaType(
  mimeType: string,
  extension: string
): "image" | "audio" | "video" | "pdf" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)
  ) {
    return "image";
  }

  if (
    ["mp3", "ogg", "oga", "wav", "m4a", "aac"].includes(extension)
  ) {
    return "audio";
  }

  if (
    ["mp4", "mov", "webm", "m4v"].includes(extension)
  ) {
    return "video";
  }

  return "file";
}

function getMaxFileSize(mediaType: string): number {
  const MB = 1024 * 1024;

  const limits: Record<string, number> = {
    image: 10 * MB,
    audio: 25 * MB,
    video: 50 * MB,
    pdf: 25 * MB,
    file: 15 * MB,
  };

  return limits[mediaType] || limits.file;
}

function sanitizeFolder(value: FormDataEntryValue | null): string {
  const folder = String(value || "uploads")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);

  return folder || "uploads";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const formData = await request.formData();

    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum arquivo foi enviado.",
        },
        { status: 400 }
      );
    }

    const file = fileEntry;
    const extension = getExtension(file.name);

    if (!extension || !MIME_BY_EXTENSION[extension]) {
      return NextResponse.json(
        {
          success: false,
          error: `Formato não permitido: ${extension || "desconhecido"}.`,
        },
        { status: 400 }
      );
    }

    const mimeType =
      file.type && file.type !== "application/octet-stream"
        ? file.type
        : MIME_BY_EXTENSION[extension];

    const mediaType = detectMediaType(mimeType, extension);
    const maxFileSize = getMaxFileSize(mediaType);

    if (file.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "O arquivo está vazio.",
        },
        { status: 400 }
      );
    }

    if (file.size > maxFileSize) {
      return NextResponse.json(
        {
          success: false,
          error: `Arquivo muito grande. Limite para ${mediaType}: ${
            maxFileSize / 1024 / 1024
          } MB.`,
        },
        { status: 413 }
      );
    }

    const folder = sanitizeFolder(formData.get("folder"));

    const generatedName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const filePath = `${folder}/${mediaType}/${generatedName}`;

    console.log("UPLOAD_INICIADO", {
      originalName: file.name,
      size: file.size,
      browserMimeType: file.type,
      detectedMimeType: mimeType,
      mediaType,
      filePath,
      bucket: BUCKET_NAME,
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadError } =
      await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType: mimeType,
          cacheControl: "3600",
          upsert: false,
        });

    if (uploadError) {
      console.error("ERRO_SUPABASE_UPLOAD", uploadError);

      return NextResponse.json(
        {
          success: false,
          error: "O Supabase recusou o upload.",
          details: uploadError.message,
          bucket: BUCKET_NAME,
          path: filePath,
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uploadData.path);

    const publicUrl = publicUrlData.publicUrl;

    console.log("UPLOAD_CONCLUIDO", {
      originalName: file.name,
      path: uploadData.path,
      publicUrl,
      mediaType,
    });

    return NextResponse.json(
      {
        success: true,

        url: publicUrl,
        fileUrl: publicUrl,
        mediaUrl: publicUrl,
        imageUrl: mediaType === "image" ? publicUrl : null,

        mediaType,
        mimeType,

        path: uploadData.path,
        name: file.name,
        storedName: generatedName,
        size: file.size,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro desconhecido durante o upload.";

    console.error("ERRO_GERAL_UPLOAD", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro ao fazer upload do arquivo.",
        details: message,
      },
      { status: 500 }
    );
  }
}