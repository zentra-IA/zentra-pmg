import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeKanbanStatus,
} from "@/lib/crm/kanban-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER || "http://localhost:3013";

const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || "";
const DEFAULT_BRANCH_ID = process.env.DEFAULT_BRANCH_ID || null;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "http://localhost:3000";

const MEDIA_BUCKET = "whatsapp-media";
const MAX_INCOMING_MEDIA_BYTES = 100 * 1024 * 1024;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function onlyDigits(value: any) {
  return clean(value).replace(/\D/g, "");
}
function normalizePhone(value: any) {
  let digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";

  // Se vier @lid ou ID interno muito longo, não trata como telefone
  if (digits.length > 13) return "";

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  // Brasil: 55 + DDD + número
  if (digits.length < 12 || digits.length > 13) return "";

  return digits;
}

function isRealBrazilPhone(value: any) {
  const phone = normalizePhone(value);

  if (!phone) return false;
  if (!phone.startsWith("55")) return false;

  // Brasil: 55 + DDD + número, normalmente 12 ou 13 dígitos
  if (phone.length < 12 || phone.length > 13) return false;

  // Bloqueia IDs internos longos do WhatsApp/LID
  if (phone.length > 13) return false;

  return true;
}

function normalizeLid(value: any) {
  const text = clean(value);
  if (!text) return null;

  // LID é somente o identificador @lid. JID telefônico fica em remote_jid.
  if (text.includes("@lid")) return text;

  return null;
}

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asObject(value: any): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function getIncomingMessageId(body: any) {
  return (
    body?.messageId ||
    body?.message_id ||
    body?.id ||
    body?.key?.id ||
    body?.data?.key?.id ||
    body?.data?.messageId ||
    body?.data?.message_id ||
    body?.data?.id ||
    body?.data?.messages?.[0]?.key?.id ||
    body?.messages?.[0]?.key?.id ||
    body?.messageObject?.key?.id ||
    body?.message_object?.key?.id ||
    null
  );
}

function getIncomingRemoteJid(body: any) {
  return (
    body?.remoteJid ||
    body?.remote_jid ||
    body?.jid ||
    body?.key?.remoteJid ||
    body?.data?.remoteJid ||
    body?.data?.remote_jid ||
    body?.data?.jid ||
    body?.data?.key?.remoteJid ||
    body?.data?.messages?.[0]?.key?.remoteJid ||
    body?.messages?.[0]?.key?.remoteJid ||
    body?.messageObject?.key?.remoteJid ||
    body?.message_object?.key?.remoteJid ||
    null
  );
}

function getIncomingPushName(body: any) {
  return clean(
    body?.pushName ||
      body?.push_name ||
      body?.name ||
      body?.data?.pushName ||
      body?.data?.push_name ||
      body?.data?.name ||
      body?.data?.messages?.[0]?.pushName ||
      body?.messages?.[0]?.pushName ||
      body?.messageObject?.pushName ||
      body?.message_object?.pushName ||
      ""
  );
}

function getIncomingText(body: any) {
  const root = unwrapIncomingMessage(getRootIncomingMessage(body));

  return clean(
    body?.message ||
      body?.text ||
      body?.body ||
      body?.caption ||
      body?.data?.text ||
      body?.data?.body ||
      body?.data?.caption ||
      root?.conversation ||
      root?.extendedTextMessage?.text ||
      root?.imageMessage?.caption ||
      root?.videoMessage?.caption ||
      root?.documentMessage?.caption ||
      root?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      ""
  );
}

type IncomingMedia = {
  url: string | null;
  base64: string | null;
  mimeType: string | null;
  mediaType: "image" | "video" | "audio" | "document" | "sticker" | null;
  fileName: string | null;
  caption: string | null;
  ptt: boolean;
  seconds: number | null;
  encryptedWhatsappMedia: boolean;
};

function normalizeMediaType(
  value: any,
  mimeType?: string | null
): IncomingMedia["mediaType"] {
  const raw = clean(value).toLowerCase();
  const mime = clean(mimeType).toLowerCase();

  if (raw.includes("image") || mime.startsWith("image/")) return "image";
  if (raw.includes("video") || mime.startsWith("video/")) return "video";
  if (
    raw.includes("audio") ||
    raw.includes("ptt") ||
    raw.includes("voice") ||
    mime.startsWith("audio/")
  ) {
    return "audio";
  }
  if (raw.includes("sticker")) return "sticker";
  if (
    raw.includes("document") ||
    raw.includes("file") ||
    mime === "application/pdf"
  ) {
    return "document";
  }

  return null;
}

function getRootIncomingMessage(body: any) {
  const candidates = [
    body?.messageObject?.message,
    body?.message_object?.message,
    body?.messageObject,
    body?.message_object,
    body?.data?.messages?.[0]?.message,
    body?.messages?.[0]?.message,
    body?.data?.message?.message,
    body?.data?.message,
    body?.message?.message,
    body?.message,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  return {};
}

function unwrapIncomingMessage(value: any): Record<string, any> {
  let message = asObject(value);

  for (let i = 0; i < 8; i++) {
    const next =
      message?.ephemeralMessage?.message ||
      message?.viewOnceMessage?.message ||
      message?.viewOnceMessageV2?.message ||
      message?.viewOnceMessageV2Extension?.message ||
      message?.documentWithCaptionMessage?.message ||
      null;

    if (!next || typeof next !== "object") break;
    message = asObject(next);
  }

  return message;
}

function getNestedMediaEnvelope(body: any): {
  type: IncomingMedia["mediaType"];
  payload: Record<string, any>;
} {
  const message = unwrapIncomingMessage(getRootIncomingMessage(body));

  const known: Array<[IncomingMedia["mediaType"], any]> = [
    ["image", message?.imageMessage],
    ["video", message?.videoMessage],
    ["audio", message?.audioMessage],
    ["document", message?.documentMessage],
    ["sticker", message?.stickerMessage],
  ];

  for (const [type, payload] of known) {
    if (payload && typeof payload === "object") {
      return {
        type,
        payload: asObject(payload),
      };
    }
  }

  const directMedia =
    body?.media ||
    body?.mediaData ||
    body?.media_data ||
    body?.data?.media ||
    body?.data?.mediaData ||
    body?.data?.media_data ||
    {};

  const direct = asObject(directMedia);
  const directType = normalizeMediaType(
    direct?.type ||
      direct?.mediaType ||
      direct?.media_type ||
      body?.mediaType ||
      body?.media_type ||
      body?.messageType ||
      body?.message_type ||
      body?.type,
    direct?.mimetype || direct?.mimeType || direct?.mime_type
  );

  return {
    type: directType,
    payload: direct,
  };
}

function normalizeBase64Candidate(value: any): string | null {
  if (!value) return null;

  if (
    typeof value === "object" &&
    value?.type === "Buffer" &&
    Array.isArray(value?.data)
  ) {
    try {
      return Buffer.from(value.data).toString("base64");
    } catch {
      return null;
    }
  }

  const raw = clean(value);
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return null;

  if (raw.startsWith("data:")) {
    const comma = raw.indexOf(",");
    return comma >= 0 ? raw.slice(comma + 1) : null;
  }

  // Evita interpretar IDs e textos curtos como base64.
  if (raw.length < 80) return null;

  const compact = raw.replace(/\s+/g, "");

  return /^[A-Za-z0-9+/=_-]+$/.test(compact)
    ? compact.replace(/-/g, "+").replace(/_/g, "/")
    : null;
}

function normalizeUrlCandidate(value: any): string | null {
  const raw = clean(value);
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function extractIncomingMedia(body: any): IncomingMedia {
  const envelope = getNestedMediaEnvelope(body);
  const nested = envelope.payload;
  const topMedia = asObject(
    body?.media ||
      body?.mediaData ||
      body?.media_data ||
      body?.data?.media ||
      body?.data?.mediaData ||
      body?.data?.media_data
  );

  const mimeType =
    clean(
      body?.mimetype ||
        body?.mimeType ||
        body?.mime_type ||
        body?.mediaMimeType ||
        body?.media_mime_type ||
        body?.data?.mimetype ||
        body?.data?.mimeType ||
        body?.data?.mime_type ||
        topMedia?.mimetype ||
        topMedia?.mimeType ||
        topMedia?.mime_type ||
        nested?.mimetype ||
        nested?.mimeType ||
        nested?.mime_type ||
        ""
    ) || null;

  const explicitType =
    envelope.type ||
    normalizeMediaType(
      body?.mediaType ||
        body?.media_type ||
        body?.messageType ||
        body?.message_type ||
        body?.type ||
        body?.data?.mediaType ||
        body?.data?.media_type ||
        body?.data?.messageType ||
        body?.data?.message_type ||
        topMedia?.type ||
        topMedia?.mediaType ||
        topMedia?.media_type ||
        nested?.type ||
        "",
      mimeType
    );

  const url =
    normalizeUrlCandidate(
      body?.mediaUrl ||
        body?.media_url ||
        body?.fileUrl ||
        body?.file_url ||
        body?.downloadUrl ||
        body?.download_url ||
        body?.audioUrl ||
        body?.audio_url ||
        body?.data?.mediaUrl ||
        body?.data?.media_url ||
        body?.data?.fileUrl ||
        body?.data?.file_url ||
        body?.data?.downloadUrl ||
        body?.data?.download_url ||
        body?.data?.audioUrl ||
        body?.data?.audio_url ||
        topMedia?.url ||
        topMedia?.mediaUrl ||
        topMedia?.media_url ||
        topMedia?.downloadUrl ||
        topMedia?.download_url ||
        nested?.mediaUrl ||
        nested?.media_url ||
        nested?.downloadUrl ||
        nested?.download_url ||
        nested?.url ||
        ""
    );

  const base64 =
    normalizeBase64Candidate(
      body?.base64 ||
        body?.mediaBase64 ||
        body?.media_base64 ||
        body?.fileBase64 ||
        body?.file_base64 ||
        body?.audioBase64 ||
        body?.audio_base64 ||
        body?.data?.base64 ||
        body?.data?.mediaBase64 ||
        body?.data?.media_base64 ||
        body?.data?.fileBase64 ||
        body?.data?.file_base64 ||
        body?.data?.audioBase64 ||
        body?.data?.audio_base64 ||
        topMedia?.base64 ||
        topMedia?.data ||
        topMedia?.buffer ||
        nested?.base64 ||
        nested?.data ||
        nested?.buffer ||
        ""
    );

  const fileName =
    clean(
      body?.fileName ||
        body?.filename ||
        body?.file_name ||
        body?.data?.fileName ||
        body?.data?.filename ||
        body?.data?.file_name ||
        topMedia?.fileName ||
        topMedia?.filename ||
        topMedia?.file_name ||
        nested?.fileName ||
        nested?.filename ||
        nested?.file_name ||
        ""
    ) || null;

  const caption =
    clean(
      body?.caption ||
        body?.mediaCaption ||
        body?.media_caption ||
        body?.data?.caption ||
        body?.data?.mediaCaption ||
        body?.data?.media_caption ||
        topMedia?.caption ||
        nested?.caption ||
        ""
    ) || null;

  const ptt =
    body?.ptt === true ||
    body?.isPtt === true ||
    body?.is_ptt === true ||
    body?.data?.ptt === true ||
    topMedia?.ptt === true ||
    nested?.ptt === true;

  const secondsRaw =
    body?.seconds ||
    body?.duration ||
    body?.durationSeconds ||
    body?.data?.seconds ||
    body?.data?.duration ||
    topMedia?.seconds ||
    topMedia?.duration ||
    nested?.seconds ||
    nested?.duration ||
    null;

  const secondsNumber = Number(secondsRaw);

  const encryptedWhatsappMedia = Boolean(
    nested?.mediaKey ||
      nested?.mediaKeyTimestamp ||
      nested?.fileEncSha256 ||
      nested?.directPath
  );

  return {
    url,
    base64,
    mimeType,
    mediaType:
      explicitType ||
      (ptt ? "audio" : null),
    fileName,
    caption,
    ptt,
    seconds:
      Number.isFinite(secondsNumber) && secondsNumber >= 0
        ? secondsNumber
        : null,
    encryptedWhatsappMedia,
  };
}

function extensionFromMime(mimeType?: string | null, mediaType?: string | null) {
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
  };

  if (known[mime]) return known[mime];

  const subtype = mime.split("/")[1]?.split(";")[0]?.trim();
  if (subtype) return subtype.replace("jpeg", "jpg");

  if (mediaType === "image") return "jpg";
  if (mediaType === "video") return "mp4";
  if (mediaType === "audio") return "ogg";
  if (mediaType === "sticker") return "webp";

  return "bin";
}

function mediaLabel(mediaType?: string | null) {
  const labels: Record<string, string> = {
    image: "📷 Imagem",
    video: "🎥 Vídeo",
    audio: "🎧 Áudio",
    document: "📎 Documento",
    sticker: "🖼️ Figurinha",
  };

  return labels[String(mediaType || "")] || "📎 Mídia";
}

async function persistIncomingMedia({
  supabase,
  companyId,
  userId,
  messageId,
  media,
}: {
  supabase: any;
  companyId: string;
  userId?: string | null;
  messageId?: string | null;
  media: IncomingMedia;
}) {
  async function uploadBytes(
    bytes: Buffer,
    contentType?: string | null
  ) {
    if (!bytes.length) return null;

    if (bytes.length > MAX_INCOMING_MEDIA_BYTES) {
      console.error("MÍDIA RECEBIDA EXCEDE 100 MB:", {
        messageId,
        bytes: bytes.length,
      });
      return null;
    }

    const extension = extensionFromMime(
      contentType || media.mimeType,
      media.mediaType
    );

    const safeMessageId = clean(
      messageId || crypto.randomUUID()
    ).replace(/[^a-zA-Z0-9_-]/g, "_");

    const objectPath = [
      companyId,
      userId || "legacy",
      new Date().toISOString().slice(0, 10),
      `${safeMessageId}.${extension}`,
    ].join("/");

    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(objectPath, bytes, {
        contentType:
          contentType ||
          media.mimeType ||
          "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error(
        "ERRO AO SALVAR MÍDIA RECEBIDA:",
        uploadError
      );
      return null;
    }

    const { data } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(objectPath);

    return data?.publicUrl || null;
  }

  try {
    /*
     * Prioridade 1: bytes/base64 já descriptografados pelo servidor WhatsApp.
     * Esse é o formato ideal para áudio/PTT recebido.
     */
    if (media.base64) {
      return uploadBytes(
        Buffer.from(media.base64, "base64"),
        media.mimeType
      );
    }

    /*
     * Prioridade 2: URL HTTP recebida.
     * Quando for uma URL pública real, copiamos para o nosso Storage.
     * Assim o histórico não depende de URL temporária/CORS do provedor.
     */
    if (media.url && !media.encryptedWhatsappMedia) {
      try {
        const response = await fetch(media.url, {
          method: "GET",
          cache: "no-store",
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();

          const uploaded = await uploadBytes(
            Buffer.from(arrayBuffer),
            response.headers.get("content-type") ||
              media.mimeType
          );

          if (uploaded) return uploaded;
        }
      } catch (downloadError) {
        console.warn(
          "NÃO FOI POSSÍVEL COPIAR URL DE MÍDIA PARA O STORAGE:",
          downloadError
        );
      }

      // Mantém compatibilidade com URLs públicas já utilizadas pelo sistema.
      return media.url;
    }

    /*
     * audioMessage.url/directPath do WhatsApp/Baileys pode apontar para mídia
     * criptografada. Sem os bytes descriptografados/base64, o navegador não
     * consegue tocar esse arquivo diretamente.
     */
    if (
      media.mediaType &&
      media.encryptedWhatsappMedia
    ) {
      console.warn(
        "WHATSAPP_MEDIA_ENCRYPTED_WITHOUT_DECRYPTED_BYTES:",
        {
          messageId: messageId || null,
          mediaType: media.mediaType,
          mimeType: media.mimeType,
          hasUrl: Boolean(media.url),
          ptt: media.ptt,
          seconds: media.seconds,
        }
      );
    }

    return null;
  } catch (error) {
    console.error(
      "ERRO AO PROCESSAR MÍDIA RECEBIDA:",
      error
    );
    return null;
  }
}

function normalizeSessionNumber(value: any) {
  const session = clean(value || "1");
  const match = session.match(/_(\d+)$/);
  if (match) return Number(match[1]);

  const n = Number(onlyDigits(session) || 1);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 1;
  return n;
}

function buildSendSession(companyId: string, userId: string | null | undefined, sessionId: number | string) {
  if (userId) return `${companyId}_${userId}_${sessionId}`;
  return `${companyId}_${sessionId}`;
}

async function resolveCompanyBySession(supabase: any, incomingSession: any) {
  const raw = clean(incomingSession);
  const parts = raw.split("_").filter(Boolean);

  if (parts.length < 3) {
    throw new Error(
      "Sessão inválida. Use o formato companyId_userId_sessionNumber."
    );
  }

  const sessionNumber = Number(parts[parts.length - 1]);
  const userId = parts[parts.length - 2] || null;
  const companyId = parts.slice(0, -2).join("_") || null;

  if (
    !companyId ||
    !userId ||
    !Number.isInteger(sessionNumber) ||
    sessionNumber < 1 ||
    sessionNumber > 5
  ) {
    throw new Error(
      "Sessão inválida. Empresa, usuário e número da sessão são obrigatórios."
    );
  }

  const { data: companyUser, error } = await supabase
    .from("company_users")
    .select("company_id, user_id, active")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("ERRO AO VALIDAR USUÁRIO DA SESSÃO:", error);
    throw new Error("Não foi possível validar o usuário da sessão.");
  }

  if (!companyUser) {
    throw new Error("Sessão sem usuário ativo vinculado à empresa.");
  }

  return {
    companyId,
    userId,
    branchId: DEFAULT_BRANCH_ID,
    sessionId: sessionNumber,
  };
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

/*
 * Na V2, a detecção de intenção serve somente para movimentação comercial
 * do Kanban. A resposta automática vem exclusivamente dos templates
 * personalizados cadastrados pelo vendedor.
 */
function detectSalesIntent(message: string) {
  const text = normalizeText(message);

  if (
    hasAny(text, [
      "nao tenho interesse",
      "não tenho interesse",
      "sem interesse",
      "nao quero",
      "não quero",
      "pare de mandar",
      "remove meu contato",
      "nao preciso",
      "não preciso",
      "agora nao",
      "agora não",
    ])
  ) {
    return "SEM_INTERESSE";
  }

  if (
    hasAny(text, [
      "quero comprar",
      "vou comprar",
      "pode fechar",
      "fecha o pedido",
      "fechar pedido",
      "manda o pedido",
      "pode separar",
      "confirmo",
      "confirmado",
      "fechado",
      "combinado",
      "pode mandar",
    ])
  ) {
    return "CLIENTE_QUER_COMPRAR";
  }

  if (
    hasAny(text, [
      "cotacao",
      "cotação",
      "orcamento",
      "orçamento",
      "manda tabela",
      "tabela de preco",
      "tabela de preço",
      "qual o preco",
      "qual o preço",
      "quanto custa",
      "tem preco",
      "tem preço",
      "me passa valores",
      "manda catalogo",
      "manda catálogo",
    ])
  ) {
    return "COTACAO";
  }

  if (
    hasAny(text, [
      "desconto",
      "melhor preco",
      "melhor preço",
      "condicao",
      "condição",
      "prazo",
      "negociar",
      "parcela",
      "parcelado",
      "boleto",
      "pix",
      "pagamento",
    ])
  ) {
    return "NEGOCIACAO";
  }

  if (
    hasAny(text, [
      "entrega",
      "entregar",
      "quando chega",
      "prazo de entrega",
      "rota",
      "frete",
      "endereco",
      "endereço",
      "chega amanha",
      "chega amanhã",
    ])
  ) {
    return "ENTREGA";
  }

  if (
    hasAny(text, [
      "vendedor",
      "representante",
      "atendente",
      "humano",
      "falar com alguem",
      "falar com alguém",
      "me liga",
      "ligacao",
      "ligação",
    ])
  ) {
    return "TRANSFERIR_VENDEDOR";
  }

  return "RESPONDEU";
}

function statusFromIntent(intent: string) {
  /*
   * V8:
   * Uma mensagem RECEBIDA nunca significa "cotação enviada".
   * "Cotação enviada" é uma ação nossa e deve vir do kanban_status
   * configurado na automação ou de uma movimentação manual.
   */
  const map: Record<string, string> = {
    SEM_INTERESSE: "sem_interesse",
    CLIENTE_QUER_COMPRAR: "em_negociacao",
    COTACAO: "em_negociacao",
    NEGOCIACAO: "em_negociacao",
    ENTREGA: "respondeu",
    TRANSFERIR_VENDEDOR: "respondeu",
    RESPONDEU: "respondeu",
  };

  return map[intent] || "respondeu";
}

/*
 * Status que representam encerramento explícito.
 * "cliente_inativo" não fica bloqueado: se a pessoa voltar a escrever,
 * ela deve voltar ao atendimento.
 */
const LOCKED_KANBAN_STATUS = new Set([
  "pedido_fechado",
  "sem_interesse",
  "perdido",
]);

function getTemplateKanbanStatus(template: any) {
  return normalizeKanbanStatus(
    template?.kanban_status ||
      template?.kanbanStatus ||
      template?.target_status ||
      template?.targetStatus ||
      template?.move_to_status ||
      template?.moveToStatus ||
      null
  );
}

function chooseKanbanStatus(
  currentValue: any,
  candidateValue: any,
  explicit = false
) {
  const current =
    normalizeKanbanStatus(currentValue) ||
    "novo";

  const candidate =
    normalizeKanbanStatus(candidateValue);

  if (!candidate) return current;

  /*
   * O destino configurado na tela "Mensagens" é autoridade.
   * Se a automação diz para mover o card, move exatamente para lá.
   */
  if (explicit) return candidate;

  /*
   * Mesmo um contato encerrado pode iniciar uma NOVA oportunidade.
   * Pedido de preço/cotação/negociação reabre para "Quer cotação".
   */
  if (
    LOCKED_KANBAN_STATUS.has(current) &&
    candidate === "em_negociacao"
  ) {
    return candidate;
  }

  /*
   * Respostas genéricas curtas não desmontam um fechamento/perda.
   * O bloco de respostas curtas mais abaixo também preserva o fluxo.
   */
  if (LOCKED_KANBAN_STATUS.has(current)) {
    return current;
  }

  /*
   * Para etapas ativas não usamos ranking crescente.
   * O status representa o estado ATUAL da conversa:
   * enviado/campanha/cotação enviada -> cliente respondeu -> "respondeu".
   */
  return candidate;
}

async function updateLeadKanbanStatus({
  supabase,
  lead,
  companyId,
  userId,
  candidate,
  explicit = false,
}: {
  supabase: any;
  lead: any;
  companyId: string;
  userId: string;
  candidate: string | null | undefined;
  explicit?: boolean;
}) {
  const nextStatus = chooseKanbanStatus(
    lead?.status || "novo",
    candidate,
    explicit
  );

  if (nextStatus === normalizeKanbanStatus(lead?.status || "novo")) {
    return { ...lead, status: nextStatus };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id)
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[KANBAN] Erro ao atualizar status:", {
      leadId: lead?.id,
      currentStatus: lead?.status,
      candidate,
      nextStatus,
      error,
    });
    return { ...lead, status: lead?.status || "novo" };
  }

  return data || { ...lead, status: nextStatus };
}

function shouldForceSalesStatus(
  message: string,
  intent: string,
  reply?: string | null
) {
  const text = normalizeText(message);
  const normalizedIntent = String(intent || "").toUpperCase();

  if (
    ["CLIENTE_QUER_COMPRAR", "COTACAO", "NEGOCIACAO"].includes(
      normalizedIntent
    )
  ) {
    return true;
  }

  if (
    hasAny(text, [
      "quero",
      "quero comprar",
      "quanto custa",
      "manda cotacao",
      "manda cotação",
      "manda tabela",
      "faz desconto",
      "pode fechar",
      "fechar pedido",
      "manda pedido",
      "orcamento",
      "orçamento",
    ])
  ) {
    return true;
  }

  const responseText = normalizeText(reply || "");
  return (
    responseText.includes("cotador") ||
    responseText.includes("orcamento") ||
    responseText.includes("orçamento") ||
    responseText.includes("pedido") ||
    responseText.includes("tabela")
  );
}

function getDestination({ lead, phone, lid, remoteJid }: any) {
  /*
   * REGRA DE SEGURANÇA V2.1:
   * a resposta automática deve voltar para o identificador EXATO que originou
   * a mensagem atual. O cadastro do lead é apenas fallback.
   *
   * Isso impede que um LID/JID vinculado incorretamente no passado faça a
   * resposta ser enviada para o telefone de outro lead.
   */

  const incomingRemoteJid = clean(remoteJid || "");

  if (
    incomingRemoteJid &&
    incomingRemoteJid.includes("@s.whatsapp.net") &&
    !incomingRemoteJid.includes("@lid")
  ) {
    const phoneFromJid = normalizePhone(incomingRemoteJid.split("@")[0]);

    if (phoneFromJid) {
      return {
        number: phoneFromJid,
        phone: phoneFromJid,
        lid: null,
        jid: `${phoneFromJid}@s.whatsapp.net`,
        isLid: false,
      };
    }
  }

  if (incomingRemoteJid && incomingRemoteJid.includes("@lid")) {
    const exactLid = normalizeLid(incomingRemoteJid);

    if (exactLid) {
      return {
        number: "",
        phone: "",
        lid: exactLid,
        jid: exactLid,
        isLid: true,
      };
    }
  }

  const incomingLid = normalizeLid(lid || "");

  if (incomingLid && String(incomingLid).includes("@lid")) {
    return {
      number: "",
      phone: "",
      lid: incomingLid,
      jid: incomingLid,
      isLid: true,
    };
  }

  const incomingPhone = normalizePhone(phone || "");

  if (incomingPhone) {
    return {
      number: incomingPhone,
      phone: incomingPhone,
      lid: null,
      jid: `${incomingPhone}@s.whatsapp.net`,
      isLid: false,
    };
  }

  const leadRemoteJid = clean(lead?.remote_jid || "");

  if (
    leadRemoteJid &&
    leadRemoteJid.includes("@s.whatsapp.net") &&
    !leadRemoteJid.includes("@lid")
  ) {
    const leadPhoneFromJid = normalizePhone(leadRemoteJid.split("@")[0]);

    if (leadPhoneFromJid) {
      return {
        number: leadPhoneFromJid,
        phone: leadPhoneFromJid,
        lid: null,
        jid: `${leadPhoneFromJid}@s.whatsapp.net`,
        isLid: false,
      };
    }
  }

  const leadLid = normalizeLid(
    lead?.whatsapp_lid ||
      lead?.lid ||
      (String(leadRemoteJid).includes("@lid") ? leadRemoteJid : "")
  );

  if (leadLid && String(leadLid).includes("@lid")) {
    return {
      number: "",
      phone: "",
      lid: leadLid,
      jid: leadLid,
      isLid: true,
    };
  }

  const leadPhone = normalizePhone(
    lead?.phone ||
      lead?.mobile ||
      lead?.telefone ||
      ""
  );

  if (leadPhone) {
    return {
      number: leadPhone,
      phone: leadPhone,
      lid: null,
      jid: `${leadPhone}@s.whatsapp.net`,
      isLid: false,
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

async function sendToWhatsApp(payload: any) {
  const res = await fetch(`${WHATSAPP_SERVER}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  console.log("WHATSAPP SEND STATUS:", res.status);
  console.log("WHATSAPP SEND RESPONSE:", data);

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || JSON.stringify(data));
  }

  return data;
}

async function sendMediaToWhatsApp(payload: any) {
  const res = await fetch(`${WHATSAPP_SERVER}/send-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || JSON.stringify(data));
  }

  return data;
}

async function wasMessageAlreadyProcessed(
  supabase: any,
  companyId: string,
  userId: string | null | undefined,
  leadId: string,
  messageId?: string | null
) {
  if (!messageId) return false;

  let query = supabase
    .from("messages")
    .select("id")
    .eq("company_id", companyId)
    .eq("lead_id", leadId)
    .eq("direction", "received")
    .contains("payload", { message_id: messageId });

  if (userId) {
    query = query.eq("owner_user_id", userId);
  } else {
    query = query.is("owner_user_id", null);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    console.error("ERRO AO VERIFICAR DUPLICIDADE:", error);
    return false;
  }

  return Boolean(data?.length);
}

async function saveReceivedMessage(
  supabase: any,
  {
    leadId,
    companyId,
    branchId,
    userId,
    sessionId,
    message,
    messageId,
    mediaUrl,
    mediaType,
    mimeType,
    fileName,
    caption,
    ptt,
    durationSeconds,
    mediaPending,
    remoteJid,
    lid,
  }: {
    leadId: string;
    companyId: string;
    branchId: string | null;
    userId?: string | null;
    sessionId: number;
    message: string;
    messageId?: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    caption?: string | null;
    ptt?: boolean;
    durationSeconds?: number | null;
    mediaPending?: boolean;
    remoteJid?: string | null;
    lid?: string | null;
  }
) {
  const content = message || mediaLabel(mediaType);
  const extension = mediaType || "text";

  const { error } = await supabase.from("messages").insert({
    company_id: companyId,
    branch_id: branchId,
    lead_id: leadId,
    owner_user_id: userId || null,
    direction: "received",
    topic: "whatsapp",
    extension,
    content,
    event: "message_received",
    payload: {
      message_id: messageId || null,
      owner_user_id: userId || null,
      session_id: sessionId,
      media_url: mediaUrl || null,
      media_type: mediaType || "text",
      mime_type: mimeType || null,
      file_name: fileName || null,
      caption: caption || null,
      ptt: Boolean(ptt),
      duration_seconds:
        durationSeconds ?? null,
      media_pending:
        Boolean(mediaPending),
      remote_jid: remoteJid || null,
      lid: lid || null,
    },
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("ERRO AO SALVAR MENSAGEM RECEBIDA:", error);
    throw new Error(`Não foi possível salvar a mensagem recebida: ${error.message}`);
  }
}


async function saveSentMessage(
  supabase: any,
  {
    leadId,
    companyId,
    branchId,
    userId,
    reply,
    mediaUrl,
    mediaType,
    metadata,
  }: {
    leadId: string;
    companyId: string;
    branchId: string | null;
    userId?: string | null;
    reply: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
    metadata?: Record<string, any>;
  }
) {
  const { error } = await supabase.from("messages").insert({
    company_id: companyId,
    branch_id: branchId,
    lead_id: leadId,
    owner_user_id: userId || null,
    direction: "sent",
    topic: "whatsapp",
    extension: mediaType || "text",
    content: reply,
    event: "message_sent",
    payload: {
      owner_user_id: userId || null,
      user_id: userId || null,
      media_url: mediaUrl || null,
      media_type: mediaType || "text",
      ...(metadata || {}),
    },
    status: "sent",
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[HISTORY] Erro ao salvar mensagem enviada:", error);
    throw new Error(
      `Não foi possível salvar a resposta no histórico: ${error.message}`
    );
  }
}

async function getActiveQueueContext({
  supabase,
  companyId,
  leadId,
  phone,
  userId,
}: {
  supabase: any;
  companyId: string;
  userId: string;
  leadId?: string | null;
  phone?: string | null;
}) {
  const normalizedPhone = normalizePhone(phone || "");

  async function runQuery(query: any) {
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("ERRO BUSCAR CONTEXTO DO LOTE:", error);
      return null;
    }

    return data || null;
  }

  // 1) Primeiro tenta pelo lead_id. Esse é o vínculo mais seguro.
  if (leadId) {
    const byLead = await runQuery(
      supabase
        .from("automation_queue")
        .select("*")
        .eq("company_id", companyId)
        .eq("owner_user_id", userId)
        .eq("lead_id", leadId)
    );

    if (byLead) return byLead;
  }

  // 2) Depois tenta pelo telefone real. Isso cobre casos em que o lote foi criado
  // antes de vincular corretamente o lead_id.
  if (normalizedPhone) {
    const byPhone = await runQuery(
      supabase
        .from("automation_queue")
        .select("*")
        .eq("company_id", companyId)
        .eq("owner_user_id", userId)
        .eq("phone", normalizedPhone)
    );

    if (byPhone) return byPhone;
  }

  return null;
}

async function buildVariableContext({
  supabase,
  companyId,
  userId,
  lead,
  phone,
  lastMessage,
}: {
  supabase: any;
  companyId: string;
  userId: string;
  lead: any;
  phone?: string;
  lastMessage?: string;
}) {
  const [queueContextResult, companyResult] = await Promise.all([
    getActiveQueueContext({
      supabase,
      companyId,
      userId,
      leadId: lead?.id,
      phone: lead?.phone || phone,
    }),
    supabase
      .from("companies")
      .select("id, name, document, phone, whatsapp, owner_name")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  const queueContext = queueContextResult || null;
  const company = companyResult?.data || null;
  const queueMetadata =
    queueContext?.metadata && typeof queueContext.metadata === "object"
      ? queueContext.metadata
      : {};

  return {
    phone: lead?.phone || phone || "",
    email: lead?.email || "",
    lastMessage: lastMessage || lead?.last_message || "",
    companyName:
      company?.name ||
      process.env.COMPANY_NAME ||
      "Empresa",
    cnpj: company?.document || "",
    companyPhone: company?.whatsapp || company?.phone || "",
    representativeName:
      queueMetadata?.representative_name ||
      queueMetadata?.representante ||
      company?.owner_name ||
      "",
    productName:
      queueMetadata?.product_name ||
      queueMetadata?.produto ||
      lead?.product_name ||
      "",
    category:
      queueMetadata?.category ||
      queueMetadata?.categoria ||
      "",
    price:
      queueMetadata?.price ||
      queueMetadata?.valor ||
      "",
    discount:
      queueMetadata?.discount ||
      queueMetadata?.desconto ||
      "",
    paymentMethod:
      queueMetadata?.payment_method ||
      queueMetadata?.forma_pagamento ||
      "",
    deliveryDate:
      queueMetadata?.delivery_date ||
      queueMetadata?.data_entrega ||
      "",
    orderNumber:
      queueMetadata?.order_number ||
      queueMetadata?.pedido ||
      "",
    quoteNumber:
      queueMetadata?.quote_number ||
      queueMetadata?.cotacao ||
      "",
    averageTicket:
      queueMetadata?.average_ticket ||
      queueMetadata?.ticket_medio ||
      "",
    lastPurchase:
      queueMetadata?.last_purchase ||
      queueMetadata?.ultima_compra ||
      "",
    quoteLink:
      queueMetadata?.quote_link ||
      queueMetadata?.link_cotador ||
      `${APP_URL}/crm/dashboard/cotador`,
    campaignId: queueContext?.campaign_id || "",
    batchId: queueContext?.batch_id || lead?.batch_id || "",
    queueContext,
    company,
  };
}

function normalizeVariableKey(value: any) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function applyVariables(text: string, lead: any, extra: any = {}) {
  const phone = normalizePhone(
    extra?.phone ||
      lead?.phone ||
      lead?.mobile ||
      lead?.telefone ||
      ""
  );

  const customerName =
    clean(lead?.name || lead?.nome || extra?.name || extra?.nome) ||
    "Cliente";

  const companyName =
    clean(extra?.companyName || extra?.company || extra?.empresa) ||
    "Empresa";

  const quoteLink =
    clean(
      extra?.quoteLink ||
        extra?.linkCotador ||
        extra?.link_cotador ||
        extra?.link
    ) || `${APP_URL}/crm/dashboard/cotador`;

  const values: Record<string, any> = {
    cliente: customerName,
    nome: customerName,
    nome_cliente: customerName,
    telefone: phone,
    celular: phone,
    whatsapp: phone,
    email: lead?.email || extra?.email || "",
    empresa: companyName,
    nome_empresa: companyName,
    cnpj: extra?.cnpj || lead?.cnpj || lead?.document || "",
    cidade: extra?.city || extra?.cidade || lead?.city || lead?.cidade || "",
    estado: extra?.state || extra?.estado || lead?.state || lead?.estado || "",
    bairro:
      extra?.neighborhood ||
      extra?.bairro ||
      lead?.neighborhood ||
      lead?.bairro ||
      "",
    representante:
      extra?.representativeName ||
      extra?.representante ||
      lead?.representative_name ||
      "",
    vendedor:
      extra?.representativeName ||
      extra?.representante ||
      lead?.representative_name ||
      "",
    produto:
      extra?.productName ||
      extra?.product ||
      extra?.produto ||
      lead?.product_name ||
      "",
    categoria: extra?.category || extra?.categoria || "",
    valor: extra?.price || extra?.valor || "",
    desconto: extra?.discount || extra?.desconto || "",
    forma_pagamento:
      extra?.paymentMethod ||
      extra?.formaPagamento ||
      extra?.forma_pagamento ||
      "",
    data_entrega:
      extra?.deliveryDate ||
      extra?.dataEntrega ||
      extra?.data_entrega ||
      "",
    pedido: extra?.orderNumber || extra?.pedido || "",
    cotacao: extra?.quoteNumber || extra?.cotacao || "",
    ticket_medio: extra?.averageTicket || extra?.ticketMedio || "",
    ultima_compra: extra?.lastPurchase || extra?.ultimaCompra || "",
    ultima_mensagem:
      extra?.lastMessage ||
      extra?.ultimaMensagem ||
      lead?.last_message ||
      "",
    link_whatsapp: phone ? `https://wa.me/${phone}` : "",
    link_cotador: quoteLink,
    link: quoteLink,
    campanha: extra?.campaignId || "",
    lote: extra?.batchId || "",
  };

  /*
   * Também permite usar qualquer campo simples existente no lead ou no
   * contexto extra, sem precisar alterar esta função a cada nova variável.
   */
  for (const source of [lead || {}, extra || {}]) {
    for (const [key, value] of Object.entries(source)) {
      if (
        value === null ||
        value === undefined ||
        typeof value === "object"
      ) {
        continue;
      }

      const normalizedKey = normalizeVariableKey(key);
      if (!(normalizedKey in values)) {
        values[normalizedKey] = value;
      }
    }
  }

  return String(text || "").replace(
    /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g,
    (full, doubleKey, singleKey) => {
      const key = normalizeVariableKey(doubleKey || singleKey || "");
      return key in values ? String(values[key] ?? "") : full;
    }
  );
}

function variationText(variation: any) {
  if (typeof variation === "string") return clean(variation);

  return clean(
    variation?.message ||
      variation?.content ||
      variation?.base_message ||
      variation?.final_message ||
      ""
  );
}

function sortVariations(items: any[]) {
  return [...items].sort((a, b) => {
    const sortA = Number(a?.sort_order || 0);
    const sortB = Number(b?.sort_order || 0);
    const variationA = Number(a?.variation || 0);
    const variationB = Number(b?.variation || 0);
    const orderA = sortA > 0 ? sortA : variationA;
    const orderB = sortB > 0 ? sortB : variationB;

    if (orderA !== orderB) return orderA - orderB;

    return (
      new Date(a?.created_at || 0).getTime() -
      new Date(b?.created_at || 0).getTime()
    );
  });
}

async function hydrateTemplatesWithVariations(
  supabase: any,
  templates: any[] | null | undefined
) {
  const rows = (templates || []).filter((item) => item?.id);
  if (!rows.length) return [];

  const missing = rows.filter(
    (item) => !Array.isArray(item?.variations)
  );

  if (!missing.length) {
    return rows.map((item) => ({
      ...item,
      variations: sortVariations(
        (item.variations || []).filter((variation: any) => variation?.active !== false)
      ),
    }));
  }

  const ids = missing.map((item) => item.id);

  const { data, error } = await supabase
    .from("message_variations")
    .select("*")
    .in("template_id", ids)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[TEMPLATES] Erro ao carregar variações:", error);
  }

  const byTemplate = new Map<string, any[]>();

  for (const variation of data || []) {
    const key = String(variation.template_id || "");
    const list = byTemplate.get(key) || [];
    list.push(variation);
    byTemplate.set(key, list);
  }

  return rows.map((item) => ({
    ...item,
    variations: sortVariations(
      Array.isArray(item.variations)
        ? item.variations.filter((variation: any) => variation?.active !== false)
        : byTemplate.get(String(item.id)) || []
    ),
  }));
}

function buildTemplateMessagePool(template: any) {
  const pool: Array<{
    text: string;
    variationId: string | null;
    source: "base" | "variation";
  }> = [];

  const add = (
    text: any,
    source: "base" | "variation",
    variationId: string | null = null
  ) => {
    const normalized = clean(text);
    if (!normalized) return;

    if (pool.some((item) => item.text === normalized)) return;

    pool.push({
      text: normalized,
      variationId,
      source,
    });
  };

  add(
    template?.base_message ||
      template?.message ||
      template?.content ||
      template?.final_message,
    "base"
  );

  if (template?.message && template?.message !== template?.base_message) {
    add(template.message, "base");
  }

  for (const variation of sortVariations(template?.variations || [])) {
    add(
      variationText(variation),
      "variation",
      variation?.id ? String(variation.id) : null
    );
  }

  return pool;
}

const templateVariationMemory = new Map<string, number>();

async function getTemplateVariation({
  supabase,
  template,
  companyId,
  userId,
}: {
  supabase: any;
  template: any;
  companyId: string;
  userId: string;
}) {
  const pool = buildTemplateMessagePool(template);

  if (!pool.length) {
    return {
      text: "",
      index: -1,
      total: 0,
      variationId: null,
      source: "base" as const,
    };
  }

  /*
   * O cursor é calculado pelo histórico persistido das mensagens enviadas
   * com este template. Assim o rodízio não volta para zero a cada reinício
   * do servidor. O Map é apenas fallback caso a contagem falhe.
   */
  let currentIndex: number | null = null;

  try {
    let query = supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("direction", "sent")
      .contains("payload", { template_id: template.id, variation_counted: true });

    if (userId) {
      query = query.eq("owner_user_id", userId);
    }

    const { count, error } = await query;

    if (error) {
      console.error("[TEMPLATES] Erro ao consultar cursor persistente:", error);
    } else {
      currentIndex = Number(count || 0);
    }
  } catch (error) {
    console.error("[TEMPLATES] Falha ao consultar cursor persistente:", error);
  }

  const memoryKey = `${companyId}:${userId}:${template.id}`;

  if (currentIndex === null) {
    currentIndex = templateVariationMemory.get(memoryKey) || 0;
  }

  const index = currentIndex % pool.length;
  const selected = pool[index];

  templateVariationMemory.set(memoryKey, currentIndex + 1);

  return {
    text: selected.text,
    index,
    total: pool.length,
    variationId: selected.variationId,
    source: selected.source,
  };
}

function extractKeywords(template: any) {
  const raw =
    template?.trigger_keywords ||
    template?.keywords ||
    template?.trigger_text ||
    template?.keyword ||
    template?.trigger ||
    "";

  const values: string[] = [];

  if (Array.isArray(template?.trigger_words)) {
    values.push(...template.trigger_words);
  }

  if (Array.isArray(raw)) {
    values.push(...raw);
  } else {
    values.push(
      ...String(raw || "")
        .split(/\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  return Array.from(
    new Set(
      values
        .map((item) => clean(item))
        .filter(Boolean)
    )
  );
}

function isAutomaticReplyTemplate(template: any) {
  return clean(template?.type).toLowerCase() === "ai";
}

function templateMatchesMessage(
  message: string,
  keyword: string,
  matchMode?: string | null
) {
  const normalizedMessage = normalizeText(message);
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedMessage || !normalizedKeyword) return false;

  const mode = clean(matchMode || "contains").toLowerCase();

  if (["exact", "equals", "igual"].includes(mode)) {
    return normalizedMessage === normalizedKeyword;
  }

  if (["starts_with", "startswith", "comeca", "começa"].includes(mode)) {
    return normalizedMessage.startsWith(normalizedKeyword);
  }

  if (["ends_with", "endswith", "termina"].includes(mode)) {
    return normalizedMessage.endsWith(normalizedKeyword);
  }

  /*
   * O contains usa limites de palavra/frase para que "oi" não seja
   * encontrado dentro de "foi" ou "coisa".
   */
  return ` ${normalizedMessage} `.includes(` ${normalizedKeyword} `);
}

function flowMode(template: any) {
  const mode = clean(template?.flow_mode || "global").toLowerCase();

  if (["sequence", "sequencia", "sequência"].includes(mode)) {
    return "sequence";
  }

  return "single";
}

function getTemplateFlowGroup(template: any) {
  const metadata =
    template?.metadata && typeof template.metadata === "object"
      ? template.metadata
      : {};

  const explicit =
    clean(
      template?.flow_group ||
        metadata?.flow_group ||
        metadata?.flowGroup ||
        ""
    );

  if (explicit) return explicit;

  const scope = clean(template?.template_scope || "");
  if (scope && scope !== "global") return scope;

  return "default";
}

function getLeadFlowGroup(lead: any) {
  const direct = clean(lead?.current_flow_group || "");
  if (direct) return direct;

  const stage = clean(lead?.conversation_stage || "");
  if (stage.startsWith("flow:")) {
    return stage.slice(5);
  }

  return "";
}

function getCompletedFlowGroup(lead: any) {
  const stage = clean(lead?.conversation_stage || "");

  if (stage.startsWith("flow_completed:")) {
    return stage.slice("flow_completed:".length);
  }

  return "";
}

function getLeadFlowStep(lead: any) {
  const step = Number(lead?.current_flow_step || 0);

  if (!Number.isFinite(step) || step <= 0) {
    return null;
  }

  /*
   * Versões antigas criavam todo lead com current_flow_step = 1, mesmo sem
   * um fluxo iniciado. Só consideramos o fluxo ativo quando existe grupo
   * persistido em current_flow_group/conversation_stage.
   */
  return getLeadFlowGroup(lead) ? step : null;
}

async function persistLeadFlowState({
  supabase,
  lead,
  group,
  step,
}: {
  supabase: any;
  lead: any;
  group: string | null;
  step: number | null;
}) {
  const basePatch: any = {
    current_flow_step: step == null ? null : String(step),
    conversation_stage: group && step ? `flow:${group}` : "new",
    updated_at: new Date().toISOString(),
  };

  /*
   * Alguns bancos já possuem current_flow_group e outros guardam o grupo
   * em conversation_stage. Tentamos a coluna dedicada e fazemos fallback
   * sem quebrar instalações mais antigas.
   */
  const withGroup = {
    ...basePatch,
    current_flow_group: group || null,
  };

  let result = await supabase
    .from("leads")
    .update(withGroup)
    .eq("id", lead.id)
    .select("*")
    .maybeSingle();

  if (result.error) {
    const message = String(result.error?.message || "");

    if (
      message.includes("current_flow_group") ||
      message.includes("schema cache")
    ) {
      result = await supabase
        .from("leads")
        .update(basePatch)
        .eq("id", lead.id)
        .select("*")
        .maybeSingle();
    }
  }

  if (result.error) {
    console.error("[FLOW] Erro ao persistir estado:", {
      leadId: lead?.id,
      group,
      step,
      error: result.error,
    });
    return lead;
  }

  return result.data || {
    ...lead,
    ...basePatch,
    current_flow_group: group || null,
  };
}


async function completeLeadFlowState({
  supabase,
  lead,
  group,
}: {
  supabase: any;
  lead: any;
  group: string;
}) {
  const completedGroup = clean(group || getLeadFlowGroup(lead) || "default");

  const basePatch: any = {
    current_flow_step: null,
    conversation_stage: `flow_completed:${completedGroup}`,
    updated_at: new Date().toISOString(),
  };

  const withGroup = {
    ...basePatch,
    current_flow_group: null,
  };

  let result = await supabase
    .from("leads")
    .update(withGroup)
    .eq("id", lead.id)
    .select("*")
    .maybeSingle();

  if (result.error) {
    const message = String(result.error?.message || "");

    if (
      message.includes("current_flow_group") ||
      message.includes("schema cache")
    ) {
      result = await supabase
        .from("leads")
        .update(basePatch)
        .eq("id", lead.id)
        .select("*")
        .maybeSingle();
    }
  }

  if (result.error) {
    console.error("[FLOW] Erro ao concluir fluxo:", {
      leadId: lead?.id,
      group: completedGroup,
      error: result.error,
    });

    return lead;
  }

  return result.data || {
    ...lead,
    ...basePatch,
    current_flow_group: null,
  };
}


type AutomaticReplyResult = {
  reply: string | null;
  mediaUrl: string | null;
  mediaType: string;
  currentTemplate: any;
  kanbanStatus: string | null;
  notifyEnabled: boolean;
  notifyNumbers: string[];
  notifyMessage: string | null;
  source: string;
  selection: {
    index: number;
    total: number;
    variationId: string | null;
    source: "base" | "variation";
  } | null;
};

function getNotificationNumbers(template: any) {
  const candidates = [
    template?.notify_number,
    template?.notify_phone,
    ...(String(template?.notify_numbers || "")
      .split(/\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean)),
  ];

  return Array.from(
    new Set(
      candidates
        .map((item) => normalizePhone(item))
        .filter(Boolean)
    )
  );
}

async function findTriggeredTemplate({
  supabase,
  message,
  lead,
  companyId,
  userId,
}: {
  supabase: any;
  message: string;
  lead: any;
  companyId: string;
  userId: string;
}): Promise<AutomaticReplyResult | null> {
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .eq("type", "ai")
    .eq("active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[TEMPLATES] Erro ao buscar respostas automáticas:", error);
    return null;
  }

  const templates = await hydrateTemplatesWithVariations(
    supabase,
    data || []
  );

  for (const template of templates) {
    if (!isAutomaticReplyTemplate(template)) continue;

    /*
     * Uma etapa posterior de fluxo não pode iniciar sozinha. Ela só é usada
     * quando o lead já está naquele fluxo.
     */
    if (
      flowMode(template) === "sequence" &&
      Number(template?.flow_step || 1) > 1
    ) {
      continue;
    }

    /*
     * Um fluxo concluído não reinicia sozinho quando o cliente repete a
     * palavra-chave inicial. Para reabrir o mesmo fluxo, o lead precisa ser
     * resetado manualmente ou receber uma nova campanha que limpe o marcador.
     */
    if (
      flowMode(template) === "sequence" &&
      getCompletedFlowGroup(lead) === getTemplateFlowGroup(template)
    ) {
      continue;
    }

    const keywords = extractKeywords(template);
    if (!keywords.length) continue;

    const matchMode =
      template?.match_type ||
      template?.match_mode ||
      "contains";

    const hit = keywords.some((keyword) =>
      templateMatchesMessage(message, keyword, matchMode)
    );

    if (!hit) continue;

    const [selection, extra] = await Promise.all([
      getTemplateVariation({
        supabase,
        template,
        companyId,
        userId,
      }),
      buildVariableContext({
        supabase,
        companyId,
        userId,
        lead,
        phone: lead?.phone,
        lastMessage: message,
      }),
    ]);

    return {
      reply: selection.text
        ? applyVariables(selection.text, lead, extra)
        : null,
      mediaUrl: template.media_url || null,
      mediaType: template.media_type || "text",
      currentTemplate: template,
      kanbanStatus: getTemplateKanbanStatus(template),
      notifyEnabled: Boolean(template.notify_enabled),
      notifyNumbers: getNotificationNumbers(template),
      notifyMessage: template.notify_message || null,
      source:
        flowMode(template) === "sequence"
          ? "flow_started"
          : "custom_trigger",
      selection: {
        index: selection.index,
        total: selection.total,
        variationId: selection.variationId,
        source: selection.source,
      },
    };
  }

  return null;
}

async function queryFlowTemplate({
  supabase,
  companyId,
  userId,
  step,
  group,
}: {
  supabase: any;
  companyId: string;
  userId: string;
  step: number;
  group?: string | null;
}) {
  /*
   * Primeiro tenta a coluna flow_group, caso ela exista na instalação.
   * Depois usa metadata.flow_group, que funciona sem migração adicional.
   */
  if (group && group !== "default") {
    const grouped = await supabase
      .from("message_templates")
      .select("*")
      .eq("company_id", companyId)
      .eq("owner_user_id", userId)
      .eq("type", "ai")
      .eq("active", true)
      .eq("flow_mode", "sequence")
      .eq("flow_step", step)
      .eq("flow_group", group)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!grouped.error && grouped.data) {
      return grouped;
    }

    const groupedError = String(grouped.error?.message || "");
    if (
      grouped.error &&
      !groupedError.includes("flow_group") &&
      !groupedError.includes("schema cache")
    ) {
      console.error("[FLOW] Erro ao buscar etapa por grupo:", grouped.error);
    }
  }

  const fallback = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .eq("type", "ai")
    .eq("active", true)
    .eq("flow_mode", "sequence")
    .eq("flow_step", step)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100);

  if (fallback.error) {
    return {
      data: null,
      error: fallback.error,
    };
  }

  const items = fallback.data || [];

  const selected =
    group && group !== "default"
      ? items.find(
          (item: any) => getTemplateFlowGroup(item) === group
        ) || null
      : items[0] || null;

  return {
    data: selected,
    error: null,
  };
}

async function getCurrentFlowTemplate({
  supabase,
  lead,
  companyId,
  userId,
}: {
  supabase: any;
  lead: any;
  companyId: string;
  userId: string;
}) {
  const step = getLeadFlowStep(lead);
  if (!step) return null;

  const group = getLeadFlowGroup(lead) || "default";

  const { data, error } = await queryFlowTemplate({
    supabase,
    companyId,
    userId,
    step,
    group,
  });

  if (error) {
    console.error("[FLOW] Erro ao buscar etapa atual:", {
      leadId: lead?.id,
      group,
      step,
      error,
    });
    return null;
  }

  if (!data) {
    console.warn("[FLOW] Etapa não encontrada; fluxo será encerrado:", {
      leadId: lead?.id,
      group,
      step,
    });

    await completeLeadFlowState({
      supabase,
      lead,
      group,
    });

    return null;
  }

  const [hydrated] = await hydrateTemplatesWithVariations(
    supabase,
    [data]
  );

  return hydrated || null;
}

async function advanceFlowStep({
  supabase,
  lead,
  currentTemplate,
}: {
  supabase: any;
  lead: any;
  currentTemplate: any;
}) {
  if (!currentTemplate || flowMode(currentTemplate) !== "sequence") {
    return lead;
  }

  const nextStep = Number(currentTemplate?.next_step || 0);
  const group = getTemplateFlowGroup(currentTemplate);

  if (!Number.isFinite(nextStep) || nextStep <= 0) {
    return completeLeadFlowState({
      supabase,
      lead,
      group,
    });
  }

  return persistLeadFlowState({
    supabase,
    lead,
    group,
    step: nextStep,
  });
}

async function getFinalAutomaticReply({
  supabase,
  message,
  lead,
  companyId,
  userId,
}: {
  supabase: any;
  message: string;
  lead: any;
  companyId: string;
  userId: string;
}): Promise<AutomaticReplyResult> {
  /*
   * REGRA PRINCIPAL DA V2:
   * 1) se existe fluxo ativo, continua a sequência;
   * 2) se não existe fluxo, procura uma resposta personalizada por gatilho;
   * 3) se nada casar, não responde automaticamente.
   */
  const currentFlow = await getCurrentFlowTemplate({
    supabase,
    lead,
    companyId,
    userId,
  });

  if (currentFlow) {
    const [selection, extra] = await Promise.all([
      getTemplateVariation({
        supabase,
        template: currentFlow,
        companyId,
        userId,
      }),
      buildVariableContext({
        supabase,
        companyId,
        userId,
        lead,
        phone: lead?.phone,
        lastMessage: message,
      }),
    ]);

    return {
      reply: selection.text
        ? applyVariables(selection.text, lead, extra)
        : null,
      mediaUrl: currentFlow.media_url || null,
      mediaType: currentFlow.media_type || "text",
      currentTemplate: currentFlow,
      kanbanStatus: getTemplateKanbanStatus(currentFlow),
      notifyEnabled: Boolean(currentFlow.notify_enabled),
      notifyNumbers: getNotificationNumbers(currentFlow),
      notifyMessage: currentFlow.notify_message || null,
      source: "flow_continued",
      selection: {
        index: selection.index,
        total: selection.total,
        variationId: selection.variationId,
        source: selection.source,
      },
    };
  }

  const triggered = await findTriggeredTemplate({
    supabase,
    message,
    lead,
    companyId,
    userId,
  });

  if (triggered) return triggered;

  return {
    reply: null,
    mediaUrl: null,
    mediaType: "text",
    currentTemplate: null,
    kanbanStatus: null,
    notifyEnabled: false,
    notifyNumbers: [],
    notifyMessage: null,
    source: "no_custom_template",
    selection: null,
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function replyAndSave({
  supabase,
  sessionId,
  phone,
  lid,
  remoteJid,
  lead,
  leadId,
  userId,
  reply,
  mediaUrl,
  mediaType,
  currentTemplate,
  selection,
}: any) {
  const destination = getDestination({
    lead,
    phone,
    lid,
    remoteJid,
  });

  const hasDestination = Boolean(
    destination.number ||
      destination.phone ||
      destination.lid ||
      destination.jid
  );

  if (!hasDestination) {
    console.warn("[WHATSAPP] Resposta ignorada: destino ausente", {
      leadId,
      leadName: lead?.name,
      leadPhone: lead?.phone,
      phone,
      lid,
      remoteJid,
    });

    return {
      sent: false,
      lead,
    };
  }

  const delaySeconds = Math.max(
    0,
    Math.min(Number(currentTemplate?.delay_seconds || 0), 30)
  );

  if (delaySeconds > 0) {
    await sleep(delaySeconds * 1000);
  }

  const basePayload = {
    sessionId,
    ...destination,
  };

  const messageMetadata = {
    template_id: currentTemplate?.id || null,
    template_name:
      currentTemplate?.name ||
      currentTemplate?.title ||
      null,
    template_type: currentTemplate?.type || null,
    flow_mode: currentTemplate?.flow_mode || null,
    flow_step: currentTemplate?.flow_step || null,
    variation_index:
      selection?.index !== undefined
        ? selection.index
        : null,
    variation_total:
      selection?.total !== undefined
        ? selection.total
        : null,
    variation_id: selection?.variationId || null,
    variation_source: selection?.source || null,
  };

  /*
   * Texto e mídia são enviados como eventos separados.
   *
   * Áudio do WhatsApp não exibe caption de forma confiável. Na versão
   * anterior o texto era enviado somente como legenda da mídia e, quando a
   * mídia era áudio, o cliente recebia apenas o áudio.
   *
   * Regra atual:
   * 1) envia o texto, quando existir;
   * 2) envia a mídia;
   * 3) salva os dois eventos no histórico do mesmo lead.
   */
  let sentSomething = false;

  if (reply) {
    const textResult = await sendToWhatsApp({
      ...basePayload,
      message: reply,
    });

    await saveSentMessage(supabase, {
      leadId,
      companyId: lead.company_id,
      branchId: lead.branch_id || null,
      userId,
      reply,
      mediaUrl: null,
      mediaType: "text",
      metadata: {
        ...messageMetadata,
        variation_counted: true,
      },
    });

    sentSomething = true;

    console.log("[WHATSAPP] Texto enviado:", {
      leadId,
      templateId: currentTemplate?.id,
      destination,
      result: textResult,
    });
  }

  if (mediaUrl) {
    const mediaResult = await sendMediaToWhatsApp({
      ...basePayload,
      mediaUrl,
      mediaType: mediaType || "document",
      caption: "",
      fileName:
        currentTemplate?.media_name ||
        currentTemplate?.name ||
        undefined,
    });

    await saveSentMessage(supabase, {
      leadId,
      companyId: lead.company_id,
      branchId: lead.branch_id || null,
      userId,
      reply: "",
      mediaUrl,
      mediaType: mediaType || "document",
      metadata: {
        attachment_template_id: currentTemplate?.id || null,
        attachment_of_message: Boolean(reply),
      },
    });

    sentSomething = true;

    console.log("[WHATSAPP] Mídia enviada:", {
      leadId,
      templateId: currentTemplate?.id,
      destination,
      result: mediaResult,
    });
  }

  if (!sentSomething) {
    return {
      sent: false,
      lead,
    };
  }

  const updatedLead = await advanceFlowStep({
    supabase,
    lead,
    currentTemplate,
  });

  return {
    sent: true,
    lead: updatedLead || lead,
  };
}

async function sendInternalNotification({
  sessionId,
  number,
  message,
}: {
  sessionId: string;
  number: string;
  message: string;
}) {
  const normalizedNumber = normalizePhone(number);

  if (!normalizedNumber || !message.trim()) {
    throw new Error(
      "Número ou mensagem da notificação interna inválido."
    );
  }

  return sendToWhatsApp({
    sessionId,
    number: normalizedNumber,
    message,
  });
}

function normalizeComparableName(value: any) {
  return normalizeText(value)
    .replace(/\b(da|de|do|das|dos|e)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesLookLikeSamePerson(a: any, b: any) {
  const nameA = normalizeComparableName(a);
  const nameB = normalizeComparableName(b);

  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;

  const partsA = nameA.split(" ").filter(Boolean);
  const partsB = nameB.split(" ").filter(Boolean);

  if (!partsA.length || !partsB.length) return false;

  // Nome único: só aceita se os dois nomes forem exatamente iguais.
  // Isso evita vincular "Angelica Andrade" ao lead "Gregory" só porque existe fila recente.
  if (partsA.length === 1 || partsB.length === 1) {
    return partsA.length === 1 &&
      partsB.length === 1 &&
      partsA[0] === partsB[0];
  }

  const firstA = partsA[0];
  const firstB = partsB[0];

  if (firstA !== firstB) return false;

  const common = partsA.filter((part) => partsB.includes(part));

  // Para nomes compostos, exige pelo menos primeiro nome + mais uma parte em comum.
  return common.length >= 2;
}

function isLidOnlyContact(phone?: string | null, lid?: string | null, remoteJid?: string | null) {
  return !normalizePhone(phone || "") &&
    (String(lid || "").includes("@lid") || String(remoteJid || "").includes("@lid"));
}

function isLeadCompatibleWithPushName(lead: any, pushName?: string | null) {
  const normalizedPushName = normalizeComparableName(pushName || "");
  const normalizedLeadName = normalizeComparableName(lead?.name || "");

  if (!normalizedPushName || !normalizedLeadName) return true;

  return namesLookLikeSamePerson(normalizedPushName, normalizedLeadName);
}

async function findLeadFromRecentQueue({
  supabase,
  companyId,
  userId,
  phone,
  lid,
  remoteJid,
  sessionId,
  pushName,
}: {
  supabase: any;
  companyId: string;
  userId: string;
  phone?: string | null;
  lid?: string | null;
  remoteJid?: string | null;
  sessionId?: number | string | null;
  pushName?: string | null;
}) {
  const normalizedPhone = normalizePhone(phone || "");
  const normalizedPushName = normalizeComparableName(pushName || "");

  /*
    REGRA DE SEGURANÇA:
    A fila recente só pode vincular um @lid ao lead original quando houver:
    1) telefone real batendo; OU
    2) LID/JID já salvo batendo; OU
    3) nome do WhatsApp compatível com o nome do lead.

    Nunca vincular apenas porque existe 1 item na fila.
    Esse era o bug que fazia mensagens da Angélica caírem na conversa do Gregory.
  */

  let query = supabase
    .from("automation_queue")
    .select("*")
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .not("lead_id", "is", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (sessionId !== undefined && sessionId !== null && String(sessionId) !== "") {
    query = query.eq("session_id", Number(sessionId));
  }

  const { data: queueItems, error: queueError } = await query;

  if (queueError) {
    console.error("ERRO BUSCAR FILA RECENTE PARA VINCULAR LID:", queueError);
    return null;
  }

  const items = queueItems || [];
  if (!items.length) return null;

  const leadIds = [
    ...new Set(items.map((item: any) => item.lead_id).filter(Boolean).map(String)),
  ];

  if (!leadIds.length) return null;

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .in("id", leadIds);

  if (leadsError) {
    console.error("ERRO BUSCAR LEADS DA FILA RECENTE:", leadsError);
    return null;
  }

  const leadMap: Map<string, any> = new Map(
  ((leads || []) as any[]).map((lead: any) => [String(lead.id), lead])
);

const scored: any[] = [];

for (const item of items as any[]) {
  const lead: any = leadMap.get(String(item.lead_id));

  if (!lead || !lead.id) continue;

    const itemPhone = normalizePhone(item.phone || "");
    const leadPhone = normalizePhone(lead.phone || lead.mobile || lead.telefone || "");

    const phoneMatches =
      Boolean(normalizedPhone) &&
      (normalizedPhone === itemPhone || normalizedPhone === leadPhone);

    const lidMatches =
      Boolean(lid) &&
      (lead.whatsapp_lid === lid || lead.remote_jid === lid);

    const remoteMatches =
      Boolean(remoteJid) &&
      (lead.remote_jid === remoteJid || lead.whatsapp_lid === remoteJid);

    const nameMatches =
      Boolean(normalizedPushName) &&
      namesLookLikeSamePerson(pushName, lead.name);

    if (!phoneMatches && !lidMatches && !remoteMatches && !nameMatches) {
      continue;
    }

    let score = 0;
    if (phoneMatches) score += 1000;
    if (lidMatches) score += 900;
    if (remoteMatches) score += 900;
    if (nameMatches) score += 600;
    if (item.batch_id || lead.batch_id) score += 80;

    const status = String(item.status || "").toLowerCase();
    if (["sent", "enviado", "delivered", "pending", "processing", "done", "completed"].includes(status)) {
      score += 30;
    }

    scored.push({
      score,
      lead,
      queue: item,
      phoneMatches,
      lidMatches,
      remoteMatches,
      nameMatches,
    });
  }

  const viable = scored
    .filter((item) => {
      if (item.phoneMatches || item.lidMatches || item.remoteMatches) return item.score >= 900;
      if (item.nameMatches) return item.score >= 600;
      return false;
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return (
        new Date(b.queue.updated_at || b.queue.created_at || 0).getTime() -
        new Date(a.queue.updated_at || a.queue.created_at || 0).getTime()
      );
    });

  if (!viable.length) {
    console.warn("LID_NAO_VINCULADO_A_FILA_COM_SEGURANCA:", {
      companyId,
      sessionId,
      pushName,
      lid,
      remoteJid,
      queueItems: items.length,
      candidates: scored.map((item) => ({
        lead_id: item.lead?.id,
        lead_name: item.lead?.name,
        score: item.score,
        phoneMatches: item.phoneMatches,
        lidMatches: item.lidMatches,
        remoteMatches: item.remoteMatches,
        nameMatches: item.nameMatches,
        batch_id: item.queue?.batch_id || item.lead?.batch_id || null,
      })),
    });
    return null;
  }

  const selected = viable[0];

  console.log("LEAD_VINCULADO_POR_FILA_RECENTE_LID:", {
    lead_id: selected.lead.id,
    lead_name: selected.lead.name,
    score: selected.score,
    pushName,
    lid,
    remoteJid,
    queue_id: selected.queue.id,
    phoneMatches: selected.phoneMatches,
    lidMatches: selected.lidMatches,
    remoteMatches: selected.remoteMatches,
    nameMatches: selected.nameMatches,
    batch_id: selected.queue.batch_id || selected.lead.batch_id || null,
  });

  return {
    ...selected.lead,
    _queueContext: selected.queue,
    _resolvedByRecentQueue: true,
  };
}

async function findLead({
  supabase,
  companyId,
  userId,
  phone,
  lid,
  remoteJid,
  sessionId,
  email,
  pushName,
}: {
  supabase: any;
  companyId: string;
  userId: string;
  phone: string;
  lid: string | null;
  remoteJid: string | null;
  pushName?: string | null;
  sessionId?: number | string | null;
  email?: string | null;
}) {
  const candidates: any[] = [];

  async function addCandidate(item: any, source: string) {
    if (!item?.id) return;

    const existing = candidates.find((lead) => lead.id === item.id);

    if (existing) {
      existing._sources = Array.from(new Set([...(existing._sources || []), source]));
      return;
    }

    candidates.push({
      ...item,
      _sources: [source],
    });
  }

  async function addByQuery(query: any, source: string) {
    try {
      const { data, error } = await query;
      if (error) {
        console.error("FIND LEAD QUERY ERROR:", error);
        return;
      }

      for (const item of data || []) {
        await addCandidate(item, source);
      }
    } catch (error) {
      console.error("FIND LEAD QUERY FAILED:", error);
    }
  }

  if (phone) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("owner_user_id", userId)
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(10),
      "phone"
    );
  }

  if (email) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("owner_user_id", userId)
        .eq("email", email)
        .order("updated_at", { ascending: false })
        .limit(10),
      "email"
    );
  }

  if (lid) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("owner_user_id", userId)
        .eq("whatsapp_lid", lid)
        .order("updated_at", { ascending: false })
        .limit(10),
      "lid"
    );
  }

  if (remoteJid) {
    await addByQuery(
      supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("owner_user_id", userId)
        .eq("remote_jid", remoteJid)
        .order("updated_at", { ascending: false })
        .limit(10),
      "remoteJid"
    );
  }

  /*
   * Não usamos mais "fila recente" para adivinhar o lead de uma mensagem
   * recebida. Um vínculo por proximidade/nome pode misturar duas conversas.
   *
   * O incoming agora aceita apenas identificadores exatos:
   * telefone, e-mail, whatsapp_lid ou remote_jid.
   * Se nenhum deles encontrar um lead, um novo contato é criado para aquele
   * LID/JID, sem contaminar o histórico de outro cliente.
   */

  if (!candidates.length) return null;

  const lidOnly = isLidOnlyContact(phone, lid, remoteJid);
  const normalizedPushName = normalizeComparableName(pushName || "");

  const safeCandidates = candidates.filter((lead) => {
    const sources = lead._sources || [];

    // Telefone/e-mail são identificadores fortes.
    if (sources.includes("phone") || sources.includes("email")) return true;

    /*
     * Para mensagens que chegam somente por @lid:
     * - com pushName, exige compatibilidade de nome;
     * - sem pushName, só reutiliza um lead que também seja exclusivamente LID.
     *
     * Um lead que já possui telefone real não será escolhido por um LID antigo
     * sem uma segunda evidência. É preferível criar um contato separado a
     * misturar duas conversas e responder a pessoa errada.
     */
    if (lidOnly) {
      if (normalizedPushName) {
        return isLeadCompatibleWithPushName(lead, pushName);
      }

      return !normalizePhone(
        lead?.phone ||
          lead?.mobile ||
          lead?.telefone ||
          ""
      );
    }

    return true;
  });

  if (!safeCandidates.length) {
    console.warn("LEAD_DESCARTADO_POR_INCOMPATIBILIDADE_DE_NOME:", {
      companyId,
      userId,
      phone,
      lid,
      remoteJid,
      pushName,
      candidates: candidates.map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        whatsapp_lid: lead.whatsapp_lid,
        remote_jid: lead.remote_jid,
        sources: lead._sources,
      })),
    });

    return null;
  }

  const lead = [...safeCandidates].sort((a, b) => {
    const aQueueBoost = a._resolvedByRecentQueue ? 1000 : 0;
    const bQueueBoost = b._resolvedByRecentQueue ? 1000 : 0;

    const aStrong =
      (a._sources || []).includes("phone") || (a._sources || []).includes("email")
        ? 1000
        : 0;

    const bStrong =
      (b._sources || []).includes("phone") || (b._sources || []).includes("email")
        ? 1000
        : 0;

    const aScore =
      aStrong +
      aQueueBoost +
      (a.phone ? 100 : 0) +
      (a.email ? 20 : 0) +
      (a.whatsapp_lid ? 10 : 0) +
      (a.remote_jid ? 10 : 0) +
      (a.batch_id ? 50 : 0);

    const bScore =
      bStrong +
      bQueueBoost +
      (b.phone ? 100 : 0) +
      (b.email ? 20 : 0) +
      (b.whatsapp_lid ? 10 : 0) +
      (b.remote_jid ? 10 : 0) +
      (b.batch_id ? 50 : 0);

    if (aScore !== bScore) return bScore - aScore;

    return (
      new Date(b.updated_at || b.created_at || 0).getTime() -
      new Date(a.updated_at || a.created_at || 0).getTime()
    );
  })[0];

  if (!lead?.id) return null;

  const queueContext = lead._queueContext || null;

  const patch: any = {
    updated_at: new Date().toISOString(),
  };

  /*
   * Só grava identificadores recebidos quando o lead foi encontrado por um
   * identificador forte ou pelo próprio LID/JID exato.
   */
  const leadSources = Array.isArray(lead?._sources) ? lead._sources : [];
  const strongIdentityMatch =
    leadSources.includes("phone") ||
    leadSources.includes("email") ||
    leadSources.includes("lid") ||
    leadSources.includes("remoteJid");

  if (strongIdentityMatch) {
    if (lid && !lead.whatsapp_lid) patch.whatsapp_lid = lid;
    if (remoteJid && !lead.remote_jid) patch.remote_jid = remoteJid;
  }

  if (phone && !lead.phone && isRealBrazilPhone(phone)) {
    patch.phone = normalizePhone(phone);
  }

  if (email && !lead.email) patch.email = email;
  if (sessionId && !lead.session_id) patch.session_id = Number(sessionId);

  const queueBatchId = queueContext?.batch_id || null;

  if (queueBatchId && !lead.batch_id) patch.batch_id = queueBatchId;

  if (Object.keys(patch).length > 1) {
    const { data, error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", lead.id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      return {
        ...data,
        _queueContext: queueContext,
        _resolvedByRecentQueue: lead._resolvedByRecentQueue || false,
      };
    }

    if (error) {
      console.error("ERRO AO ATUALIZAR IDENTIFICADORES DO LEAD:", error);
    }
  }

  return lead;
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const sentByUs =
      body?.fromMe === true ||
      body?.from_me === true ||
      clean(body?.direction).toLowerCase() === "sent";

    if (sentByUs) {
      return NextResponse.json({
        success: true,
        action: "outgoing_message_ignored",
      });
    }

    const remoteJid = getIncomingRemoteJid(body);

    if (String(remoteJid || "").includes("@g.us")) {
      return NextResponse.json({
        success: true,
        action: "group_message_ignored",
      });
    }

    const messageId = getIncomingMessageId(body);
    const rawPhone = clean(body.phone || "");
    const rawNumber = clean(body.number || "");

    const incomingIsLid =
      body.isLid === true ||
      body.is_lid === true ||
      clean(body.isLid || body.is_lid).toLowerCase() === "true" ||
      String(remoteJid || "").includes("@lid") ||
      String(body.lid || "").includes("@lid");

    const lid = incomingIsLid
      ? normalizeLid(body.lid || remoteJid)
      : null;

    /*
     * remoteJid é a identidade mais confiável da mensagem atual.
     * Não priorizamos body.phone/body.number quando existe um JID explícito,
     * pois alguns servidores usam "phone" para o número da sessão conectada.
     */
    const phoneFromRemoteJid =
      !incomingIsLid &&
      String(remoteJid || "").includes("@s.whatsapp.net")
        ? normalizePhone(String(remoteJid).split("@")[0])
        : "";

    const explicitSenderPhone = normalizePhone(
      body.senderPhone ||
        body.sender_phone ||
        body.contactPhone ||
        body.contact_phone ||
        ""
    );

    const phone = phoneFromRemoteJid
      ? phoneFromRemoteJid
      : explicitSenderPhone
        ? explicitSenderPhone
        : remoteJid
          ? ""
          : normalizePhone(rawPhone || rawNumber);

    const email = clean(body.email || body.customer_email || "");
    const incomingMedia = extractIncomingMedia(body);
    const explicitMessage = getIncomingText(body);
    const message =
      explicitMessage ||
      incomingMedia.caption ||
      "";
    const pushName = getIncomingPushName(body);

    const resolved = await resolveCompanyBySession(
      supabase,
      body.sessionId ||
        body.session_id ||
        body?.data?.sessionId ||
        body?.data?.session_id
    );

    const companyId = resolved.companyId;
    const branchId = resolved.branchId;
    const userId = resolved.userId;
    const sessionId = resolved.sessionId;
    const sendSessionId = buildSendSession(
      companyId,
      userId,
      sessionId
    );

    const mediaUrl = await persistIncomingMedia({
      supabase,
      companyId,
      userId,
      messageId,
      media: incomingMedia,
    });

    const hasMedia = Boolean(
      mediaUrl ||
        incomingMedia.base64 ||
        (
          incomingMedia.url &&
          !incomingMedia.encryptedWhatsappMedia
        )
    );

    const mediaDetected = Boolean(
      incomingMedia.mediaType
    );

    if (
      mediaDetected &&
      !mediaUrl
    ) {
      console.warn(
        "INCOMING_MEDIA_DETECTED_WITHOUT_PLAYABLE_URL:",
        {
          messageId: messageId || null,
          mediaType:
            incomingMedia.mediaType,
          mimeType:
            incomingMedia.mimeType,
          hasRawUrl:
            Boolean(incomingMedia.url),
          hasBase64:
            Boolean(incomingMedia.base64),
          encryptedWhatsappMedia:
            incomingMedia.encryptedWhatsappMedia,
          ptt: incomingMedia.ptt,
          seconds:
            incomingMedia.seconds,
        }
      );
    }

    const historyMessage =
      message ||
      mediaLabel(incomingMedia.mediaType);

    if (
      (!phone && !lid) ||
      (!message && !hasMedia && !mediaDetected)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Telefone/LID ou conteúdo da mensagem inválido.",
        },
        { status: 400 }
      );
    }

    let lead: any = await findLead({
      supabase,
      companyId,
      userId,
      phone,
      lid,
      remoteJid,
      pushName,
      sessionId,
      email,
    });

    if (!lead) {
      /*
       * Repete a busca antes do insert para diminuir duplicidade quando duas
       * mensagens do mesmo número chegam quase ao mesmo tempo.
       */
      lead = await findLead({
        supabase,
        companyId,
        userId,
        phone,
        lid,
        remoteJid,
        pushName,
        sessionId,
        email,
      });
    }

    if (!lead) {
      const { data: createdLead, error: createError } =
        await supabase
          .from("leads")
          .insert({
            company_id: companyId,
            branch_id: branchId,
            owner_user_id: userId,
            name: pushName || "Cliente WhatsApp",
            phone: isRealBrazilPhone(phone)
              ? normalizePhone(phone)
              : null,
            email: email || null,
            whatsapp_lid: lid || null,
            remote_jid: remoteJid || null,
            status: "novo",
            session_id: sessionId,
            ai_paused: false,
            conversation_stage: "new",
            current_flow_step: null,
            unread_count: 0,
            last_message: null,
            last_message_at: null,
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();

      if (createError) {
        /*
         * Se outro request criou o lead no mesmo instante, tenta localizar
         * novamente antes de devolver erro.
         */
        lead = await findLead({
          supabase,
          companyId,
          userId,
          phone,
          lid,
          remoteJid,
          pushName,
          sessionId,
          email,
        });

        if (!lead) {
          throw new Error(createError.message);
        }
      } else {
        lead = createdLead;
      }
    }

    const duplicated = await wasMessageAlreadyProcessed(
      supabase,
      companyId,
      userId,
      lead.id,
      messageId
    );

    if (duplicated) {
      return NextResponse.json({
        success: true,
        action: "duplicate_ignored",
        lead_id: lead.id,
      });
    }

    /*
     * Atualiza somente dados seguros do lead. Nunca substitui um telefone
     * real por @lid ou pelo número da sessão conectada.
     */
    const identityPatch: any = {};

    if (
      pushName &&
      (!clean(lead.name) ||
        ["cliente", "cliente whatsapp"].includes(
          normalizeText(lead.name)
        ))
    ) {
      identityPatch.name = pushName;
    }

    if (!lead.email && email) {
      identityPatch.email = email;
    }

    const leadSources = Array.isArray(lead?._sources) ? lead._sources : [];
    const exactLeadIdentity =
      leadSources.includes("phone") ||
      leadSources.includes("email") ||
      leadSources.includes("lid") ||
      leadSources.includes("remoteJid") ||
      (!leadSources.length && Boolean(lead?.id));

    if (exactLeadIdentity && !lead.whatsapp_lid && lid) {
      identityPatch.whatsapp_lid = lid;
    }

    if (exactLeadIdentity && !lead.remote_jid && remoteJid) {
      identityPatch.remote_jid = remoteJid;
    }

    if (
      !lead.phone &&
      isRealBrazilPhone(phone)
    ) {
      identityPatch.phone = normalizePhone(phone);
    }

    const queueContext = await getActiveQueueContext({
      supabase,
      companyId,
      userId,
      leadId: lead.id,
      phone: lead.phone || phone,
    });

    if (
      queueContext?.batch_id &&
      !lead.batch_id
    ) {
      identityPatch.batch_id = queueContext.batch_id;
    }

    if (Object.keys(identityPatch).length) {
      const { data: updatedIdentity, error: identityError } =
        await supabase
          .from("leads")
          .update({
            ...identityPatch,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
          .eq("company_id", companyId)
          .eq("owner_user_id", userId)
          .select("*")
          .maybeSingle();

      if (identityError) {
        console.error(
          "[LEAD] Erro ao atualizar identidade:",
          identityError
        );
      } else if (updatedIdentity) {
        lead = updatedIdentity;
      }
    }

    await saveReceivedMessage(supabase, {
      leadId: lead.id,
      companyId,
      branchId: lead.branch_id || branchId,
      userId,
      sessionId,
      message: historyMessage,
      messageId,
      mediaUrl: mediaUrl || incomingMedia.url,
      mediaType: incomingMedia.mediaType,
      mimeType: incomingMedia.mimeType,
      fileName: incomingMedia.fileName,
      caption: incomingMedia.caption,
      ptt: incomingMedia.ptt,
      durationSeconds:
        incomingMedia.seconds,
      mediaPending:
        Boolean(
          incomingMedia.mediaType &&
          !mediaUrl
        ),
      remoteJid,
      lid,
    });

    const intent = detectSalesIntent(message);
    const detectedStatus = statusFromIntent(intent);
    const statusAfterIncoming = chooseKanbanStatus(
      lead.status || "novo",
      detectedStatus,
      false
    );

    const { data: updatedLead, error: updateLeadError } =
      await supabase
        .from("leads")
        .update({
          status: statusAfterIncoming,
          unread_count:
            Number(lead.unread_count || 0) + 1,
          last_message: historyMessage,
          last_message_at: new Date().toISOString(),
          whatsapp_lid:
            lead.whatsapp_lid ||
            lid ||
            null,
          remote_jid:
            lead.remote_jid ||
            remoteJid ||
            null,
          email:
            lead.email ||
            email ||
            null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id)
        .eq("company_id", companyId)
        .eq("owner_user_id", userId)
        .select("*")
        .maybeSingle();

    if (updateLeadError) {
      throw new Error(
        `Não foi possível atualizar o lead: ${updateLeadError.message}`
      );
    }

    if (updatedLead) {
      lead = updatedLead;
    } else {
      lead = {
        ...lead,
        status: statusAfterIncoming,
        unread_count:
          Number(lead.unread_count || 0) + 1,
        last_message: historyMessage,
      };
    }

    if (lead.ai_paused === true) {
      return NextResponse.json({
        success: true,
        action: "automatic_reply_paused",
        intent,
        kanban_status: lead.status,
        lead_id: lead.id,
      });
    }

    /*
     * Em estágios concluídos, respostas curtas não reabrem automações.
     * Fluxos ativos continuam tendo prioridade e não entram neste bloqueio.
     */
    const simpleReplies = new Set([
      "ok",
      "obrigado",
      "obrigada",
      "valeu",
      "blz",
      "beleza",
      "👍",
      "sim",
      "certo",
      "combinado",
    ]);

    const hasActiveFlow = Boolean(
      getLeadFlowStep(lead)
    );

    if (
      !hasActiveFlow &&
      LOCKED_KANBAN_STATUS.has(
        normalizeKanbanStatus(lead.status) || ""
      ) &&
      simpleReplies.has(normalizeText(message))
    ) {
      return NextResponse.json({
        success: true,
        action: "closed_conversation_short_reply_ignored",
        intent,
        kanban_status: lead.status,
        lead_id: lead.id,
      });
    }

    const finalReply = message
      ? await getFinalAutomaticReply({
          supabase,
          message,
          lead,
          companyId,
          userId,
        })
      : {
          reply: null,
          mediaUrl: null,
          mediaType: "text",
          currentTemplate: null,
          kanbanStatus: null,
          notifyEnabled: false,
          notifyNumbers: [],
          notifyMessage: null,
          source: "media_without_text",
          selection: null,
        };

    let replied = false;
    let sendError: string | null = null;

    if (finalReply.reply || finalReply.mediaUrl) {
      console.log(
        "[AUTOMATION] Template selecionado:",
        {
          leadId: lead.id,
          companyId,
          userId,
          source: finalReply.source,
          templateId:
            finalReply.currentTemplate?.id ||
            null,
          templateName:
            finalReply.currentTemplate?.name ||
            null,
          variation:
            finalReply.selection,
        }
      );

      try {
        const sendResult = await replyAndSave({
          supabase,
          sessionId: sendSessionId,
          phone,
          lid,
          remoteJid,
          lead,
          leadId: lead.id,
          userId,
          reply: finalReply.reply,
          mediaUrl: finalReply.mediaUrl,
          mediaType: finalReply.mediaType,
          currentTemplate:
            finalReply.currentTemplate,
          selection:
            finalReply.selection,
        });

        replied = Boolean(sendResult?.sent);

        if (sendResult?.lead) {
          lead = sendResult.lead;
        }
      } catch (error: any) {
        sendError =
          error?.message ||
          String(error);

        console.error(
          "[AUTOMATION] Falha ao responder WhatsApp:",
          {
            leadId: lead.id,
            templateId:
              finalReply.currentTemplate?.id,
            error,
          }
        );
      }
    } else {
      console.log(
        "[AUTOMATION] Nenhum template personalizado correspondeu:",
        {
          leadId: lead.id,
          companyId,
          userId,
          message,
        }
      );
    }

    const explicitTemplateStatus =
      normalizeKanbanStatus(
        finalReply.kanbanStatus
      );

    const fallbackSalesStatus =
      shouldForceSalesStatus(
        message,
        intent,
        finalReply.reply
      )
        ? "em_negociacao"
        : null;

    /*
     * PRIORIDADE V8:
     * 1. kanban_status salvo na automação em "Mensagens";
     * 2. intenção comercial forte detectada;
     * 3. status de resposta já aplicado quando a mensagem entrou.
     */
    const requestedKanbanStatus =
      explicitTemplateStatus ||
      fallbackSalesStatus;

    if (requestedKanbanStatus) {
      lead = await updateLeadKanbanStatus({
        supabase,
        lead,
        companyId,
        userId,
        candidate: requestedKanbanStatus,
        explicit: Boolean(
          explicitTemplateStatus
        ),
      });
    }

    let notifySent = false;
    const notifyErrors: string[] = [];

    if (
      replied &&
      finalReply.notifyEnabled &&
      finalReply.notifyNumbers.length
    ) {
      const notificationExtra =
        await buildVariableContext({
          supabase,
          companyId,
          userId,
          lead,
          phone:
            lead.phone ||
            phone ||
            "",
          lastMessage: message,
        });

      const internalMessage =
        applyVariables(
          finalReply.notifyMessage ||
            "🚨 Novo atendimento comercial\n\nCliente: {cliente}\nTelefone: {telefone}\n\nÚltima mensagem:\n{ultima_mensagem}\n\nAbrir conversa:\n{link_whatsapp}",
          lead,
          notificationExtra
        );

      const results = await Promise.allSettled(
        finalReply.notifyNumbers.map(
          (number) =>
            sendInternalNotification({
              sessionId: sendSessionId,
              number,
              message: internalMessage,
            })
        )
      );

      notifySent = results.some(
        (result) =>
          result.status === "fulfilled"
      );

      for (const result of results) {
        if (result.status === "rejected") {
          notifyErrors.push(
            result.reason?.message ||
              String(result.reason)
          );
        }
      }

      if (notifyErrors.length) {
        console.error(
          "[NOTIFICATION] Falhas ao avisar equipe:",
          notifyErrors
        );
      }
    }

    return NextResponse.json({
      success: !sendError,
      action: replied
        ? "custom_automatic_reply_sent"
        : sendError
          ? "automatic_reply_failed"
          : "kanban_updated_without_reply",
      intent,
      source: finalReply.source,
      template_id:
        finalReply.currentTemplate?.id ||
        null,
      variation:
        finalReply.selection,
      lead_id: lead.id,
      company_id: companyId,
      phone:
        lead.phone ||
        phone ||
        "",
      lid: lid || null,
      session_id: sessionId,
      send_session_id: sendSessionId,
      kanban_status:
        lead.status ||
        statusAfterIncoming,
      replied,
      send_error: sendError,
      media_saved: Boolean(
        mediaUrl ||
        incomingMedia.url
      ),
      media_type:
        incomingMedia.mediaType ||
        null,
      owner_user_id: userId,
      notify_sent: notifySent,
      notify_errors: notifyErrors,
    }, {
      status: sendError ? 502 : 200,
    });
  } catch (error: any) {
    console.error(
      "[WHATSAPP INCOMING V2] Erro:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          String(error),
        stack:
          process.env.NODE_ENV ===
          "development"
            ? error?.stack
            : undefined,
      },
      { status: 500 }
    );
  }
}
