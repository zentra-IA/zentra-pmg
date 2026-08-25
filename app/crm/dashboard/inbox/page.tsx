"use client";

import {
  ChangeEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  prospect: "Prospect",
  campanha: "Em campanha",
  enviado: "Enviado",
  respondeu: "Respondeu",
  cotacao: "Cotação",
  comprou: "Comprou",
  pedido: "Pedido",
  cliente_ativo: "Cliente ativo",
  cliente_risco: "Cliente em risco",
  inativo: "Inativo",
  reagendar_futuro: "Contatar depois",
  sem_interesse: "Sem interesse",
};

const ACCEPTED_MEDIA =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

type MediaDraft = {
  file: File;
  base64: string;
  kind: "image" | "video" | "audio" | "document";
  previewUrl: string | null;
};

function normalizeStatus(status?: string | null) {
  const map: Record<string, string> = {
    respondido: "respondeu",
    interesse: "cotacao",
    finalizado: "comprou",
  };

  const normalized = String(
    status || "novo"
  ).toLowerCase();

  return map[normalized] || normalized;
}

function isMine(message: any) {
  const direction = String(
    message?.direction || ""
  ).toLowerCase();

  return (
    ["sent", "out", "outgoing", "outbound"].includes(
      direction
    ) ||
    message?.fromMe === true ||
    message?.role === "assistant"
  );
}

function messageText(message: any) {
  return (
    message?.content ||
    message?.body ||
    message?.text ||
    message?.message ||
    ""
  );
}

function getPayload(message: any) {
  return message?.payload &&
    typeof message.payload === "object"
    ? message.payload
    : {};
}

function getMediaData(message: any) {
  const payload = getPayload(message);

  const type = String(
    message?.media_type ||
      message?.extension ||
      payload?.media_type ||
      "text"
  ).toLowerCase();

  return {
    type,
    url:
      message?.media_url ||
      payload?.media_url ||
      payload?.mediaUrl ||
      null,
    mime:
      message?.mime_type ||
      payload?.mime_type ||
      payload?.mimeType ||
      null,
    fileName:
      message?.file_name ||
      payload?.file_name ||
      payload?.fileName ||
      null,
    caption:
      message?.caption ||
      payload?.caption ||
      null,
  };
}

function mediaKindFromFile(
  file: File
): MediaDraft["kind"] {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  return "document";
}

function fileToBase64(file: File) {
  return new Promise<string>(
    (resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(
          reader.result || ""
        );

        const comma = result.indexOf(",");

        resolve(
          comma >= 0
            ? result.slice(comma + 1)
            : result
        );
      };

      reader.onerror = () =>
        reject(
          new Error(
            "Não foi possível ler o arquivo."
          )
        );

      reader.readAsDataURL(file);
    }
  );
}

function formatDate(value: unknown) {
  if (!value) return "";

  const date = new Date(
    String(value)
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return date.toLocaleString(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  );
}

function displayName(lead: any) {
  return (
    lead?.custom_name ||
    lead?.name ||
    lead?.nome ||
    lead?.company_name ||
    lead?.phone ||
    "Cliente"
  );
}

function phoneDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function phoneFromLead(lead: any) {
  const direct = phoneDigits(
    lead?.phone ||
      lead?.mobile ||
      lead?.telefone
  );

  if (direct) return direct;

  const remoteJid = String(
    lead?.remote_jid || ""
  );

  if (remoteJid.includes("@s.whatsapp.net")) {
    return phoneDigits(
      remoteJid.split("@")[0]
    );
  }

  return "";
}

function formatPhoneBR(value: unknown) {
  let digits = phoneDigits(value);

  if (!digits) return "";

  if (digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `+55 (${digits.slice(0, 2)}) ${digits.slice(
      2,
      7
    )}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `+55 (${digits.slice(0, 2)}) ${digits.slice(
      2,
      6
    )}-${digits.slice(6)}`;
  }

  return `+${phoneDigits(value)}`;
}

function whatsappSessionId(lead: any): number | null {
  const candidates = [
    lead?.whatsapp_session_id,
    lead?.last_message_session_id,
    lead?.session_id,
  ];

  for (const value of candidates) {
    const parsed = Number(value);

    if (
      Number.isInteger(parsed) &&
      parsed >= 1 &&
      parsed <= 5
    ) {
      return parsed;
    }
  }

  return null;
}

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(rest).padStart(2, "0")}`;
}

function renderMedia(message: any) {
  const media = getMediaData(message);

  if (!media.url) return null;

  if (
    media.type === "image" ||
    String(media.mime || "").startsWith(
      "image/"
    )
  ) {
    return (
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className="media-link"
      >
        <img
          src={media.url}
          alt={
            media.fileName ||
            "Imagem recebida"
          }
          className="message-image"
        />
      </a>
    );
  }

  if (
    media.type === "video" ||
    String(media.mime || "").startsWith(
      "video/"
    )
  ) {
    return (
      <video
        className="message-video"
        controls
        preload="metadata"
        src={media.url}
      />
    );
  }

  if (
    media.type === "audio" ||
    String(media.mime || "").startsWith(
      "audio/"
    )
  ) {
    return (
      <audio
        className="message-audio"
        controls
        preload="metadata"
        src={media.url}
      />
    );
  }

  return (
    <a
      className="document-link"
      href={media.url}
      target="_blank"
      rel="noreferrer"
      download={media.fileName || true}
    >
      <span>📎</span>
      <span>
        {media.fileName ||
          "Abrir documento"}
      </span>
    </a>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function InboxPage() {
  const [leads, setLeads] =
    useState<any[]>([]);

  const [
    selectedLead,
    setSelectedLead,
  ] = useState<any>(null);

  const [messages, setMessages] =
    useState<any[]>([]);

  const [text, setText] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [aiUpdating, setAiUpdating] =
    useState(false);

  const [
    conversationAction,
    setConversationAction,
  ] = useState<
    "rename" | "delete" | null
  >(null);

  const [
    nameDraft,
    setNameDraft,
  ] = useState("");

  const [
    actionSaving,
    setActionSaving,
  ] = useState(false);

  const [
    mediaDraft,
    setMediaDraft,
  ] = useState<MediaDraft | null>(
    null
  );

  const [
    isRecording,
    setIsRecording,
  ] = useState(false);

  const [
    recordingSeconds,
    setRecordingSeconds,
  ] = useState(0);

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(
      null
    );

  const recordingStreamRef =
    useRef<MediaStream | null>(
      null
    );

  const recordingChunksRef =
    useRef<Blob[]>([]);

  const recordingTimerRef =
    useRef<number | null>(
      null
    );

  const discardRecordingRef =
    useRef(false);

  const [mobileChatOpen, setMobileChatOpen] =
    useState(false);

  const bottomRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const filteredLeads = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase();

    if (!term) return leads;

    return leads.filter((lead) =>
      [
        displayName(lead),
        lead?.phone,
        lead?.email,
        lead?.last_message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [leads, search]);

  async function loadInbox(
    leadId?: string,
    silent = false
  ) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const url = leadId
        ? `/api/crm/inbox?leadId=${encodeURIComponent(
            leadId
          )}&t=${Date.now()}`
        : `/api/crm/inbox?t=${Date.now()}`;

      const response = await fetch(
        url,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Erro ao carregar inbox."
        );
      }

      if (leadId) {
        const raw =
          data?.messages ||
          data?.items ||
          data;

        setMessages(
          Array.isArray(raw)
            ? raw
            : []
        );

        return;
      }

      const raw =
        data?.leads ||
        data?.items ||
        data?.data ||
        data?.customers ||
        data?.conversations ||
        data;

      const items = Array.isArray(raw)
        ? raw
        : [];

      setLeads(items);

      setSelectedLead(
        (current: any) => {
          if (!current && items[0]) {
            return items[0];
          }

          if (!current) {
            return null;
          }

          return (
            items.find(
              (item: any) =>
                item.id === current.id
            ) || current
          );
        }
      );
    } catch (error: any) {
      if (!silent) {
        alert(
          error?.message ||
            "Erro ao carregar inbox."
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function sendMessage() {
    if (
      !selectedLead ||
      sending
    ) {
      return;
    }

    if (
      !text.trim() &&
      !mediaDraft
    ) {
      return;
    }

    setSending(true);

    try {
      const body: Record<
        string,
        unknown
      > = {
        leadId: selectedLead.id,
        message: text.trim(),
      };

      if (mediaDraft) {
        body.base64 =
          mediaDraft.base64;
        body.mediaType =
          mediaDraft.kind;
        body.mimeType =
          mediaDraft.file.type ||
          "application/octet-stream";
        body.fileName =
          mediaDraft.file.name;
        body.caption =
          text.trim();
      }

      const response = await fetch(
        "/api/whatsapp/inbox-send",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Erro ao enviar mensagem."
        );
      }

      setText("");
      clearMediaDraft();

      await Promise.all([
        loadInbox(
          selectedLead.id,
          true
        ),
        loadInbox(
          undefined,
          true
        ),
      ]);
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao enviar mensagem."
      );
    } finally {
      setSending(false);
    }
  }

  async function toggleAI() {
    if (!selectedLead || aiUpdating) return;

    const nextPaused = !Boolean(
      selectedLead.ai_paused
    );

    setAiUpdating(true);

    try {
      const response = await fetch(
        "/api/crm/inbox",
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            leadId: selectedLead.id,
            ai_paused: nextPaused,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Erro ao atualizar a IA."
        );
      }

      const updatedLead =
        data?.lead || {
          ...selectedLead,
          ai_paused: nextPaused,
        };

      setSelectedLead(
        updatedLead
      );

      setLeads((current) =>
        current.map((lead) =>
          String(lead.id) ===
          String(selectedLead.id)
            ? {
                ...lead,
                ...updatedLead,
                ai_paused:
                  updatedLead.ai_paused ??
                  nextPaused,
              }
            : lead
        )
      );
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao atualizar a IA."
      );
    } finally {
      setAiUpdating(false);
    }
  }

  async function updateStatus(
    status: string
  ) {
    if (!selectedLead) return;

    const response = await fetch(
      "/api/crm/inbox",
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          leadId: selectedLead.id,
          status,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      alert(
        data?.error ||
          "Erro ao atualizar status."
      );
      return;
    }

    setSelectedLead((current: any) => ({
      ...current,
      status,
    }));

    await loadInbox(
      undefined,
      true
    );
  }

  function openRenameContact() {
    if (!selectedLead) return;

    setNameDraft(
      displayName(selectedLead)
    );
    setConversationAction(
      "rename"
    );
  }

  async function saveCustomName() {
    if (
      !selectedLead ||
      actionSaving
    ) {
      return;
    }

    const customName =
      nameDraft.trim();

    if (!customName) {
      alert(
        "Digite um nome para o contato."
      );
      return;
    }

    setActionSaving(true);

    try {
      const response = await fetch(
        "/api/crm/inbox",
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            leadId:
              selectedLead.id,
            custom_name:
              customName,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Erro ao salvar o nome."
        );
      }

      const updatedLead =
        data?.lead || {
          ...selectedLead,
          custom_name:
            customName,
        };

      setSelectedLead(
        (current: any) => ({
          ...current,
          ...updatedLead,
          custom_name:
            updatedLead.custom_name ||
            customName,
        })
      );

      setLeads((current) =>
        current.map((lead) =>
          String(lead.id) ===
          String(
            selectedLead.id
          )
            ? {
                ...lead,
                ...updatedLead,
                custom_name:
                  updatedLead.custom_name ||
                  customName,
              }
            : lead
        )
      );

      setConversationAction(
        null
      );
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao salvar o nome."
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function deleteConversation() {
    if (
      !selectedLead ||
      actionSaving
    ) {
      return;
    }

    const deletingId =
      String(selectedLead.id);

    setActionSaving(true);

    try {
      const response = await fetch(
        "/api/crm/inbox",
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            leadId: deletingId,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Erro ao excluir a conversa."
        );
      }

      const remaining =
        leads.filter(
          (lead) =>
            String(lead.id) !==
            deletingId
        );

      const nextLead =
        remaining[0] || null;

      setLeads(remaining);
      setSelectedLead(nextLead);
      setMessages([]);
      setConversationAction(
        null
      );
      setMobileChatOpen(false);

      if (nextLead?.id) {
        await loadInbox(
          nextLead.id,
          true
        );
      }
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao excluir a conversa."
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      alert(
        "O arquivo excede o limite de 100 MB."
      );
      return;
    }

    try {
      const kind =
        mediaKindFromFile(file);

      const base64 =
        await fileToBase64(file);

      setMediaDraft({
        file,
        base64,
        kind,
        previewUrl:
          kind === "image" ||
          kind === "video" ||
          kind === "audio"
            ? URL.createObjectURL(
                file
              )
            : null,
      });
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao carregar arquivo."
      );
    }
  }

  function stopRecordingTimer() {
    if (
      recordingTimerRef.current !==
      null
    ) {
      window.clearInterval(
        recordingTimerRef.current
      );

      recordingTimerRef.current =
        null;
    }
  }

  function stopRecordingStream() {
    recordingStreamRef.current
      ?.getTracks()
      .forEach((track) =>
        track.stop()
      );

    recordingStreamRef.current =
      null;
  }

  async function startRecording() {
    if (
      isRecording ||
      sending
    ) {
      return;
    }

    if (
      typeof navigator ===
        "undefined" ||
      !navigator.mediaDevices
        ?.getUserMedia ||
      typeof MediaRecorder ===
        "undefined"
    ) {
      alert(
        "Este navegador não permite gravar áudio pelo microfone."
      );
      return;
    }

    try {
      clearMediaDraft();

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }
        );

      const mimeCandidates = [
        "audio/ogg;codecs=opus",
        "audio/webm;codecs=opus",
        "audio/webm",
      ];

      const mimeType =
        mimeCandidates.find(
          (candidate) =>
            MediaRecorder.isTypeSupported(
              candidate
            )
        ) || "";

      const recorder = mimeType
        ? new MediaRecorder(
            stream,
            {
              mimeType,
            }
          )
        : new MediaRecorder(
            stream
          );

      recordingStreamRef.current =
        stream;

      mediaRecorderRef.current =
        recorder;

      recordingChunksRef.current =
        [];

      discardRecordingRef.current =
        false;

      recorder.ondataavailable = (
        event
      ) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(
            event.data
          );
        }
      };

      recorder.onstop = async () => {
        const discard =
          discardRecordingRef.current;

        const chunks =
          recordingChunksRef.current;

        recordingChunksRef.current =
          [];

        stopRecordingTimer();
        stopRecordingStream();

        mediaRecorderRef.current =
          null;

        setIsRecording(false);
        setRecordingSeconds(0);

        if (
          discard ||
          !chunks.length
        ) {
          return;
        }

        try {
          const type =
            recorder.mimeType ||
            mimeType ||
            "audio/webm";

          const extension =
            type.includes("ogg")
              ? "ogg"
              : type.includes("mp4")
                ? "m4a"
                : "webm";

          const blob = new Blob(
            chunks,
            {
              type,
            }
          );

          const file = new File(
            [blob],
            `audio-${Date.now()}.${extension}`,
            {
              type,
            }
          );

          const base64 =
            await fileToBase64(
              file
            );

          setMediaDraft({
            file,
            base64,
            kind: "audio",
            previewUrl:
              URL.createObjectURL(
                blob
              ),
          });
        } catch (error: any) {
          alert(
            error?.message ||
              "Não foi possível preparar o áudio gravado."
          );
        }
      };

      recorder.start(250);

      setRecordingSeconds(0);
      setIsRecording(true);

      recordingTimerRef.current =
        window.setInterval(
          () => {
            setRecordingSeconds(
              (current) =>
                current + 1
            );
          },
          1000
        );
    } catch (error: any) {
      stopRecordingTimer();
      stopRecordingStream();

      setIsRecording(false);
      setRecordingSeconds(0);

      alert(
        error?.name ===
          "NotAllowedError"
          ? "Permita o acesso ao microfone no navegador para gravar áudio."
          : error?.message ||
              "Não foi possível iniciar a gravação."
      );
    }
  }

  function finishRecording() {
    const recorder =
      mediaRecorderRef.current;

    if (
      !recorder ||
      recorder.state ===
        "inactive"
    ) {
      return;
    }

    discardRecordingRef.current =
      false;

    recorder.stop();
  }

  function cancelRecording() {
    const recorder =
      mediaRecorderRef.current;

    discardRecordingRef.current =
      true;

    if (
      recorder &&
      recorder.state !==
        "inactive"
    ) {
      recorder.stop();
      return;
    }

    stopRecordingTimer();
    stopRecordingStream();
    setIsRecording(false);
    setRecordingSeconds(0);
  }

  function clearMediaDraft() {
    setMediaDraft(
      (current) => {
        if (
          current?.previewUrl
        ) {
          URL.revokeObjectURL(
            current.previewUrl
          );
        }

        return null;
      }
    );
  }

  function openConversation(
    lead: any
  ) {
    setSelectedLead(lead);
    setMobileChatOpen(true);
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  }

  useEffect(() => {
    loadInbox();

    const interval =
      window.setInterval(() => {
        loadInbox(undefined, true);

        if (selectedLead?.id) {
          loadInbox(
            selectedLead.id,
            true
          );
        }
      }, 10_000);

    return () =>
      window.clearInterval(
        interval
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedLead?.id) {
      loadInbox(
        selectedLead.id,
        true
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (
        mediaDraft?.previewUrl
      ) {
        URL.revokeObjectURL(
          mediaDraft.previewUrl
        );
      }
    };
  }, [mediaDraft?.previewUrl]);

  useEffect(() => {
    return () => {
      discardRecordingRef.current =
        true;

      const recorder =
        mediaRecorderRef.current;

      if (
        recorder &&
        recorder.state !==
          "inactive"
      ) {
        recorder.stop();
      }

      stopRecordingTimer();
      stopRecordingStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="inbox-page">
      <section className="hero">
        <div>
          <p className="kicker">
            Zentra Sales AI · PMG
          </p>
          <h1>Inbox WhatsApp</h1>
          <p>
            Histórico completo de texto, imagem, áudio,
            vídeo e documentos, separado por vendedor.
          </p>
        </div>

        <button
          className="button secondary"
          onClick={() => {
            loadInbox();

            if (
              selectedLead?.id
            ) {
              loadInbox(
                selectedLead.id
              );
            }
          }}
        >
          Atualizar
        </button>
      </section>

      <section className="metrics">
        <Metric
          label="Conversas"
          value={leads.length}
        />
        <Metric
          label="Cliente aberto"
          value={
            selectedLead ? 1 : 0
          }
        />
        <Metric
          label="Mensagens"
          value={messages.length}
        />
      </section>

      <section
        className={`inbox-shell ${
          mobileChatOpen
            ? "mobile-chat-open"
            : ""
        }`}
      >
        <aside className="conversation-panel">
          <div className="conversation-header">
            <h2>Conversas</h2>

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Buscar cliente..."
            />
          </div>

          <div className="conversation-list">
            {filteredLeads.map(
              (lead) => (
                <button
                  key={lead.id}
                  className={`conversation-item ${
                    selectedLead?.id ===
                    lead.id
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    openConversation(
                      lead
                    )
                  }
                >
                  <div className="avatar">
                    {displayName(
                      lead
                    )
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>

                  <div className="conversation-copy">
                    <strong>
                      {displayName(
                        lead
                      )}
                    </strong>

                    <span>
                      {lead.last_message ||
                        lead.lastMessage ||
                        "-"}
                    </span>

                    <div className="conversation-contact-meta">
                      {phoneFromLead(
                        lead
                      ) ? (
                        <em>
                          📱{" "}
                          {formatPhoneBR(
                            phoneFromLead(
                              lead
                            )
                          )}
                        </em>
                      ) : (
                        <em>
                          📱 Número não identificado
                        </em>
                      )}

                      {whatsappSessionId(
                        lead
                      ) && (
                        <em className="wa-session-mini">
                          WhatsApp{" "}
                          {whatsappSessionId(
                            lead
                          )}
                        </em>
                      )}
                    </div>

                    <small>
                      {STATUS_LABELS[
                        normalizeStatus(
                          lead.status
                        )
                      ] ||
                        normalizeStatus(
                          lead.status
                        )}
                    </small>
                  </div>

                  {Number(
                    lead.unread_count ||
                      0
                  ) > 0 && (
                    <b className="unread">
                      {lead.unread_count}
                    </b>
                  )}
                </button>
              )
            )}

            {!filteredLeads.length && (
              <div className="empty">
                {loading
                  ? "Carregando..."
                  : "Nenhuma conversa encontrada."}
              </div>
            )}
          </div>
        </aside>

        <section className="chat-panel">
          {selectedLead ? (
            <>
              <header className="chat-header">
                <button
                  className="mobile-back"
                  onClick={() =>
                    setMobileChatOpen(
                      false
                    )
                  }
                >
                  ←
                </button>

                <div className="avatar large">
                  {displayName(
                    selectedLead
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </div>

                <div className="chat-person">
                  <div className="chat-person-title-row">
                    <h2>
                      {displayName(
                        selectedLead
                      )}
                    </h2>

                    <div className="contact-actions">
                      <button
                        type="button"
                        className="contact-action"
                        onClick={
                          openRenameContact
                        }
                        title="Editar nome do contato"
                        aria-label="Editar nome do contato"
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        className="contact-action danger"
                        onClick={() =>
                          setConversationAction(
                            "delete"
                          )
                        }
                        title="Excluir conversa"
                        aria-label="Excluir conversa"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="contact-meta-row">
                    <span className="contact-phone">
                      📱{" "}
                      {phoneFromLead(
                        selectedLead
                      )
                        ? formatPhoneBR(
                            phoneFromLead(
                              selectedLead
                            )
                          )
                        : "Número não identificado"}
                    </span>

                    {whatsappSessionId(
                      selectedLead
                    ) ? (
                      <span className="whatsapp-session-badge">
                        WhatsApp{" "}
                        {whatsappSessionId(
                          selectedLead
                        )}
                      </span>
                    ) : (
                      <span className="whatsapp-session-badge unknown">
                        WhatsApp não identificado
                      </span>
                    )}
                  </div>
                </div>

                <div className="ai-control">
                  <span
                    className={`ai-status ${
                      selectedLead.ai_paused
                        ? "paused"
                        : "active"
                    }`}
                  >
                    <i />
                    {selectedLead.ai_paused
                      ? "IA pausada"
                      : "IA ativa"}
                  </span>

                  <button
                    type="button"
                    className={`ai-toggle ${
                      selectedLead.ai_paused
                        ? "activate"
                        : "pause"
                    }`}
                    onClick={toggleAI}
                    disabled={aiUpdating}
                    title={
                      selectedLead.ai_paused
                        ? "Reativar respostas automáticas"
                        : "Pausar respostas automáticas"
                    }
                  >
                    {aiUpdating
                      ? "Salvando..."
                      : selectedLead.ai_paused
                        ? "Ativar IA"
                        : "Pausar IA"}
                  </button>
                </div>

                <select
                  className="status-select"
                  value={normalizeStatus(
                    selectedLead.status
                  )}
                  onChange={(event) =>
                    updateStatus(
                      event.target.value
                    )
                  }
                >
                  {Object.entries(
                    STATUS_LABELS
                  ).map(
                    ([
                      key,
                      value,
                    ]) => (
                      <option
                        key={key}
                        value={key}
                      >
                        {value}
                      </option>
                    )
                  )}
                </select>
              </header>

              <div className="message-list">
                {messages.map(
                  (
                    message,
                    index
                  ) => {
                    const mine =
                      isMine(
                        message
                      );

                    const media =
                      getMediaData(
                        message
                      );

                    const content =
                      messageText(
                        message
                      );

                    return (
                      <div
                        key={
                          message.id ||
                          index
                        }
                        className={`message-row ${
                          mine
                            ? "mine"
                            : "theirs"
                        }`}
                      >
                        <article className="message-bubble">
                          {renderMedia(
                            message
                          )}

                          {content &&
                            content !==
                              "Mensagem" && (
                              <p>
                                {
                                  content
                                }
                              </p>
                            )}

                          {!content &&
                            media.caption && (
                              <p>
                                {
                                  media.caption
                                }
                              </p>
                            )}

                          <time>
                            {formatDate(
                              message.created_at
                            )}
                          </time>
                        </article>
                      </div>
                    );
                  }
                )}

                {!messages.length &&
                  !loading && (
                    <div className="empty messages-empty">
                      Ainda não há mensagens
                      salvas nesta conversa.
                    </div>
                  )}

                <div ref={bottomRef} />
              </div>

              {mediaDraft && (
                <div className="media-preview">
                  <div>
                    {mediaDraft.kind ===
                      "image" &&
                      mediaDraft.previewUrl && (
                        <img
                          src={
                            mediaDraft.previewUrl
                          }
                          alt="Prévia"
                        />
                      )}

                    {mediaDraft.kind ===
                      "video" &&
                      mediaDraft.previewUrl && (
                        <video
                          src={
                            mediaDraft.previewUrl
                          }
                          controls
                        />
                      )}

                    {mediaDraft.kind ===
                      "audio" &&
                      mediaDraft.previewUrl && (
                        <audio
                          src={
                            mediaDraft.previewUrl
                          }
                          controls
                        />
                      )}

                    {mediaDraft.kind ===
                      "document" && (
                        <span className="file-preview">
                          📎{" "}
                          {
                            mediaDraft
                              .file.name
                          }
                        </span>
                      )}
                  </div>

                  <button
                    onClick={
                      clearMediaDraft
                    }
                    aria-label="Remover anexo"
                  >
                    ×
                  </button>
                </div>
              )}

              {isRecording && (
                <div className="recording-bar">
                  <div className="recording-status">
                    <span className="recording-dot" />
                    <strong>
                      Gravando áudio
                    </strong>
                    <span>
                      {formatRecordingTime(
                        recordingSeconds
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="recording-cancel"
                    onClick={
                      cancelRecording
                    }
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <footer className="composer">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_MEDIA}
                  onChange={handleFile}
                  hidden
                />

                <button
                  className="attach-button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  title="Anexar arquivo"
                  disabled={
                    isRecording
                  }
                >
                  ＋
                </button>

                <button
                  type="button"
                  className={`record-button ${
                    isRecording
                      ? "recording"
                      : ""
                  }`}
                  onClick={
                    isRecording
                      ? finishRecording
                      : startRecording
                  }
                  disabled={
                    sending
                  }
                  title={
                    isRecording
                      ? "Parar gravação"
                      : "Gravar áudio"
                  }
                  aria-label={
                    isRecording
                      ? "Parar gravação"
                      : "Gravar áudio"
                  }
                >
                  {isRecording
                    ? "■"
                    : "🎤"}
                </button>

                <textarea
                  value={text}
                  onChange={(event) =>
                    setText(
                      event.target.value
                    )
                  }
                  onKeyDown={
                    handleComposerKeyDown
                  }
                  placeholder={
                    isRecording
                      ? "Gravando áudio..."
                      : mediaDraft
                        ? "Adicione uma legenda..."
                        : "Digite uma resposta comercial..."
                  }
                  disabled={
                    isRecording
                  }
                  rows={2}
                />

                <button
                  className="button primary send-button"
                  onClick={
                    sendMessage
                  }
                  disabled={
                    sending ||
                    isRecording ||
                    (!text.trim() &&
                      !mediaDraft)
                  }
                >
                  {sending
                    ? "Enviando..."
                    : "Enviar"}
                </button>
              </footer>
            </>
          ) : (
            <div className="empty-chat">
              Selecione uma conversa.
            </div>
          )}
        </section>
      </section>

      {conversationAction &&
        selectedLead && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                  event.currentTarget &&
                !actionSaving
              ) {
                setConversationAction(
                  null
                );
              }
            }}
          >
            <div
              className="conversation-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="conversation-modal-title"
            >
              {conversationAction ===
              "rename" ? (
                <>
                  <div className="modal-icon rename">
                    ✏️
                  </div>

                  <h3 id="conversation-modal-title">
                    Editar nome do contato
                  </h3>

                  <p>
                    Este nome ficará salvo
                    para você no Zentra e
                    terá prioridade sobre o
                    nome recebido do WhatsApp.
                  </p>

                  <label className="modal-field">
                    <span>
                      Nome do contato
                    </span>

                    <input
                      autoFocus
                      maxLength={120}
                      value={nameDraft}
                      onChange={(event) =>
                        setNameDraft(
                          event.target
                            .value
                        )
                      }
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          event.preventDefault();
                          void saveCustomName();
                        }
                      }}
                      placeholder="Ex.: João - Padaria Central"
                    />

                    <small>
                      {nameDraft.length}/120
                    </small>
                  </label>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="modal-button secondary-modal"
                      disabled={
                        actionSaving
                      }
                      onClick={() =>
                        setConversationAction(
                          null
                        )
                      }
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className="modal-button primary-modal"
                      disabled={
                        actionSaving ||
                        !nameDraft.trim()
                      }
                      onClick={
                        saveCustomName
                      }
                    >
                      {actionSaving
                        ? "Salvando..."
                        : "Salvar nome"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="modal-icon delete">
                    🗑️
                  </div>

                  <h3 id="conversation-modal-title">
                    Excluir conversa?
                  </h3>

                  <p>
                    A conversa será removida
                    do seu Inbox. As
                    mensagens, o cliente e
                    os dados comerciais não
                    serão apagados do
                    sistema.
                  </p>

                  <div className="delete-contact-name">
                    {displayName(
                      selectedLead
                    )}
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="modal-button secondary-modal"
                      disabled={
                        actionSaving
                      }
                      onClick={() =>
                        setConversationAction(
                          null
                        )
                      }
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className="modal-button danger-modal"
                      disabled={
                        actionSaving
                      }
                      onClick={
                        deleteConversation
                      }
                    >
                      {actionSaving
                        ? "Excluindo..."
                        : "Excluir conversa"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .inbox-page {
          min-height: 100vh;
          padding: 20px;
          color: #0f172a;
          background: linear-gradient(
            135deg,
            #f0fdf4,
            #ffffff 45%,
            #eff6ff
          );
        }

        .hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
          padding: 22px;
          border: 1px solid
            rgba(37, 99, 235, 0.12);
          border-radius: 28px;
          background: linear-gradient(
            135deg,
            #ffffff,
            #eef7ff
          );
          box-shadow: 0 18px 45px
            rgba(15, 23, 42, 0.06);
        }

        .kicker {
          margin: 0;
          color: #15803d;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .hero h1 {
          margin: 6px 0;
          font-size: clamp(
            28px,
            4vw,
            36px
          );
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .hero p {
          max-width: 760px;
          margin: 0;
          color: #64748b;
          font-weight: 650;
          line-height: 1.55;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 14px;
          margin-bottom: 16px;
        }

        .metric-card {
          padding: 18px;
          border: 1px solid
            rgba(148, 163, 184, 0.22);
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 14px 34px
            rgba(15, 23, 42, 0.05);
        }

        .metric-card span {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
        }

        .metric-card strong {
          display: block;
          margin-top: 6px;
          font-size: 28px;
        }

        .inbox-shell {
          display: grid;
          grid-template-columns:
            360px
            minmax(0, 1fr);
          min-height: 650px;
          overflow: hidden;
          border: 1px solid
            rgba(148, 163, 184, 0.22);
          border-radius: 26px;
          background: #fff;
          box-shadow: 0 18px 50px
            rgba(15, 23, 42, 0.07);
        }

        .conversation-panel {
          min-width: 0;
          border-right: 1px solid
            #e2e8f0;
        }

        .conversation-header {
          padding: 16px;
          border-bottom: 1px solid
            #e2e8f0;
        }

        .conversation-header h2 {
          margin: 0 0 12px;
          font-size: 19px;
        }

        input,
        textarea,
        select {
          width: 100%;
          border: 1px solid #dbe3ef;
          border-radius: 15px;
          padding: 11px 13px;
          outline: none;
          color: #0f172a;
          background: #fff;
          font: inherit;
        }

        input:focus,
        textarea:focus,
        select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px
            rgba(37, 99, 235, 0.09);
        }

        .conversation-list {
          max-height: 590px;
          overflow-y: auto;
        }

        .conversation-item {
          display: grid;
          grid-template-columns:
            44px
            minmax(0, 1fr)
            auto;
          align-items: center;
          gap: 10px;
          width: 100%;
          border: 0;
          border-bottom: 1px solid
            #f1f5f9;
          padding: 13px;
          text-align: left;
          background: #fff;
          cursor: pointer;
        }

        .conversation-item:hover,
        .conversation-item.active {
          background: #eff6ff;
        }

        .avatar {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          color: #fff;
          background: linear-gradient(
            135deg,
            #2563eb,
            #06b6d4
          );
          font-weight: 950;
        }

        .avatar.large {
          width: 46px;
          height: 46px;
        }

        .conversation-copy {
          min-width: 0;
        }

        .conversation-copy strong,
        .conversation-copy span,
        .conversation-copy small {
          display: block;
        }

        .conversation-copy strong {
          overflow: hidden;
          color: #0f172a;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .conversation-copy span {
          overflow: hidden;
          margin-top: 3px;
          color: #64748b;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .conversation-contact-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 5px 8px;
          margin-top: 5px;
        }

        .conversation-contact-meta em {
          color: #64748b;
          font-size: 10px;
          font-style: normal;
          font-weight: 750;
        }

        .conversation-contact-meta .wa-session-mini {
          border-radius: 999px;
          padding: 2px 6px;
          color: #047857;
          background: #d1fae5;
          font-weight: 900;
        }

        .conversation-copy small {
          margin-top: 5px;
          color: #2563eb;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .unread {
          min-width: 22px;
          border-radius: 999px;
          padding: 4px 6px;
          color: #fff;
          background: #16a34a;
          font-size: 11px;
          text-align: center;
        }

        .chat-panel {
          display: flex;
          min-width: 0;
          min-height: 650px;
          flex-direction: column;
          background: linear-gradient(
            180deg,
            #ffffff,
            #f8fafc
          );
        }

        .chat-header {
          display: grid;
          grid-template-columns:
            auto
            auto
            minmax(0, 1fr)
            auto
            190px;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid
            #e2e8f0;
          padding: 14px 16px;
          background: #fff;
        }

        .chat-person {
          min-width: 0;
        }

        .chat-person-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .chat-person-title-row h2 {
          min-width: 0;
          flex: 1;
        }

        .contact-actions {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          flex: 0 0 auto;
        }

        .contact-action {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border: 1px solid #dbe3ef;
          border-radius: 9px;
          padding: 0;
          color: #475569;
          background: #fff;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            background 0.15s ease,
            border-color 0.15s ease;
        }

        .contact-action:hover {
          transform: translateY(-1px);
          border-color: #86efac;
          background: #f0fdf4;
        }

        .contact-action.danger:hover {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .chat-person h2 {
          overflow: hidden;
          margin: 0 0 3px;
          font-size: 18px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-person span {
          display: block;
          overflow: hidden;
          color: #64748b;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .contact-meta-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
        }

        .contact-meta-row .contact-phone {
          color: #475569;
          font-weight: 800;
        }

        .contact-meta-row .whatsapp-session-badge {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          border-radius: 999px;
          padding: 4px 8px;
          color: #047857;
          background: #d1fae5;
          font-size: 10px;
          font-weight: 950;
        }

        .contact-meta-row .whatsapp-session-badge.unknown {
          color: #64748b;
          background: #f1f5f9;
        }

        .ai-control {
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .ai-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 950;
        }

        .ai-status i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 0 4px
            rgba(255, 255, 255, 0.75);
        }

        .ai-status.active {
          color: #15803d;
          background: #dcfce7;
        }

        .ai-status.paused {
          color: #b45309;
          background: #fef3c7;
        }

        .ai-toggle {
          border-radius: 12px;
          padding: 9px 12px;
          font: inherit;
          font-size: 12px;
          font-weight: 950;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            opacity 0.15s ease;
        }

        .ai-toggle:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .ai-toggle:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .ai-toggle.activate {
          border: 1px solid #16a34a;
          color: #166534;
          background: #f0fdf4;
        }

        .ai-toggle.pause {
          border: 1px solid #f59e0b;
          color: #92400e;
          background: #fffbeb;
        }

        .status-select {
          min-width: 0;
        }

        .mobile-back {
          display: none;
          border: 0;
          border-radius: 12px;
          padding: 9px 11px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 18px;
          font-weight: 900;
        }

        .message-list {
          display: grid;
          flex: 1;
          align-content: start;
          gap: 10px;
          overflow-y: auto;
          padding: 18px;
          background:
            radial-gradient(
              circle at top left,
              rgba(37, 99, 235, 0.05),
              transparent 35%
            ),
            #f8fafc;
        }

        .message-row {
          display: flex;
        }

        .message-row.mine {
          justify-content: flex-end;
        }

        .message-row.theirs {
          justify-content: flex-start;
        }

        .message-bubble {
          max-width: min(
            76%,
            620px
          );
          overflow: hidden;
          border-radius: 18px;
          padding: 10px 12px;
          background: #f1f5f9;
          color: #0f172a;
          box-shadow: 0 8px 24px
            rgba(15, 23, 42, 0.05);
        }

        .mine .message-bubble {
          color: #fff;
          background: linear-gradient(
            135deg,
            #2563eb,
            #06b6d4
          );
        }

        .message-bubble p {
          margin: 8px 0 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-weight: 700;
          line-height: 1.45;
        }

        .message-bubble time {
          display: block;
          margin-top: 7px;
          opacity: 0.68;
          font-size: 10px;
          text-align: right;
        }

        .media-link {
          display: block;
        }

        .message-image,
        .message-video {
          display: block;
          width: 100%;
          max-width: 420px;
          max-height: 420px;
          border-radius: 12px;
          object-fit: contain;
          background: #0f172a;
        }

        .message-audio {
          width: min(
            100%,
            360px
          );
        }

        .document-link {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 220px;
          border-radius: 12px;
          padding: 12px;
          color: inherit;
          background: rgba(
            255,
            255,
            255,
            0.18
          );
          font-weight: 900;
          text-decoration: none;
        }

        .theirs .document-link {
          background: #fff;
        }

        .media-preview {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-top: 1px solid
            #e2e8f0;
          padding: 10px 14px;
          background: #eff6ff;
        }

        .media-preview img,
        .media-preview video {
          width: 100px;
          max-height: 80px;
          border-radius: 10px;
          object-fit: cover;
        }

        .media-preview audio {
          max-width: 280px;
        }

        .media-preview button {
          border: 0;
          border-radius: 50%;
          width: 34px;
          height: 34px;
          color: #b91c1c;
          background: #fee2e2;
          font-size: 22px;
          cursor: pointer;
        }

        .file-preview {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #1e3a8a;
          font-weight: 900;
        }

        .recording-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-top: 1px solid #fecaca;
          padding: 10px 14px;
          background: #fff7f7;
        }

        .recording-status {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #991b1b;
          font-size: 13px;
        }

        .recording-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #dc2626;
          animation: recording-pulse 1s ease-in-out infinite;
        }

        .recording-cancel {
          border: 0;
          padding: 6px 9px;
          color: #b91c1c;
          background: transparent;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        @keyframes recording-pulse {
          0%,
          100% {
            opacity: 1;
          }

          50% {
            opacity: 0.35;
          }
        }

        .composer {
          display: grid;
          grid-template-columns:
            auto
            auto
            minmax(0, 1fr)
            auto;
          align-items: end;
          gap: 10px;
          border-top: 1px solid
            #e2e8f0;
          padding: 12px 14px;
          background: #fff;
        }

        .composer textarea {
          min-height: 50px;
          max-height: 130px;
          resize: vertical;
        }

        .attach-button {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border: 1px solid
            rgba(37, 99, 235, 0.25);
          border-radius: 14px;
          color: #1d4ed8;
          background: #fff;
          font-size: 24px;
          cursor: pointer;
        }

        .attach-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .record-button {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border: 1px solid #bbf7d0;
          border-radius: 14px;
          color: #047857;
          background: #f0fdf4;
          font-size: 19px;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            background 0.15s ease;
        }

        .record-button:hover {
          transform: translateY(-1px);
          background: #dcfce7;
        }

        .record-button.recording {
          border-color: #fecaca;
          color: #b91c1c;
          background: #fee2e2;
        }

        .record-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .button {
          border-radius: 14px;
          padding: 11px 15px;
          font-weight: 950;
          cursor: pointer;
        }

        .button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .primary {
          border: 0;
          color: #fff;
          background: linear-gradient(
            135deg,
            #2563eb,
            #06b6d4
          );
        }

        .secondary {
          border: 1px solid
            rgba(37, 99, 235, 0.25);
          color: #1d4ed8;
          background: #fff;
        }

        .send-button {
          min-height: 44px;
        }

        .empty {
          padding: 20px;
          color: #64748b;
          font-weight: 800;
          text-align: center;
        }

        .messages-empty {
          align-self: center;
          justify-self: center;
          border: 1px dashed
            #cbd5e1;
          border-radius: 16px;
          background: #fff;
        }

        .empty-chat {
          display: grid;
          place-items: center;
          flex: 1;
          color: #64748b;
          font-weight: 900;
        }

        .modal-backdrop {
          position: fixed;
          z-index: 9999;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(
            15,
            23,
            42,
            0.52
          );
          backdrop-filter: blur(4px);
        }

        .conversation-modal {
          width: min(
            100%,
            460px
          );
          border: 1px solid
            rgba(
              148,
              163,
              184,
              0.28
            );
          border-radius: 24px;
          padding: 22px;
          background: #fff;
          box-shadow: 0 28px 80px
            rgba(15, 23, 42, 0.24);
        }

        .modal-icon {
          display: grid;
          place-items: center;
          width: 46px;
          height: 46px;
          margin-bottom: 14px;
          border-radius: 14px;
          font-size: 21px;
        }

        .modal-icon.rename {
          background: #f0fdf4;
        }

        .modal-icon.delete {
          background: #fef2f2;
        }

        .conversation-modal h3 {
          margin: 0;
          color: #0f172a;
          font-size: 21px;
          letter-spacing: -0.025em;
        }

        .conversation-modal > p {
          margin: 8px 0 18px;
          color: #64748b;
          font-size: 13px;
          font-weight: 650;
          line-height: 1.55;
        }

        .modal-field {
          display: grid;
          gap: 7px;
        }

        .modal-field > span {
          color: #334155;
          font-size: 12px;
          font-weight: 900;
        }

        .modal-field small {
          color: #94a3b8;
          font-size: 10px;
          font-weight: 800;
          text-align: right;
        }

        .delete-contact-name {
          border: 1px solid #fecaca;
          border-radius: 14px;
          padding: 12px 14px;
          color: #991b1b;
          background: #fff7f7;
          font-weight: 900;
        }

        .modal-actions {
          display: grid;
          grid-template-columns:
            1fr 1fr;
          gap: 10px;
          margin-top: 20px;
        }

        .modal-button {
          min-height: 44px;
          border-radius: 13px;
          padding: 10px 14px;
          font: inherit;
          font-weight: 950;
          cursor: pointer;
        }

        .modal-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .secondary-modal {
          border: 1px solid #dbe3ef;
          color: #475569;
          background: #fff;
        }

        .primary-modal {
          border: 0;
          color: #fff;
          background: linear-gradient(
            135deg,
            #16a34a,
            #15803d
          );
        }

        .danger-modal {
          border: 0;
          color: #fff;
          background: linear-gradient(
            135deg,
            #dc2626,
            #b91c1c
          );
        }

        @media (max-width: 900px) {
          .inbox-page {
            padding: 10px;
          }

          .hero {
            align-items: stretch;
            flex-direction: column;
            border-radius: 20px;
            padding: 18px;
          }

          .hero .button {
            width: 100%;
          }

          .metrics {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            );
          }

          .inbox-shell {
            display: block;
            min-height: 70vh;
            border-radius: 20px;
          }

          .conversation-panel {
            border-right: 0;
          }

          .chat-panel {
            display: none;
            min-height: 70vh;
          }

          .mobile-chat-open
            .conversation-panel {
            display: none;
          }

          .mobile-chat-open
            .chat-panel {
            display: flex;
          }

          .mobile-back {
            display: inline-grid;
          }

          .chat-header {
            grid-template-columns:
              auto
              auto
              minmax(0, 1fr);
          }

          .ai-control,
          .chat-header select {
            grid-column: 1 / -1;
          }

          .ai-control {
            justify-content: space-between;
          }

          .conversation-list {
            max-height: 68vh;
          }
        }

        @media (max-width: 600px) {
          .metrics {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            );
            gap: 8px;
          }

          .metric-card {
            padding: 12px;
          }

          .metric-card strong {
            font-size: 22px;
          }

          .message-list {
            padding: 12px;
          }

          .message-bubble {
            max-width: 88%;
          }

          .composer {
            grid-template-columns:
              auto
              auto
              minmax(0, 1fr);
          }

          .send-button {
            grid-column: 1 / -1;
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
