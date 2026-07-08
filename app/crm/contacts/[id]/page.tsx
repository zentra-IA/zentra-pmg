"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "enviado", label: "Enviado" },
  { value: "respondeu", label: "Respondeu" },
  { value: "quer_agendar_entrevista", label: "Quer agendar entrevista" },
  { value: "entrevista_agendada", label: "Agendou entrevista" },
  { value: "campanha", label: "Campanha" },
  { value: "reagendar_futuro", label: "Reagendar futuro" },
  { value: "contratado", label: "Contratado" },
  { value: "sem_interesse", label: "Sem interesse" },
  { value: "nao_aprovado", label: "Não aprovado" },
];

const LEGACY_STATUS: Record<string, string> = {
  respondido: "respondeu",
  interesse: "quer_agendar_entrevista",
  pedido: "entrevista_agendada",
  reativar_futuro: "reagendar_futuro",
  finalizado: "contratado",
};

function normalizeStatus(value?: string | null) {
  const status = String(value || "novo").trim();
  return LEGACY_STATUS[status] || status || "novo";
}

function statusLabel(value?: string | null) {
  const normalized = normalizeStatus(value);
  return STATUS_OPTIONS.find((item) => item.value === normalized)?.label || normalized;
}

function formatPhone(value?: string | null) {
  if (!value) return "-";
  const digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("55")) return `+${digits}`;
  return value;
}

function whatsappLink(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "#";
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [contact, setContact] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [manualMessage, setManualMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingManual, setSendingManual] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetchContact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchContact() {
    setPageLoading(true);

    const { data: contactData } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: true });

    setContact(contactData);
    setMessages(messagesData || []);
    setPageLoading(false);
  }

  async function updateLead(patch: any, successMessage: string) {
    setLoading(true);

    const { error } = await supabase
      .from("leads")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setLoading(false);

    if (error) {
      alert("Erro ao atualizar contato.");
      console.error(error);
      return;
    }

    await fetchContact();
    alert(successMessage);
  }

  async function updateStatus(status: string) {
    await updateLead({ status }, "Status atualizado.");
  }

  async function reactivateAI() {
    await updateLead(
      {
        ai_paused: false,
        conversation_stage: "new",
        status: "respondeu",
      },
      "IA reativada."
    );
  }

  async function pauseAI() {
    await updateLead(
      {
        ai_paused: true,
        conversation_stage: "human_handoff",
      },
      "IA pausada."
    );
  }

  async function resetFunnel() {
    await updateLead(
      {
        ai_paused: false,
        conversation_stage: "new",
        status: "novo",
        last_message: null,
        last_message_at: null,
      },
      "Funil resetado."
    );
  }

  async function sendManualMessage() {
    if (!manualMessage.trim()) {
      alert("Digite uma mensagem.");
      return;
    }

    setSendingManual(true);

    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contactId: id,
        leadId: id,
        message: manualMessage,
        sessionId: "1",
      }),
    });

    const data = await res.json().catch(() => ({}));

    setSendingManual(false);

    if (!data.success) {
      alert(data.error || "Erro ao enviar mensagem.");
      return;
    }

    setManualMessage("");
    await fetchContact();
  }

  if (pageLoading) return <div style={styles.page}>Carregando...</div>;
  if (!contact) return <div style={styles.page}>Contato não encontrado.</div>;

  const phone = contact.phone || contact.telefone || contact.mobile;

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.kicker}>Zentra RH</p>
          <h1 style={styles.title}>{contact.name || contact.nome || "Contato"}</h1>
          <p style={styles.subtitle}>
            Detalhe do candidato, histórico de WhatsApp e ações rápidas do funil.
          </p>
        </div>

        <Link style={styles.secondaryButton} href="/crm/dashboard/contacts">
          Voltar para contatos
        </Link>
      </section>

      <section style={styles.grid}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Dados do contato</h2>

          <div style={styles.infoList}>
            <Info label="Nome" value={contact.name || contact.nome || "Sem nome"} />
            <Info label="Telefone" value={formatPhone(phone)} />
            <Info label="E-mail" value={contact.email || "-"} />
            <Info label="WhatsApp LID" value={contact.whatsapp_lid || "Não vinculado"} />
            <Info label="Status" value={statusLabel(contact.status)} />
            <Info label="Etapa" value={contact.conversation_stage || "Sem etapa"} />
            <Info label="IA pausada" value={contact.ai_paused ? "Sim" : "Não"} />
          </div>

          <div style={styles.actions}>
            <a style={styles.successButton} href={whatsappLink(phone)} target="_blank" rel="noreferrer">
              Abrir WhatsApp
            </a>

            <button style={styles.secondaryButton} onClick={reactivateAI} disabled={loading}>
              Reativar IA
            </button>

            <button style={styles.secondaryButton} onClick={pauseAI} disabled={loading}>
              Pausar IA
            </button>

            <button style={styles.dangerButton} onClick={resetFunnel} disabled={loading}>
              Resetar funil
            </button>
          </div>

          <div style={styles.statusBox}>
            <label style={styles.label}>Mover no Kanban</label>

            <select
              style={styles.input}
              value={normalizeStatus(contact.status)}
              onChange={(event) => updateStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Responder pelo CRM</h2>

          <textarea
            value={manualMessage}
            onChange={(event) => setManualMessage(event.target.value)}
            placeholder="Digite a resposta manual para o candidato..."
            style={{ ...styles.input, minHeight: 150 }}
          />

          <button
            onClick={sendManualMessage}
            disabled={sendingManual}
            style={styles.primaryButton}
          >
            {sendingManual ? "Enviando..." : "Enviar mensagem"}
          </button>
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Histórico de conversa</h2>

        {messages.length === 0 && (
          <p style={styles.smallText}>Nenhuma mensagem ainda.</p>
        )}

        <div style={styles.messages}>
          {messages.map((msg) => {
            const sent =
              msg.direction === "sent" ||
              msg.direction === "outgoing" ||
              msg.from_me === true;

            return (
              <div key={msg.id} style={sent ? styles.messageSent : styles.messageReceived}>
                <p>{msg.content || msg.message || ""}</p>
                <span>{formatDate(msg.created_at)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.infoItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 20,
    background: "linear-gradient(135deg, #eff6ff, #ffffff, #dbeafe)",
    color: "#0f172a",
  },
  hero: {
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 24,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    boxShadow: "0 18px 50px rgba(37,99,235,.08)",
  },
  kicker: {
    margin: 0,
    color: "#2563eb",
    fontWeight: 900,
    letterSpacing: ".22em",
    fontSize: 12,
    textTransform: "uppercase",
  },
  title: {
    margin: "8px 0",
    fontSize: 36,
    fontWeight: 950,
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
  },
  grid: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18,
  },
  card: {
    marginTop: 18,
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 22,
    boxShadow: "0 18px 50px rgba(37,99,235,.06)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 950,
  },
  infoList: {
    marginTop: 16,
    display: "grid",
    gap: 10,
  },
  infoItem: {
    border: "1px solid #dbeafe",
    background: "#f8fafc",
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 4,
  },
  actions: {
    marginTop: 16,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 16,
    border: "1px solid #bfdbfe",
    background: "#f8fafc",
    padding: "13px 14px",
    outline: "none",
    fontSize: 14,
    color: "#0f172a",
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    fontWeight: 900,
    color: "#334155",
  },
  statusBox: {
    marginTop: 16,
  },
  primaryButton: {
    marginTop: 12,
    border: 0,
    borderRadius: 16,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
  },
  secondaryButton: {
    border: "1px solid #bfdbfe",
    borderRadius: 14,
    padding: "10px 12px",
    background: "#fff",
    color: "#2563eb",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    textAlign: "center",
  },
  successButton: {
    border: 0,
    borderRadius: 14,
    padding: "10px 12px",
    background: "#16a34a",
    color: "#fff",
    fontWeight: 900,
    textDecoration: "none",
    textAlign: "center",
  },
  dangerButton: {
    border: 0,
    borderRadius: 14,
    padding: "10px 12px",
    background: "#ef4444",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  messages: {
    marginTop: 16,
    maxHeight: 520,
    overflowY: "auto",
    display: "grid",
    gap: 10,
    background: "#f8fafc",
    border: "1px solid #dbeafe",
    borderRadius: 20,
    padding: 14,
  },
  messageReceived: {
    justifySelf: "start",
    maxWidth: "78%",
    background: "#fff",
    border: "1px solid #dbeafe",
    borderRadius: 18,
    padding: 12,
    color: "#0f172a",
    whiteSpace: "pre-wrap",
  },
  messageSent: {
    justifySelf: "end",
    maxWidth: "78%",
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    borderRadius: 18,
    padding: 12,
    color: "#fff",
    whiteSpace: "pre-wrap",
  },
  smallText: {
    color: "#64748b",
    fontSize: 13,
  },
};
