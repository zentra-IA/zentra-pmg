import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/server-company";
import { buildWhatsappSessionKey } from "@/lib/whatsapp-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER ||
  process.env.WHATSAPP_SERVER ||
  "http://localhost:3013";

const DEFAULT_SESSION = Number(
  process.env.CRM_DEFAULT_WHATSAPP_SESSION ||
    process.env.RH_REMINDER_SESSION ||
    1
);

const MEDIA_BUCKET = "whatsapp-media";
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

type MediaKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | null;

type NormalizedMedia = {
  kind: MediaKind;
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
  publicUrl: string | null;
  base64: string | null;
};

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

function clean(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function onlyDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function normalizePhone(value: unknown) {
  let digits = onlyDigits(value);

  if (!digits) return "";

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return digits;
}

function normalizeLid(value: unknown) {
  const text = clean(value);

  if (!text) return null;

  if (
    text.includes("@lid") ||
    text.includes("@s.whatsapp.net")
  ) {
    return text;
  }

  return null;
}

function normalizeSessionNumber(value: unknown) {
  const parsed = Number(value || DEFAULT_SESSION || 1);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return 1;
  }

  return parsed;
}

function buildSession(
  companyId: string,
  userId: string,
  lead: any,
  requestedSession?: unknown
) {
  const sessionId = normalizeSessionNumber(
    requestedSession ?? lead?.session_id
  );

  return {
    sessionId,
    fullSessionId: buildWhatsappSessionKey({
      companyId,
      userId,
      sessionId,
    }),
  };
}

function getDestination(lead: any, fallbackPhone?: unknown) {
  const phone = normalizePhone(
    lead?.phone ||
      lead?.mobile ||
      lead?.telefone ||
      fallbackPhone ||
      ""
  );

  if (phone) {
    return {
      number: phone,
      phone,
      lid: null,
      jid: `${phone}@s.whatsapp.net`,
      isLid: false,
    };
  }

  const lid = normalizeLid(
    lead?.whatsapp_lid || lead?.remote_jid
  );

  if (lid && lid.includes("@lid")) {
    return {
      number: "",
      phone: "",
      lid,
      jid: lid,
      isLid: true,
    };
  }

  return {
    number: "",
    phone: "",
    lid: null,
    jid: null,
    isLid: false,
  };
}

function normalizeMediaKind(
  value: unknown,
  mimeType?: string | null
): MediaKind {
  const raw = clean(value).toLowerCase();
  const mime = clean(mimeType).toLowerCase();

  if (
    raw.includes("image") ||
    mime.startsWith("image/")
  ) {
    return "image";
  }

  if (
    raw.includes("video") ||
    mime.startsWith("video/")
  ) {
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
    mime === "application/pdf" ||
    Boolean(mime)
  ) {
    return "document";
  }

  return null;
}

function normalizeBase64(value: unknown) {
  let base64 = clean(value);

  if (!base64) return null;

  if (base64.startsWith("data:")) {
    const comma = base64.indexOf(",");

    if (comma >= 0) {
      base64 = base64.slice(comma + 1);
    }
  }

  return base64 || null;
}

function extractMedia(body: any): NormalizedMedia {
  const mimeType =
    clean(
      body?.mimeType ||
        body?.mimetype ||
        body?.mime_type ||
        body?.file?.type ||
        ""
    ) || null;

  const kind = normalizeMediaKind(
    body?.mediaType ||
      body?.media_type ||
      body?.type ||
      body?.file?.kind,
    mimeType
  );

  const publicUrl =
    clean(
      body?.mediaUrl ||
        body?.media_url ||
        body?.fileUrl ||
        body?.file_url ||
        body?.url ||
        body?.file?.url ||
        ""
    ) || null;

  const fileName =
    clean(
      body?.fileName ||
        body?.filename ||
        body?.file_name ||
        body?.file?.name ||
        ""
    ) || null;

  const caption =
    clean(
      body?.caption ||
        body?.mediaCaption ||
        body?.media_caption ||
        ""
    ) || null;

  const base64 = normalizeBase64(
    body?.base64 ||
      body?.mediaBase64 ||
      body?.media_base64 ||
      body?.fileBase64 ||
      body?.file_base64 ||
      body?.file?.base64
  );

  return {
    kind,
    mimeType,
    fileName,
    caption,
    publicUrl,
    base64,
  };
}

function extensionFromMime(
  mimeType?: string | null,
  kind?: MediaKind
) {
  const mime = clean(mimeType).toLowerCase();

  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
  };

  if (known[mime]) return known[mime];

  const subtype = mime
    .split("/")[1]
    ?.split(";")[0]
    ?.trim();

  if (subtype) {
    return subtype.replace("jpeg", "jpg");
  }

  if (kind === "image") return "jpg";
  if (kind === "video") return "mp4";
  if (kind === "audio") return "ogg";

  return "bin";
}

function mediaLabel(kind: MediaKind, fileName?: string | null) {
  if (kind === "image") return "📷 Imagem";
  if (kind === "video") return "🎥 Vídeo";
  if (kind === "audio") return "🎧 Áudio";

  if (kind === "document") {
    return fileName ? `📎 ${fileName}` : "📎 Documento";
  }

  return "Mensagem";
}

async function uploadMedia({
  supabase,
  companyId,
  userId,
  leadId,
  media,
}: {
  supabase: ReturnType<typeof getSupabase>;
  companyId: string;
  userId: string;
  leadId: string;
  media: NormalizedMedia;
}) {
  if (media.publicUrl) {
    return media.publicUrl;
  }

  if (!media.base64) {
    return null;
  }

  const bytes = Buffer.from(media.base64, "base64");

  if (!bytes.length) {
    throw new Error("Arquivo de mídia vazio.");
  }

  if (bytes.length > MAX_MEDIA_BYTES) {
    throw new Error(
      "O arquivo excede o limite de 100 MB."
    );
  }

  const extension = extensionFromMime(
    media.mimeType,
    media.kind
  );

  const safeOriginalName = clean(media.fileName)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);

  const finalName = safeOriginalName
    ? `${crypto.randomUUID()}-${safeOriginalName}`
    : `${crypto.randomUUID()}.${extension}`;

  const objectPath = [
    companyId,
    userId,
    leadId,
    new Date().toISOString().slice(0, 10),
    finalName,
  ].join("/");

  const { error: uploadError } =
    await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(objectPath, bytes, {
        contentType:
          media.mimeType ||
          "application/octet-stream",
        upsert: false,
      });

  if (uploadError) {
    throw new Error(
      `Erro ao salvar mídia: ${uploadError.message}`
    );
  }

  const { data } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(objectPath);

  if (!data?.publicUrl) {
    throw new Error(
      "Não foi possível gerar a URL pública da mídia."
    );
  }

  return data.publicUrl;
}

async function parseWhatsappResponse(
  response: Response
) {
  const raw = await response.text();

  let data: any = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {
      raw,
    };
  }

  if (
    !response.ok ||
    data?.success === false
  ) {
    throw new Error(
      data?.error ||
        data?.message ||
        `Erro HTTP ${response.status} no servidor WhatsApp.`
    );
  }

  return data;
}

async function postWhatsapp(
  endpoint: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(
    `${WHATSAPP_SERVER}${endpoint}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  return parseWhatsappResponse(response);
}

async function sendToWhatsapp({
  fullSessionId,
  destination,
  message,
  media,
  mediaUrl,
}: {
  fullSessionId: string;
  destination: ReturnType<typeof getDestination>;
  message: string;
  media: NormalizedMedia;
  mediaUrl: string | null;
}) {
  const commonPayload = {
    sessionId: fullSessionId,
    ...destination,
  };

  if (!media.kind) {
    return postWhatsapp("/send", {
      ...commonPayload,
      message,
    });
  }

  if (!mediaUrl) {
    throw new Error(
      "URL da mídia não foi gerada."
    );
  }

  if (media.kind === "audio") {
    return postWhatsapp("/send-audio", {
      ...commonPayload,
      audio: mediaUrl,
      audioUrl: mediaUrl,
      mediaUrl,
      url: mediaUrl,
      mimetype:
        media.mimeType || "audio/ogg",
      fileName: media.fileName || null,
    });
  }

  return postWhatsapp("/send-media", {
    ...commonPayload,
    media: mediaUrl,
    mediaUrl,
    url: mediaUrl,
    type: media.kind,
    mediaType: media.kind,
    mimetype:
      media.mimeType ||
      "application/octet-stream",
    fileName: media.fileName || null,
    caption:
      media.caption ||
      message ||
      "",
    message:
      media.caption ||
      message ||
      "",
  });
}

async function saveSentMessage({
  supabase,
  companyId,
  branchId,
  userId,
  leadId,
  message,
  media,
  mediaUrl,
  sessionNumber,
  fullSessionId,
  whatsappResult,
}: {
  supabase: ReturnType<typeof getSupabase>;
  companyId: string;
  branchId?: string | null;
  userId: string;
  leadId: string;
  message: string;
  media: NormalizedMedia;
  mediaUrl: string | null;
  sessionNumber: number;
  fullSessionId: string;
  whatsappResult: any;
}) {
  const content =
    message ||
    media.caption ||
    mediaLabel(media.kind, media.fileName);

  const { error } = await supabase
    .from("messages")
    .insert({
      company_id: companyId,
      branch_id: branchId || null,
      lead_id: leadId,
      owner_user_id: userId,
      direction: "sent",
      topic: "whatsapp",
      extension: media.kind || "text",
      content,
      event: "message_sent",
      payload: {
        source: "inbox_manual",
        owner_user_id: userId,
        user_id: userId,
        session_id: sessionNumber,
        full_session_id: fullSessionId,
        whatsapp_message_id:
          whatsappResult?.messageId ||
          whatsappResult?.id ||
          whatsappResult?.key?.id ||
          null,
        jid:
          whatsappResult?.jid ||
          whatsappResult?.key?.remoteJid ||
          null,
        media_url: mediaUrl,
        media_type: media.kind || "text",
        mime_type: media.mimeType,
        file_name: media.fileName,
        caption: media.caption,
      },
      status: "sent",
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error(
      "ERRO AO SALVAR MENSAGEM MANUAL:",
      error
    );

    throw new Error(
      `A mensagem foi enviada, mas não foi salva no histórico: ${error.message}`
    );
  }

  return content;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access =
      await requireCompanyAccess(req);

    const companyId = clean(
      access?.companyId
    );

    const userId = clean(access?.userId);

    if (!companyId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Empresa ou usuário não identificado.",
        },
        {
          status: 401,
        }
      );
    }

    const body = await req
      .json()
      .catch(() => ({}));

    const leadId = clean(
      body?.leadId ||
        body?.lead_id ||
        body?.id
    );

    const message = clean(
      body?.message ||
        body?.text ||
        body?.body
    );

    const fallbackPhone = clean(
      body?.phone ||
        body?.number ||
        body?.telefone
    );

    const media = extractMedia(body);

    if (!leadId) {
      return NextResponse.json(
        {
          success: false,
          error: "leadId obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    if (!message && !media.kind) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Informe uma mensagem ou uma mídia.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: lead,
      error: leadError,
    } = await supabase
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) {
      throw new Error(leadError.message);
    }

    if (!lead) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Lead não encontrado nesta empresa.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Compatibilidade:
     * se a tabela de leads já tiver owner_user_id,
     * impede um vendedor de responder o lead de outro.
     */
    if (
      lead?.owner_user_id &&
      clean(lead.owner_user_id) !== userId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este contato pertence a outro vendedor.",
        },
        {
          status: 403,
        }
      );
    }

    const destination = getDestination(
      lead,
      fallbackPhone
    );

    if (
      !destination.phone &&
      !destination.lid &&
      !destination.jid
    ) {
      console.warn(
        "WHATSAPP INBOX SKIPPED_NO_DESTINATION:",
        {
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          fallbackPhone,
          lid: lead.whatsapp_lid,
          remoteJid: lead.remote_jid,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Este contato não tem telefone nem identificador WhatsApp válido para resposta.",
        },
        {
          status: 400,
        }
      );
    }

    if (!lead.phone && destination.phone) {
      await supabase
        .from("leads")
        .update({
          phone: destination.phone,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", lead.id)
        .eq("company_id", companyId);
    }

    const session = buildSession(
      companyId,
      userId,
      lead,
      body?.session_id ?? body?.sessionId
    );

    const mediaUrl = await uploadMedia({
      supabase,
      companyId,
      userId,
      leadId: lead.id,
      media,
    });

    const result = await sendToWhatsapp({
      fullSessionId:
        session.fullSessionId,
      destination,
      message,
      media,
      mediaUrl,
    });

    const historyContent =
      await saveSentMessage({
        supabase,
        companyId,
        branchId:
          lead.branch_id || null,
        userId,
        leadId: lead.id,
        message,
        media,
        mediaUrl,
        sessionNumber:
          session.sessionId,
        fullSessionId:
          session.fullSessionId,
        whatsappResult: result,
      });

    const now = new Date().toISOString();

    const { error: updateLeadError } =
      await supabase
        .from("leads")
        .update({
          last_message: historyContent,
          last_message_at: now,
          ai_paused: true,
          session_id:
            session.sessionId,
          updated_at: now,
        })
        .eq("id", lead.id)
        .eq("company_id", companyId);

    if (updateLeadError) {
      console.error(
        "ERRO AO ATUALIZAR LEAD APÓS ENVIO:",
        updateLeadError
      );
    }

    return NextResponse.json({
      success: true,
      result,
      message: {
        direction: "sent",
        content: historyContent,
        extension: media.kind || "text",
        media_url: mediaUrl,
        media_type:
          media.kind || "text",
        mime_type: media.mimeType,
        file_name: media.fileName,
        owner_user_id: userId,
        session_id: session.sessionId,
        created_at: now,
      },
    });
  } catch (error: any) {
    console.error(
      "POST /api/whatsapp/inbox-send:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao enviar mensagem pelo inbox.",
      },
      {
        status: 500,
      }
    );
  }
}
