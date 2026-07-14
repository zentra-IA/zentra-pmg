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
    lead?.name ||
    lead?.nome ||
    lead?.company_name ||
    lead?.phone ||
    "Cliente"
  );
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

  const [
    mediaDraft,
    setMediaDraft,
  ] = useState<MediaDraft | null>(
    null
  );

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
                        lead.phone ||
                        "-"}
                    </span>

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
                  <h2>
                    {displayName(
                      selectedLead
                    )}
                  </h2>

                  <span>
                    {selectedLead.phone ||
                      selectedLead.email ||
                      "Contato PMG"}
                  </span>
                </div>

                <select
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
                >
                  ＋
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
                    mediaDraft
                      ? "Adicione uma legenda..."
                      : "Digite uma resposta comercial..."
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
            210px;
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

        .composer {
          display: grid;
          grid-template-columns:
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

          .chat-header select {
            grid-column: 1 / -1;
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
