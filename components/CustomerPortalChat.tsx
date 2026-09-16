"use client";

import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
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


export default function CustomerPortalChat({
  portalToken,
}: {
  portalToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [mediaDraft, setMediaDraft] = useState<MediaDraft | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const initializedMessagesRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const endpoint = `/api/portal-chat/${encodeURIComponent(portalToken)}`;

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
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    } catch {
      // Som é melhoria de UX; nunca bloqueia o chat.
    }
  }

  const loadMessages = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);

      try {
        const response = await fetch(`${endpoint}?t=${Date.now()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || "Erro ao carregar atendimento.");
        }

        const nextMessages = Array.isArray(data?.messages) ? data.messages : [];

        if (initializedMessagesRef.current) {
          const newSellerMessages = nextMessages.filter(
            (message: any) =>
              message?.sender_type === "seller" &&
              message?.id &&
              !knownMessageIdsRef.current.has(String(message.id))
          );

          if (newSellerMessages.length) {
            playIncomingSound();

            if (
              document.visibilityState !== "visible" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification("PMG Atacadista · Nova mensagem", {
                body: "Seu vendedor respondeu no atendimento.",
                icon: "/logo-pmg.png",
                tag: "portal-chat-local",
              });
            }
          }
        }

        knownMessageIdsRef.current = new Set(
          nextMessages
            .map((message: any) => message?.id)
            .filter(Boolean)
            .map(String)
        );
        initializedMessagesRef.current = true;

        setMessages(nextMessages);
        setErrorText("");
      } catch (error: any) {
        if (!silent) {
          setErrorText(error?.message || "Atendimento indisponível.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [endpoint]
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("pmg:portal-chat-open", {
        detail: { open },
      })
    );

    return () => {
      if (open) {
        window.dispatchEvent(
          new CustomEvent("pmg:portal-chat-open", {
            detail: { open: false },
          })
        );
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    void loadMessages(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadMessages(true);
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [open, loadMessages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("chat") === "open") {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

  function clearMedia() {
    setMediaDraft((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
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
    if (sending || isRecording || (!text.trim() && !mediaDraft)) return;

    setSending(true);

    try {
      const body: Record<string, unknown> = {
        message: text.trim(),
      };

      if (mediaDraft) {
        body.base64 = mediaDraft.base64;
        body.mediaType = mediaDraft.kind;
        body.mimeType = mediaDraft.file.type || "application/octet-stream";
        body.fileName = mediaDraft.file.name;
      }

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage = {
        id: optimisticId,
        sender_type: "customer",
        message_type: mediaDraft?.kind || "text",
        content: text.trim() || null,
        media_url: mediaDraft?.previewUrl || null,
        mime_type: mediaDraft?.file.type || null,
        file_name: mediaDraft?.file.name || null,
        created_at: new Date().toISOString(),
      };

      setMessages((current) => [...current, optimisticMessage]);

      const response = await fetch(endpoint, {
        method: "POST",
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
      setErrorText("");
      await loadMessages(true);
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
      {open && (
        <section className="pc-customer-panel" aria-label="Atendimento PMG">
          <header className="pc-customer-header">
            <div>
              <strong>Atendimento PMG</strong>
              <span>Converse diretamente com seu vendedor</span>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar atendimento"
            >
              ×
            </button>
          </header>

          <div className="pc-customer-messages">
            {messages.map((message, index) => {
              const mine = message?.sender_type === "customer";

              return (
                <div
                  key={message?.id || index}
                  className={`pc-customer-row ${mine ? "mine" : "theirs"}`}
                >
                  <article className="pc-customer-bubble">
                    <RenderMedia message={message} />
                    {message?.content && <p>{message.content}</p>}
                    <time>{formatTime(message?.created_at)}</time>
                  </article>
                </div>
              );
            })}

            {!messages.length && !loading && !errorText && (
              <div className="pc-customer-empty">
                <b>Olá! 👋</b>
                <span>
                  Envie uma mensagem para falar diretamente com seu vendedor.
                </span>
              </div>
            )}

            {loading && !messages.length && (
              <div className="pc-customer-empty">Carregando...</div>
            )}

            {errorText && (
              <div className="pc-customer-error">{errorText}</div>
            )}

            <div ref={bottomRef} />
          </div>

          {mediaDraft && (
            <div className="pc-customer-preview">
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
            <div className="pc-customer-recording">
              <span>🔴 Gravando {recordingTime(recordingSeconds)}</span>
              <button type="button" onClick={cancelRecording}>Cancelar</button>
            </div>
          )}

          <footer className="pc-customer-composer">
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
              title="Foto, vídeo ou documento"
            >
              ＋
            </button>

            <button
              type="button"
              onClick={isRecording ? finishRecording : startRecording}
              disabled={sending}
              title={isRecording ? "Parar gravação" : "Gravar áudio"}
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
                    : "Digite sua mensagem..."
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
        </section>
      )}

      {!open && (
        <button
          type="button"
          className="pc-customer-float"
          onClick={() => {
            setOpen(true);
            playIncomingSound();
          }}
          aria-label="Falar diretamente com seu vendedor"
        >
          <span className="pc-customer-float-icon">💬</span>
          <span className="pc-customer-float-copy">
            <b>FALE COM SEU VENDEDOR</b>
            <small>Pedidos, cotações e dúvidas por aqui</small>
          </span>
          <i className="pc-customer-live-dot" aria-hidden="true" />
        </button>
      )}

      <style jsx>{`
        .pc-customer-float {
          position: fixed;
          right: 18px;
          bottom: max(18px, env(safe-area-inset-bottom));
          z-index: 120;
          width: min(340px, calc(100vw - 28px));
          min-height: 66px;
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) 10px;
          align-items: center;
          gap: 10px;
          border: 2px solid rgba(255,255,255,.9);
          border-radius: 20px;
          padding: 9px 12px 9px 9px;
          color: #fff;
          background: linear-gradient(135deg, #15803d, #166534);
          box-shadow:
            0 20px 50px rgba(21, 128, 61, .36),
            0 0 0 5px rgba(34,197,94,.10);
          cursor: pointer;
          font: inherit;
          text-align: left;
          animation: pcCustomerAttention 2.4s ease-in-out infinite;
        }

        .pc-customer-float-icon {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          color: #15803d;
          background: #fff;
          font-size: 21px;
        }

        .pc-customer-float-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .pc-customer-float-copy b {
          font-size: 12px;
          line-height: 1.15;
          font-weight: 950;
          letter-spacing: .01em;
        }

        .pc-customer-float-copy small {
          opacity: .92;
          font-size: 9.5px;
          line-height: 1.2;
          font-weight: 650;
        }

        .pc-customer-live-dot {
          width: 9px;
          height: 9px;
          border: 2px solid rgba(255,255,255,.9);
          border-radius: 999px;
          background: #ef4444;
          box-shadow: 0 0 0 0 rgba(239,68,68,.6);
          animation: pcCustomerDot 1.45s ease-out infinite;
        }

        @keyframes pcCustomerAttention {
          0%, 82%, 100% { transform: translateY(0); }
          88% { transform: translateY(-3px); }
          94% { transform: translateY(0); }
        }

        @keyframes pcCustomerDot {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,.58); }
          70% { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }

        .pc-customer-panel {
          position: fixed;
          right: 18px;
          bottom: 88px;
          z-index: 121;
          width: min(390px, calc(100vw - 24px));
          height: min(620px, calc(100dvh - 110px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 30px 85px rgba(15, 23, 42, 0.24);
        }

        .pc-customer-header {
          min-height: 68px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          color: #fff;
          background: linear-gradient(135deg, #15803d, #166534);
        }

        .pc-customer-header > div {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .pc-customer-header strong {
          font-size: 14px;
          font-weight: 950;
        }

        .pc-customer-header span {
          opacity: 0.86;
          font-size: 10px;
          font-weight: 650;
        }

        .pc-customer-header button {
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 10px;
          color: #fff;
          background: rgba(255,255,255,.16);
          cursor: pointer;
          font-size: 20px;
        }

        .pc-customer-messages {
          min-height: 0;
          flex: 1;
          display: grid;
          align-content: start;
          gap: 8px;
          overflow-y: auto;
          padding: 12px;
          background: #f8fafc;
        }

        .pc-customer-row {
          display: flex;
        }

        .pc-customer-row.mine {
          justify-content: flex-end;
        }

        .pc-customer-row.theirs {
          justify-content: flex-start;
        }

        .pc-customer-bubble {
          max-width: 84%;
          overflow: hidden;
          border-radius: 16px;
          padding: 9px 10px;
          color: #17202e;
          background: #fff;
          box-shadow: 0 5px 18px rgba(15, 23, 42, .06);
        }

        .mine .pc-customer-bubble {
          color: #fff;
          background: #15803d;
        }

        .pc-customer-bubble p {
          margin: 5px 0 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 12px;
          line-height: 1.42;
          font-weight: 650;
        }

        .pc-customer-bubble time {
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
          width: 245px;
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

        .pc-customer-empty,
        .pc-customer-error {
          align-self: center;
          justify-self: center;
          margin: auto;
          padding: 20px;
          text-align: center;
          font-size: 11px;
        }

        .pc-customer-empty {
          display: grid;
          gap: 5px;
          color: #64748b;
        }

        .pc-customer-error {
          color: #b91c1c;
        }

        .pc-customer-preview {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-top: 1px solid #dbeafe;
          background: #eff6ff;
        }

        .pc-customer-preview img,
        .pc-customer-preview video {
          width: 72px;
          max-height: 58px;
          border-radius: 8px;
          object-fit: cover;
        }

        .pc-customer-preview audio {
          width: 230px;
          max-width: 100%;
        }

        .pc-customer-preview b {
          color: #1e3a8a;
          font-size: 10px;
        }

        .pc-customer-preview > button {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 999px;
          color: #b91c1c;
          background: #fee2e2;
          cursor: pointer;
          font-size: 18px;
        }

        .pc-customer-recording {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-top: 1px solid #fecaca;
          color: #991b1b;
          background: #fff7f7;
          font-size: 10px;
          font-weight: 900;
        }

        .pc-customer-recording button {
          border: 0;
          color: #b91c1c;
          background: transparent;
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
        }

        .pc-customer-composer {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr) auto;
          align-items: end;
          gap: 6px;
          padding: 9px;
          border-top: 1px solid #e2e8f0;
          background: #fff;
        }

        .pc-customer-composer > button {
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

        .pc-customer-composer > button.send {
          border-color: #15803d;
          color: #fff;
          background: #15803d;
        }

        .pc-customer-composer > button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .pc-customer-composer textarea {
          width: 100%;
          min-height: 38px;
          max-height: 90px;
          resize: none;
          border: 1px solid #dbe3ea;
          border-radius: 11px;
          padding: 9px 10px;
          outline: 0;
          color: #17202e;
          background: #fff;
          font: inherit;
          font-size: 11px;
        }

        @media (max-width: 600px) {
          .pc-customer-float {
            right: 12px;
            bottom: max(12px, env(safe-area-inset-bottom));
            width: min(340px, calc(100vw - 24px));
            min-height: 64px;
            grid-template-columns: 42px minmax(0, 1fr) 9px;
            border-radius: 18px;
            padding: 8px 11px 8px 8px;
          }

          .pc-customer-float-icon {
            width: 42px;
            height: 42px;
          }

          .pc-customer-float-copy b {
            display: block;
            font-size: 11.5px;
          }

          .pc-customer-float-copy small {
            display: block;
            font-size: 9px;
          }

          .pc-customer-panel {
            inset: 0;
            width: 100vw;
            height: 100dvh;
            border: 0;
            border-radius: 0;
          }

          .pc-customer-header {
            padding-top: max(12px, env(safe-area-inset-top));
          }

          .pc-customer-composer {
            padding-bottom: max(9px, env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </>
  );
}
