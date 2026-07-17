require("dotenv").config();

const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

async function loadBaileys() {
  return await import("@whiskeysockets/baileys");
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const PORT = process.env.PORT || 3011;
const ZENTRA_APP_URL = process.env.ZENTRA_APP_URL || "http://localhost:3000";

const sessions = {};
const starting = {};

function clean(value) {
  return String(value || "").replace(/\D/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBrazilPhone(value) {
  let phone = clean(value);
  if (!phone) return "";
  if (!phone.startsWith("55")) phone = `55${phone}`;
  return phone;
}

function normalizeLid(value) {
  if (!value) return "";
  const raw = String(value);
  if (raw.includes("@lid")) return raw;
  const cleaned = clean(raw);
  return cleaned ? `${cleaned}@lid` : "";
}

function getCrmUrlBySession() {
  return `${ZENTRA_APP_URL}/api/whatsapp/incoming`;
}

async function resolveJid(payload) {
  const { number, phone, lid, jid } = payload;

  const finalPhone = normalizeBrazilPhone(number || phone || payload.to || payload.telefone);

  if (finalPhone) {
    return `${finalPhone}@s.whatsapp.net`;
  }

  if (jid && String(jid).includes("@s.whatsapp.net")) {
    return String(jid);
  }

  if (jid && String(jid).includes("@lid")) {
    return String(jid);
  }

  if (lid && String(lid).includes("@lid")) {
    return String(lid);
  }

  throw new Error("Sem telefone ou LID válido para envio.");
}

async function notifyCRM(payload) {
  try {
    const crmUrl = getCrmUrlBySession();

    console.log("➡️ Enviando mensagem para Zentra RH:", {
      crmUrl,
      sessionId: payload.sessionId,
      number: payload.number,
      lid: payload.lid,
      remoteJid: payload.remoteJid,
      message: payload.message,
    });

    const res = await fetch(crmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    console.log("⬅️ Resposta Zentra RH:", data);

    return data;
  } catch (error) {
    console.error("Erro ao avisar Zentra RH:", error.message);
    return null;
  }
}

function extractMessageText(message) {
  const msg =
    message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.documentWithCaptionMessage?.message ||
    message;

  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.buttonsResponseMessage?.selectedDisplayText ||
    msg?.buttonsResponseMessage?.selectedButtonId ||
    msg?.listResponseMessage?.title ||
    msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg?.templateButtonReplyMessage?.selectedDisplayText ||
    msg?.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

async function startSession(sessionId) {
  sessionId = String(sessionId || "").trim();

  if (!sessionId) {
    throw new Error("sessionId obrigatório");
  }

  if (starting[sessionId]) {
    console.log(`⏳ Sessão ${sessionId} já está iniciando`);
    return starting[sessionId];
  }

  const current = sessions[sessionId];

  if (
    current &&
    ["online", "connecting", "qr_pending"].includes(current.status)
  ) {
    console.log(`ℹ️ Sessão ${sessionId} já existe: ${current.status}`);
    return current;
  }

  starting[sessionId] = createSession(sessionId);

  try {
    return await starting[sessionId];
  } finally {
    delete starting[sessionId];
  }
}

async function createSession(sessionId) {
  sessionId = String(sessionId);

 const baileys = await loadBaileys();

const makeWASocket =
  baileys.default?.default ||
  baileys.default ||
  baileys.makeWASocket;

  const {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
  } = baileys;

  if (sessions[sessionId]?.sock) {
    try {
      sessions[sessionId].sock.end();
    } catch {}
  }

  const sessionPath = path.join(__dirname, "sessions", sessionId);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const { version } = await fetchLatestBaileysVersion();

  sessions[sessionId] = {
    sock: null,
    status: "connecting",
    qr: null,
    me: null,
    lastError: null,
  };

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Zentra RH", "Chrome", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    defaultQueryTimeoutMs: 60000,
  });

  sessions[sessionId].sock = sock;

  sock.ev.on("creds.update", async () => {
    await saveCreds();
  });

  sock.ev.on("messaging-history.set", () => {
    console.log("⏭️ Histórico ignorado");
  });

  sock.ev.on("messages.upsert", async (event) => {
    try {
      const { messages, type } = event;

      console.log("📥 Mensagem recebida:", {
        sessionId,
        type,
        total: messages?.length || 0,
      });

      for (const msg of messages || []) {
        const remoteJid = msg.key?.remoteJid || "";

        if (!msg.message) continue;
        if (msg.key?.fromMe) continue;
        if (remoteJid === "status@broadcast") continue;
        if (remoteJid.includes("@g.us")) continue;
        if (msg.message.protocolMessage) continue;

        const participant = msg.key?.participant || "";
        const senderJid = participant || remoteJid;

        const isLid = senderJid.includes("@lid");

        const phoneFromJid = senderJid.includes("@s.whatsapp.net")
          ? clean(senderJid.replace("@s.whatsapp.net", ""))
          : null;

        const lidFromJid = senderJid.includes("@lid") ? senderJid : null;

        const pushName = msg.pushName || "";
        const number = phoneFromJid || clean(senderJid);

        if (!number && !lidFromJid) continue;

        const text = extractMessageText(msg.message);

        if (!text || !text.trim()) continue;

        await notifyCRM({
          sessionId,
          number,
          phone: phoneFromJid,
          lid: lidFromJid,
          isLid,
          remoteJid: senderJid,
          pushName,
          message: text.trim(),
          source: "whatsapp",
          product: "zentra-rh",
          messageId: msg.key?.id || null,
        });
      }
    } catch (error) {
      console.error("Erro ao processar mensagem:", error);
    }
  });

  sock.ev.on("connection.update", async (update) => {
    console.log("CONNECTION UPDATE:", JSON.stringify(update, null, 2));

    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      try {
        const qrImage = await QRCode.toDataURL(qr);

        sessions[sessionId].qr = qrImage;
        sessions[sessionId].status = "qr_pending";
        sessions[sessionId].lastError = null;

        console.log(`📲 QR gerado para sessão ${sessionId}`);
      } catch (error) {
        sessions[sessionId].lastError = error.message;
        console.error("Erro ao gerar QR:", error.message);
      }
    }

    if (connection === "open") {
      sessions[sessionId].status = "online";
      sessions[sessionId].qr = null;
      sessions[sessionId].me = sock.user || null;
      sessions[sessionId].lastError = null;

      console.log(`✅ Sessão ${sessionId} conectada`);
      console.log("👤 Conta conectada:", sock.user);
      console.log("📌 Sessões ativas:", Object.keys(sessions));
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.data?.statusCode;

      const message = lastDisconnect?.error?.message || "";

      console.log(`❌ Sessão ${sessionId} desconectada:`, message, statusCode);

      if (sessions[sessionId]) {
        sessions[sessionId].status = "offline";
        sessions[sessionId].qr = null;
        sessions[sessionId].lastError = message;
      }

      if (
        statusCode === DisconnectReason.loggedOut ||
        statusCode === 440 ||
        statusCode === 401 ||
        statusCode === 403
      ) {
        console.log(`♻️ Limpando sessão ${sessionId} por status ${statusCode}`);

        try {
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, {
              recursive: true,
              force: true,
            });

            console.log(`🧹 Sessão ${sessionId} apagada`);
          }
        } catch (error) {
          console.error("Erro ao limpar sessão:", error);
        }

        return;
      }

      console.log(`🔄 Reconectando sessão ${sessionId} em 5s`);
      setTimeout(() => startSession(sessionId), 5000);
    }
  });

  return sessions[sessionId];
}

async function sendTextMessage(session, jid, message) {
  try {
    await session.sock.presenceSubscribe(jid);
    await session.sock.sendPresenceUpdate("composing", jid);
  } catch (e) {
    console.log("⚠️ Falha no presence/composing:", e.message);
  }

  await sleep(Math.floor(Math.random() * 2000) + 1000);

  const result = await session.sock.sendMessage(jid, {
    text: message,
  });

  try {
    await session.sock.sendPresenceUpdate("paused", jid);
  } catch {}

  return result;
}

async function sendAudioMessage(session, jid, audioUrl) {
  try {
    await session.sock.presenceSubscribe(jid);
    await session.sock.sendPresenceUpdate("recording", jid);
  } catch (e) {
    console.log("⚠️ Falha no presence/recording:", e.message);
  }

  await sleep(Math.floor(Math.random() * 3000) + 2000);

  const result = await session.sock.sendMessage(jid, {
    audio: { url: audioUrl },
    mimetype: "audio/ogg; codecs=opus",
    ptt: true,
  });

  try {
    await session.sock.sendPresenceUpdate("paused", jid);
  } catch {}

  return result;
}

async function sendMediaMessage(session, jid, mediaUrl, mediaType, caption = "") {
  const type = String(mediaType || "document").toLowerCase();

  const payload = {
    caption: caption || "",
  };

  if (type === "image") {
    payload.image = { url: mediaUrl };
  } else if (type === "video") {
    payload.video = { url: mediaUrl };
  } else if (type === "audio") {
    payload.audio = { url: mediaUrl };
    payload.mimetype = "audio/ogg; codecs=opus";
    payload.ptt = true;
  } else {
    payload.document = { url: mediaUrl };
    payload.fileName = path.basename(String(mediaUrl).split("?")[0]) || "arquivo";
  }

  await sleep(Math.floor(Math.random() * 2000) + 1000);

  return await session.sock.sendMessage(jid, payload);
}

async function getOnlineSessionOrFail(sessionId) {
  const session = sessions[String(sessionId)];

  if (!session || !session.sock) {
    throw new Error(`Sessão ${sessionId} não encontrada`);
  }

  if (session.status !== "online") {
    throw new Error(`Sessão ${sessionId} offline`);
  }

  return session;
}

async function handleSendText(req, res) {
  try {
    const payload = req.body;

    const { sessionId, message } = payload;
    const finalNumber =
      payload.jid || payload.lid || payload.number || payload.phone;

    console.log("📤 /send recebido:", {
      sessionId,
      number: payload.number,
      phone: payload.phone,
      lid: payload.lid,
      jid: payload.jid,
      message,
    });

    if (!sessionId || !finalNumber || !message) {
      return res.status(400).json({
        success: false,
        error: "sessionId, number/phone/lid/jid e message são obrigatórios",
      });
    }

    const session = await getOnlineSessionOrFail(sessionId);

    const cleanMessage = String(message || "").trim();

    if (!cleanMessage) {
      return res.status(400).json({
        success: false,
        error: "Mensagem vazia",
      });
    }

    const jid = await resolveJid(payload);

console.log("========== ENVIO ==========");
console.log({
  number: payload.number,
  phone: payload.phone,
  lid: payload.lid,
  jidEscolhido: jid,
});
console.log("===========================");

    console.log("🎯 JID final:", jid);

console.log({
  number: payload.number,
  phone: payload.phone,
  lid: payload.lid,
  jidEscolhido: jid,
});

    const result = await sendTextMessage(session, jid, cleanMessage);

    console.log("✅ Resultado sendMessage:", result);

    if (!result?.key?.id) {
      return res.status(500).json({
        success: false,
        error: "WhatsApp não gerou ID da mensagem",
        jid,
        result,
      });
    }

    return res.json({
      success: true,
      jid,
      messageId: result.key.id,
      ack: "ignored",
      from: session.me || session.sock.user || null,
    });
  } catch (error) {
    console.log("❌ Erro no envio de texto:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      activeSessions: Object.keys(sessions),
    });
  }
}

async function handleSendAudio(req, res) {
  try {
    const payload = req.body;

    const { sessionId, audioUrl } = payload;
    const finalNumber =
      payload.jid || payload.lid || payload.number || payload.phone;

    console.log("🎧 /send-audio recebido:", {
      sessionId,
      number: payload.number,
      phone: payload.phone,
      lid: payload.lid,
      jid: payload.jid,
      audioUrl,
    });

    if (!sessionId || !finalNumber || !audioUrl) {
      return res.status(400).json({
        success: false,
        error: "sessionId, number/phone/lid/jid e audioUrl são obrigatórios",
      });
    }

    const session = await getOnlineSessionOrFail(sessionId);

    const jid = await resolveJid(payload);

    console.log("🎯 JID final áudio:", jid);

    const result = await sendAudioMessage(session, jid, audioUrl);

    console.log("✅ Resultado sendAudio:", result);

    if (!result?.key?.id) {
      return res.status(500).json({
        success: false,
        error: "WhatsApp não gerou ID do áudio",
        jid,
        result,
      });
    }

    return res.json({
      success: true,
      jid,
      messageId: result.key.id,
      ack: "ignored",
      from: session.me || session.sock.user || null,
    });
  } catch (error) {
    console.error("Erro ao enviar áudio:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      activeSessions: Object.keys(sessions),
    });
  }
}

async function handleSendMedia(req, res) {
  try {
    const payload = req.body;

    const { sessionId, mediaUrl, mediaType, caption } = payload;
    const finalNumber =
      payload.jid || payload.lid || payload.number || payload.phone;

    console.log("🖼️ /send-media recebido:", {
      sessionId,
      number: payload.number,
      phone: payload.phone,
      lid: payload.lid,
      jid: payload.jid,
      mediaUrl,
      mediaType,
      caption,
    });

    if (!sessionId || !finalNumber || !mediaUrl) {
      return res.status(400).json({
        success: false,
        error: "sessionId, number/phone/lid/jid e mediaUrl são obrigatórios",
      });
    }

    const session = await getOnlineSessionOrFail(sessionId);

    const jid = await resolveJid(payload);

    console.log("🎯 JID final mídia:", jid);

    const result = await sendMediaMessage(
      session,
      jid,
      mediaUrl,
      mediaType,
      caption || ""
    );

    console.log("✅ Resultado sendMedia:", result);

    if (!result?.key?.id) {
      return res.status(500).json({
        success: false,
        error: "WhatsApp não gerou ID da mídia",
        jid,
        result,
      });
    }

    return res.json({
      success: true,
      jid,
      messageId: result.key.id,
      ack: "ignored",
      from: session.me || session.sock.user || null,
    });
  } catch (error) {
    console.error("Erro ao enviar mídia:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      activeSessions: Object.keys(sessions),
    });
  }
}

async function restartSession(sessionId) {
  sessionId = String(sessionId || "").trim();

  if (!sessionId) {
    throw new Error("sessionId obrigatório");
  }

  console.log(`♻️ Resetando sessão ${sessionId}`);

  if (sessions[sessionId]?.sock) {
    try {
      sessions[sessionId].sock.end();
    } catch {}
  }

  delete sessions[sessionId];

  const sessionPath = path.join(__dirname, "sessions", sessionId);

  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
    console.log(`🧹 Pasta da sessão ${sessionId} apagada`);
  }

  await sleep(1000);

  return await startSession(sessionId);
}

app.post("/start", async (req, res) => {
  try {
    const sessionId = req.body?.sessionId || req.body?.id;
    const session = await startSession(sessionId);

    return res.json({
      success: true,
      status: session.status,
      qr: session.qr,
      me: session.me,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/start/:id", async (req, res) => {
  try {
    const session = await startSession(req.params.id);

    return res.json({
      success: true,
      status: session.status,
      qr: session.qr,
      me: session.me,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/start/:id", async (req, res) => {
  try {
    const session = await startSession(req.params.id);

    return res.json({
      success: true,
      status: session.status,
      qr: session.qr,
      me: session.me,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/restart", async (req, res) => {
  try {
    const sessionId = req.body?.sessionId || req.body?.id;
    const session = await restartSession(sessionId);

    return res.json({
      success: true,
      status: session.status,
      qr: session.qr,
      me: session.me,
    });
  } catch (error) {
    console.error("Erro ao resetar sessão:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/restart/:id", async (req, res) => {
  try {
    const session = await restartSession(req.params.id);

    return res.json({
      success: true,
      status: session.status,
      qr: session.qr,
      me: session.me,
    });
  } catch (error) {
    console.error("Erro ao resetar sessão:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/restart/:id", async (req, res) => {
  try {
    const session = await restartSession(req.params.id);

    return res.json({
      success: true,
      status: session.status,
      qr: session.qr,
      me: session.me,
    });
  } catch (error) {
    console.error("Erro ao resetar sessão:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/send", handleSendText);
app.post("/send-reminder", handleSendText);
app.post("/send-interview", handleSendText);
app.post("/send-hiring", handleSendText);
app.post("/send-document", handleSendText);

app.post("/send-audio", handleSendAudio);
app.post("/send-media", handleSendMedia);

app.get("/qr/:id", (req, res) => {
  const session = sessions[String(req.params.id)];

  if (!session) {
    return res.json({
      qr: null,
      status: "offline",
    });
  }

  return res.json({
    qr: session.qr,
    status: session.status,
    me: session.me,
    lastError: session.lastError || null,
  });
});

app.get("/status/:id", (req, res) => {
  const session = sessions[String(req.params.id)];

  return res.json({
    success: true,
    status: session?.status || "offline",
    hasQr: Boolean(session?.qr),
    connected: session?.status === "online",
    activeSessions: Object.keys(sessions),
    me: session?.me || null,
    lastError: session?.lastError || null,
    timestamp: new Date().toISOString(),
  });
});

app.get("/me/:id", (req, res) => {
  const session = sessions[String(req.params.id)];

  return res.json({
    success: Boolean(session?.sock),
    status: session?.status || "offline",
    me: session?.me || session?.sock?.user || null,
    activeSessions: Object.keys(sessions),
  });
});

app.get("/health", (req, res) => {
  return res.json({
    success: true,
    server: "Zentra RH",
    status: "online",
    uptime: process.uptime(),
    port: PORT,
    appUrl: ZENTRA_APP_URL,
    incomingEndpoint: `${ZENTRA_APP_URL}/api/whatsapp/incoming`,
    sessions: Object.keys(sessions).length,
    activeSessions: Object.keys(sessions),
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "WhatsApp server Zentra RH rodando",
    port: PORT,
    appUrl: ZENTRA_APP_URL,
    activeSessions: Object.keys(sessions),
    routing: {
      "all sessions": "Zentra RH",
      endpoint: `${ZENTRA_APP_URL}/api/whatsapp/incoming`,
    },
    routes: [
      "GET /health",
      "GET /qr/:id",
      "GET /status/:id",
      "POST /start/:id",
      "POST /restart/:id",
      "POST /send",
      "POST /send-audio",
      "POST /send-media",
      "POST /send-reminder",
      "POST /send-interview",
      "POST /send-hiring",
      "POST /send-document",
    ],
  });
});

async function restoreSessions() {
  try {
    const sessionsDir = path.join(__dirname, "sessions");

    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
      return;
    }

    const folders = fs
      .readdirSync(sessionsDir)
      .filter((file) =>
        fs.statSync(path.join(sessionsDir, file)).isDirectory()
      );

    console.log("♻️ Restaurando sessões:", folders);

    for (const sessionId of folders) {
      try {
        await startSession(sessionId);
      } catch (error) {
        console.error(
          `Erro ao restaurar sessão ${sessionId}:`,
          error?.message || error
        );
      }
    }
  } catch (error) {
    console.error("Erro ao restaurar sessões:", error);
  }
}

app.listen(PORT, async () => {
  console.log(`🔥 WhatsApp server Zentra RH rodando na porta ${PORT}`);
  console.log(`📌 Todas as sessões → ${ZENTRA_APP_URL}/api/whatsapp/incoming`);

  await restoreSessions();
});