"use client";

import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";


const ACCEPTED_MEDIA =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt";
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type MediaKind = "image" | "video" | "audio" | "document";

type MediaDraft = {
  file: File;
  base64: string;
  kind: MediaKind;
  previewUrl: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function messageMedia(message: any) {
  return {
    type: clean(message?.message_type || "text").toLowerCase(),
    url: clean(message?.media_url) || null,
    mime: clean(message?.mime_type) || null,
    fileName: clean(message?.file_name) || null,
  };
}

function formatTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mediaKindFromFile(file: File): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };

    reader.onerror = () =>
      reject(new Error("Não foi possível ler o arquivo."));

    reader.readAsDataURL(file);
  });
}

function recordingTime(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function RenderMedia({ message }: { message: any }) {
  const media = messageMedia(message);

  if (!media.url) return null;

  if (media.type === "image" || media.mime?.startsWith("image/")) {
    return (
      <a href={media.url} target="_blank" rel="noreferrer">
        <img className="pc-media-image" src={media.url} alt={media.fileName || "Imagem"} />
      </a>
    );
  }

  if (media.type === "video" || media.mime?.startsWith("video/")) {
    return <video className="pc-media-video" src={media.url} controls preload="metadata" />;
  }

  if (media.type === "audio" || media.mime?.startsWith("audio/")) {
    return <audio className="pc-media-audio" src={media.url} controls preload="metadata" />;
  }

  return (
    <a className="pc-document" href={media.url} target="_blank" rel="noreferrer">
      📎 {media.fileName || "Abrir documento"}
    </a>
  );
}


function customerName(conversation: any) {
  return clean(conversation?.customer_name) || "Cliente";
}

export default function ZentraGlobalChat() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<"list" | "chat">("list");
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [mediaDraft, setMediaDraft] = useState<MediaDraft | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const selectedIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const knownConversationStateRef = useRef<Map<string, number>>(new Map());
  const notificationInitializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [incomingToast, setIncomingToast] = useState<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selected?.id ? String(selected.id) : null;
  }, [selected?.id]);

  const unreadTotal = useMemo(
    () =>
      conversations.reduce(
        (sum, item) => sum + Number(item?.seller_unread || 0),
        0
      ),
    [conversations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return conversations;

    return conversations.filter((item) =>
      [
        item?.customer_name,
        item?.customer_phone,
        item?.last_message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [conversations, search]);

  function playIncomingSound() {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextCtor) return;

      const context =
        audioContextRef.current || new AudioContextCtor();

      audioContextRef.current = context;

      if (context.state === "suspended") {
        void context.resume();
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(920, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.27);
    } catch {
      // Som nunca deve bloquear atendimento.
    }
  }

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      const response = await fetch(`/api/crm/portal-chat?t=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (!silent) throw new Error(data?.error || "Erro ao carregar conversas.");
        return;
      }

      const items = Array.isArray(data?.conversations)
        ? data.conversations
        : [];

      if (notificationInitializedRef.current) {
        const newIncoming = items.filter((item: any) => {
          const previous =
            knownConversationStateRef.current.get(String(item.id)) || 0;
          return Number(item?.seller_unread || 0) > previous;
        });

        if (newIncoming.length) {
          const newest = newIncoming[0];
          const name = customerName(newest);

          playIncomingSound();
          setIncomingToast(`${name}: ${newest?.last_message || "Nova mensagem"}`);
          window.setTimeout(() => setIncomingToast(null), 5500);

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Zentra · Nova mensagem do portal", {
              body: `${name} enviou uma mensagem.`,
              icon: "/logo-pmg.png",
              tag: `portal-chat-seller-${newest.id}`,
            });
          }
        }
      }

      knownConversationStateRef.current = new Map(
        items.map((item: any) => [
          String(item.id),
          Number(item?.seller_unread || 0),
        ])
      );
      notificationInitializedRef.current = true;

      setConversations(items);

      setSelected((current: any) => {
        if (!current) return current;

        return (
          items.find((item: any) => String(item.id) === String(current.id)) ||
          current
        );
      });
    } catch (error: any) {
      if (!silent) {
        window.alert(error?.message || "Erro ao carregar chat do portal.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId: string, silent = false) => {
      if (!conversationId) return;

      try {
        const response = await fetch(
          `/api/crm/portal-chat?conversationId=${encodeURIComponent(
            conversationId
          )}&t=${Date.now()}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (!silent) {
            throw new Error(data?.error || "Erro ao carregar mensagens.");
          }
          return;
        }

        setMessages(Array.isArray(data?.messages) ? data.messages : []);

        setConversations((current) =>
          current.map((item) =>
            String(item.id) === String(conversationId)
              ? { ...item, seller_unread: 0 }
              : item
          )
        );
      } catch (error: any) {
        if (!silent) {
          window.alert(error?.message || "Erro ao carregar mensagens.");
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadConversations(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;

      void loadConversations(true);

      const id = selectedIdRef.current;
      if (id) void loadMessages(id, true);
    }, 1200);

    return () => window.clearInterval(interval);
  }, [loadConversations, loadMessages]);

  useEffect(() => {
    if (open) void loadConversations(true);
  }, [open, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open, screen]);

  function clearMedia() {
    setMediaDraft((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  async function openConversation(item: any) {
    setSelected(item);
    setMessages([]);
    setScreen("chat");
    await loadMessages(String(item.id), false);
    void loadConversations(true);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      window.alert("O arquivo excede o limite de 100 MB.");
      return;
    }

    try {
      clearMedia();
      const kind = mediaKindFromFile(file);
      const base64 = await fileToBase64(file);

      setMediaDraft({
        file,
        base64,
        kind,
        previewUrl:
          kind === "image" || kind === "video" || kind === "audio"
            ? URL.createObjectURL(file)
            : null,
      });
    } catch (error: any) {
      window.alert(error?.message || "Erro ao preparar arquivo.");
    }
  }

  async function sendMessage() {
    if (!selected || sending || isRecording || (!text.trim() && !mediaDraft)) {
      return;
    }

    setSending(true);

    try {
      const body: Record<string, unknown> = {
        conversationId: selected.id,
        message: text.trim(),
      };

      if (mediaDraft) {
        body.base64 = mediaDraft.base64;
        body.mediaType = mediaDraft.kind;
        body.mimeType = mediaDraft.file.type || "application/octet-stream";
        body.fileName = mediaDraft.file.name;
      }

      const optimisticMessage = {
        id: `optimistic-${Date.now()}`,
        sender_type: "seller",
        message_type: mediaDraft?.kind || "text",
        content: text.trim() || null,
        media_url: mediaDraft?.previewUrl || null,
        mime_type: mediaDraft?.file.type || null,
        file_name: mediaDraft?.file.name || null,
        created_at: new Date().toISOString(),
      };

      setMessages((current) => [...current, optimisticMessage]);

      const response = await fetch("/api/crm/portal-chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao enviar mensagem.");
      }

      setText("");
      clearMedia();

      await Promise.all([
        loadMessages(String(selected.id), true),
        loadConversations(true),
      ]);
    } catch (error: any) {
      window.alert(error?.message || "Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    if (isRecording || sending) return;

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      window.alert("Este navegador não permite gravar áudio.");
      return;
    }

    try {
      clearMedia();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const candidates = [
        "audio/ogg;codecs=opus",
        "audio/webm;codecs=opus",
        "audio/webm",
      ];

      const mimeType =
        candidates.find((item) => MediaRecorder.isTypeSupported(item)) || "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const discard = discardRef.current;
        const chunks = chunksRef.current;

        chunksRef.current = [];
        stopTimer();
        stopStream();
        recorderRef.current = null;
        setIsRecording(false);
        setRecordingSeconds(0);

        if (discard || !chunks.length) return;

        try {
          const type = recorder.mimeType || mimeType || "audio/webm";
          const extension = type.includes("ogg") ? "ogg" : "webm";
          const blob = new Blob(chunks, { type });
          const file = new File([blob], `audio-${Date.now()}.${extension}`, {
            type,
          });
          const base64 = await fileToBase64(file);

          setMediaDraft({
            file,
            base64,
            kind: "audio",
            previewUrl: URL.createObjectURL(blob),
          });
        } catch (error: any) {
          window.alert(error?.message || "Erro ao preparar áudio.");
        }
      };

      recorder.start(250);
      setRecordingSeconds(0);
      setIsRecording(true);

      timerRef.current = window.setInterval(
        () => setRecordingSeconds((current) => current + 1),
        1000
      );
    } catch (error: any) {
      stopTimer();
      stopStream();
      setIsRecording(false);

      window.alert(
        error?.name === "NotAllowedError"
          ? "Permita o acesso ao microfone para gravar áudio."
          : error?.message || "Não foi possível iniciar a gravação."
      );
    }
  }

  function finishRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    discardRef.current = false;
    recorder.stop();
  }

  function cancelRecording() {
    discardRef.current = true;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    stopTimer();
    stopStream();
    setIsRecording(false);
    setRecordingSeconds(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  useEffect(() => {
    return () => {
      discardRef.current = true;

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();

      stopTimer();
      stopStream();
    };
  }, []);

  return (
    <>
      {incomingToast && (
        <button
          type="button"
          className="pc-seller-toast"
          onClick={() => {
            setOpen(true);
            setScreen("list");
            setIncomingToast(null);
          }}
        >
          <span>🔔</span>
          <div>
            <b>Nova mensagem do portal</b>
            <small>{incomingToast}</small>
          </div>
        </button>
      )}

      {open && (
        <section className="pc-seller-panel" aria-label="Chat do portal">
          <header className="pc-seller-header">
            <div>
              <strong>💬 Chat do Portal</strong>
              <span>
                {screen === "chat" && selected
                  ? customerName(selected)
                  : `${unreadTotal} não lida(s)`}
              </span>
            </div>

            <div className="pc-seller-head-actions">
              {screen === "chat" && (
                <button type="button" onClick={() => setScreen("list")}>
                  ←
                </button>
              )}

              <button type="button" onClick={() => setOpen(false)}>×</button>
            </div>
          </header>

          {screen === "list" ? (
            <div className="pc-seller-list-screen">
              <div className="pc-seller-search">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar cliente do portal..."
                />
              </div>

              <div className="pc-seller-list">
                {filtered.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="pc-seller-conversation"
                    onClick={() => void openConversation(item)}
                  >
                    <span className="pc-seller-avatar">
                      {customerName(item).slice(0, 1).toUpperCase()}
                    </span>

                    <span className="pc-seller-copy">
                      <b>{customerName(item)}</b>
                      <small>{item.last_message || "Nova conversa"}</small>
                    </span>

                    {Number(item.seller_unread || 0) > 0 && (
                      <span className="pc-seller-unread">
                        {Number(item.seller_unread)}
                      </span>
                    )}
                  </button>
                ))}

                {!filtered.length && (
                  <div className="pc-seller-empty">
                    {loading
                      ? "Carregando..."
                      : "Nenhuma conversa do portal ainda."}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="pc-seller-chat-screen">
              <div className="pc-seller-person">
                <strong>{customerName(selected)}</strong>
                {selected?.customer_phone && (
                  <span>{selected.customer_phone}</span>
                )}
              </div>

              <div className="pc-seller-messages">
                {messages.map((message, index) => {
                  const mine = message?.sender_type === "seller";

                  return (
                    <div
                      key={message?.id || index}
                      className={`pc-seller-row ${mine ? "mine" : "theirs"}`}
                    >
                      <article className="pc-seller-bubble">
                        <RenderMedia message={message} />
                        {message?.content && <p>{message.content}</p>}
                        <time>{formatTime(message?.created_at)}</time>
                      </article>
                    </div>
                  );
                })}

                {!messages.length && (
                  <div className="pc-seller-empty">Sem mensagens.</div>
                )}

                <div ref={bottomRef} />
              </div>

              {mediaDraft && (
                <div className="pc-seller-preview">
                  <div>
                    {mediaDraft.kind === "image" && mediaDraft.previewUrl && (
                      <img src={mediaDraft.previewUrl} alt="Prévia" />
                    )}
                    {mediaDraft.kind === "video" && mediaDraft.previewUrl && (
                      <video src={mediaDraft.previewUrl} controls />
                    )}
                    {mediaDraft.kind === "audio" && mediaDraft.previewUrl && (
                      <audio src={mediaDraft.previewUrl} controls />
                    )}
                    {mediaDraft.kind === "document" && (
                      <b>📎 {mediaDraft.file.name}</b>
                    )}
                  </div>
                  <button type="button" onClick={clearMedia}>×</button>
                </div>
              )}

              {isRecording && (
                <div className="pc-seller-recording">
                  <span>🔴 Gravando {recordingTime(recordingSeconds)}</span>
                  <button type="button" onClick={cancelRecording}>Cancelar</button>
                </div>
              )}

              <footer className="pc-seller-composer">
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_MEDIA}
                  onChange={handleFile}
                  hidden
                />

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={isRecording}
                >
                  ＋
                </button>

                <button
                  type="button"
                  onClick={isRecording ? finishRecording : startRecording}
                  disabled={sending}
                >
                  {isRecording ? "■" : "🎤"}
                </button>

                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isRecording}
                  rows={1}
                  placeholder={
                    isRecording
                      ? "Gravando..."
                      : mediaDraft
                        ? "Adicione uma mensagem..."
                        : "Responder cliente..."
                  }
                />

                <button
                  type="button"
                  className="send"
                  onClick={() => void sendMessage()}
                  disabled={
                    sending ||
                    isRecording ||
                    (!text.trim() && !mediaDraft)
                  }
                >
                  {sending ? "…" : "➤"}
                </button>
              </footer>
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        className="pc-seller-float"
        onClick={() => {
          setOpen((current) => !current);

          if (
            "Notification" in window &&
            Notification.permission === "default"
          ) {
            void Notification.requestPermission();
          }

          playIncomingSound();
        }}
        title="Chat do Portal"
      >
        💬
        {unreadTotal > 0 && (
          <b>{unreadTotal > 99 ? "99+" : unreadTotal}</b>
        )}
      </button>

      <style jsx>{`
        .pc-seller-toast {
          position: fixed;
          right: 24px;
          bottom: 166px;
          z-index: 112;
          width: min(360px, calc(100vw - 32px));
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #bbf7d0;
          border-radius: 17px;
          padding: 11px 13px;
          color: #17202e;
          background: #ffffff;
          box-shadow: 0 20px 55px rgba(15, 23, 42, .18);
          cursor: pointer;
          text-align: left;
        }

        .pc-seller-toast > span {
          font-size: 21px;
        }

        .pc-seller-toast > div {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .pc-seller-toast b {
          color: #15803d;
          font-size: 11px;
          font-weight: 950;
        }

        .pc-seller-toast small {
          overflow: hidden;
          color: #475569;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pc-seller-float {
          position: fixed;
          right: 24px;
          bottom: 96px;
          z-index: 110;
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 999px;
          color: #fff;
          background: linear-gradient(135deg, #16a34a, #166534);
          box-shadow: 0 18px 42px rgba(21, 128, 61, .32);
          cursor: pointer;
          font-size: 22px;
        }

        .pc-seller-float b {
          position: absolute;
          right: -3px;
          top: -4px;
          min-width: 22px;
          height: 22px;
          display: grid;
          place-items: center;
          border: 2px solid #fff;
          border-radius: 999px;
          padding: 0 5px;
          color: #fff;
          background: #dc2626;
          font-size: 9px;
          font-weight: 950;
        }

        .pc-seller-panel {
          position: fixed;
          right: 24px;
          bottom: 166px;
          z-index: 109;
          width: min(410px, calc(100vw - 32px));
          height: min(680px, calc(100dvh - 190px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #dfe5ec;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 30px 85px rgba(15, 23, 42, .24);
        }

        .pc-seller-header {
          min-height: 66px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          color: #fff;
          background: linear-gradient(135deg, #15803d, #166534);
        }

        .pc-seller-header > div:first-child {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .pc-seller-header strong {
          font-size: 14px;
          font-weight: 950;
        }

        .pc-seller-header span {
          overflow: hidden;
          max-width: 260px;
          opacity: .86;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pc-seller-head-actions {
          display: flex;
          gap: 5px;
        }

        .pc-seller-head-actions button {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 10px;
          color: #fff;
          background: rgba(255,255,255,.15);
          cursor: pointer;
          font-size: 18px;
        }

        .pc-seller-list-screen,
        .pc-seller-chat-screen {
          min-height: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .pc-seller-search {
          padding: 10px;
          border-bottom: 1px solid #edf0f3;
        }

        .pc-seller-search input,
        .pc-seller-composer textarea {
          width: 100%;
          border: 1px solid #dbe3ea;
          border-radius: 12px;
          outline: 0;
          color: #17202e;
          background: #fff;
          font: inherit;
        }

        .pc-seller-search input {
          height: 42px;
          padding: 0 12px;
        }

        .pc-seller-list {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
        }

        .pc-seller-conversation {
          width: 100%;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          border: 0;
          border-bottom: 1px solid #f0f2f5;
          padding: 11px 12px;
          text-align: left;
          background: #fff;
          cursor: pointer;
        }

        .pc-seller-conversation:hover {
          background: #f0fdf4;
        }

        .pc-seller-avatar {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: #fff;
          background: #15803d;
          font-weight: 950;
        }

        .pc-seller-copy {
          min-width: 0;
          display: grid;
          gap: 3px;
        }

        .pc-seller-copy b,
        .pc-seller-copy small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pc-seller-copy b {
          color: #17202e;
          font-size: 12px;
          font-weight: 900;
        }

        .pc-seller-copy small {
          color: #667085;
          font-size: 10px;
        }

        .pc-seller-unread {
          min-width: 22px;
          height: 22px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          padding: 0 5px;
          color: #fff;
          background: #16a34a;
          font-size: 9px;
          font-weight: 950;
        }

        .pc-seller-person {
          display: grid;
          gap: 2px;
          padding: 9px 12px;
          border-bottom: 1px solid #edf0f3;
        }

        .pc-seller-person strong {
          color: #17202e;
          font-size: 12px;
          font-weight: 900;
        }

        .pc-seller-person span {
          color: #667085;
          font-size: 9px;
        }

        .pc-seller-messages {
          min-height: 0;
          flex: 1;
          display: grid;
          align-content: start;
          gap: 8px;
          overflow-y: auto;
          padding: 12px;
          background: #f7f9fb;
        }

        .pc-seller-row {
          display: flex;
        }

        .pc-seller-row.mine {
          justify-content: flex-end;
        }

        .pc-seller-bubble {
          max-width: 82%;
          overflow: hidden;
          border-radius: 15px;
          padding: 8px 10px;
          color: #17202e;
          background: #fff;
          box-shadow: 0 5px 16px rgba(15,23,42,.06);
        }

        .mine .pc-seller-bubble {
          color: #fff;
          background: #15803d;
        }

        .pc-seller-bubble p {
          margin: 5px 0 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 12px;
          line-height: 1.4;
          font-weight: 650;
        }

        .pc-seller-bubble time {
          display: block;
          margin-top: 5px;
          opacity: .65;
          font-size: 8.5px;
          text-align: right;
        }

        :global(.pc-media-image),
        :global(.pc-media-video) {
          display: block;
          width: 100%;
          max-height: 260px;
          border-radius: 10px;
          object-fit: contain;
          background: #0f172a;
        }

        :global(.pc-media-audio) {
          width: 250px;
          max-width: 100%;
        }

        :global(.pc-document) {
          display: block;
          border-radius: 10px;
          padding: 9px;
          color: inherit;
          background: rgba(255,255,255,.18);
          font-size: 10px;
          font-weight: 850;
          text-decoration: none;
        }

        .theirs :global(.pc-document) {
          background: #f1f5f9;
        }

        .pc-seller-preview {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-top: 1px solid #dbeafe;
          background: #eff6ff;
        }

        .pc-seller-preview img,
        .pc-seller-preview video {
          width: 72px;
          max-height: 58px;
          border-radius: 8px;
          object-fit: cover;
        }

        .pc-seller-preview audio {
          width: 230px;
          max-width: 100%;
        }

        .pc-seller-preview b {
          color: #1e3a8a;
          font-size: 10px;
        }

        .pc-seller-preview > button {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 999px;
          color: #b91c1c;
          background: #fee2e2;
          cursor: pointer;
          font-size: 18px;
        }

        .pc-seller-recording {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-top: 1px solid #fecaca;
          color: #991b1b;
          background: #fff7f7;
          font-size: 10px;
          font-weight: 900;
        }

        .pc-seller-recording button {
          border: 0;
          color: #b91c1c;
          background: transparent;
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
        }

        .pc-seller-composer {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr) auto;
          align-items: end;
          gap: 6px;
          padding: 9px;
          border-top: 1px solid #edf0f3;
          background: #fff;
        }

        .pc-seller-composer > button {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border: 1px solid #dbe3ea;
          border-radius: 11px;
          color: #15803d;
          background: #fff;
          cursor: pointer;
        }

        .pc-seller-composer > button.send {
          border-color: #15803d;
          color: #fff;
          background: #15803d;
        }

        .pc-seller-composer > button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .pc-seller-composer textarea {
          min-height: 38px;
          max-height: 90px;
          resize: none;
          padding: 9px 10px;
          font-size: 11px;
        }

        .pc-seller-empty {
          margin: auto;
          padding: 18px;
          color: #98a2b3;
          font-size: 11px;
          font-weight: 750;
          text-align: center;
        }

        @media (max-width: 760px) {
          .pc-seller-float {
            right: 14px;
            bottom: 82px;
            width: 54px;
            height: 54px;
          }

          .pc-seller-panel {
            inset: 0;
            width: 100vw;
            height: 100dvh;
            border: 0;
            border-radius: 0;
          }

          .pc-seller-header {
            padding-top: max(12px, env(safe-area-inset-top));
          }

          .pc-seller-composer {
            padding-bottom: max(9px, env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </>
  );
}
