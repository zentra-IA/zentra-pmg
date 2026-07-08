"use client";

import { useEffect, useRef, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo", prospect: "Prospect", enviado: "Enviado", respondeu: "Respondeu",
  cotacao: "Cotação", comprou: "Comprou", cliente_ativo: "Cliente ativo",
  cliente_risco: "Cliente em risco", inativo: "Inativo", sem_interesse: "Sem interesse",
  respondido: "Respondeu", interesse: "Interessado", pedido: "Cotação", finalizado: "Comprou",
};

function normalizeStatus(status?: string | null) {
  const map: Record<string, string> = { respondido: "respondeu", interesse: "cotacao", pedido: "cotacao", finalizado: "comprou" };
  return map[String(status || "novo")] || String(status || "novo");
}

const styles = {
  page: { padding: 24, color: "#0f172a" },
  hero: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18, padding: 22, borderRadius: 28, background: "linear-gradient(135deg,#ffffff,#eef7ff)", border: "1px solid rgba(37,99,235,.12)", boxShadow: "0 18px 45px rgba(15,23,42,.06)" },
  kicker: { margin: 0, color: "#2563eb", fontWeight: 900, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" as const },
  title: { margin: "6px 0", fontSize: 34, lineHeight: 1, letterSpacing: "-.04em", fontWeight: 950 },
  subtitle: { margin: 0, maxWidth: 760, color: "#64748b", lineHeight: 1.55, fontWeight: 650 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 18 },
  card: { background: "#fff", border: "1px solid rgba(148,163,184,.22)", borderRadius: 24, padding: 18, boxShadow: "0 14px 34px rgba(15,23,42,.05)" },
  sectionTitle: { margin: "0 0 12px", fontSize: 18, fontWeight: 950, letterSpacing: "-.02em" },
  input: { width: "100%", border: "1px solid #dbe3ef", background: "#fff", padding: "12px 14px", borderRadius: 16, outline: "none", fontWeight: 700, color: "#0f172a" },
  label: { display: "block", fontSize: 12, color: "#64748b", fontWeight: 900, marginBottom: 6 },
  primary: { border: 0, color: "#fff", background: "linear-gradient(135deg,#2563eb,#06b6d4)", padding: "12px 16px", borderRadius: 16, fontWeight: 950, cursor: "pointer", boxShadow: "0 14px 30px rgba(37,99,235,.22)" },
  secondary: { border: "1px solid rgba(37,99,235,.25)", color: "#1d4ed8", background: "#fff", padding: "11px 14px", borderRadius: 16, fontWeight: 950, cursor: "pointer" },
  danger: { border: "1px solid #fecaca", color: "#b91c1c", background: "#fff1f2", padding: "11px 14px", borderRadius: 16, fontWeight: 950, cursor: "pointer" },
  tableWrap: { overflowX: "auto" as const, background: "#fff", border: "1px solid rgba(148,163,184,.22)", borderRadius: 24, boxShadow: "0 14px 34px rgba(15,23,42,.05)" },
  table: { width: "100%", borderCollapse: "collapse" as const, minWidth: 820 },
  th: { textAlign: "left" as const, padding: 14, fontSize: 12, color: "#64748b", borderBottom: "1px solid #e2e8f0", fontWeight: 950 },
  td: { padding: 14, borderBottom: "1px solid #f1f5f9", fontSize: 13, fontWeight: 700, color: "#334155" },
  badge: { display: "inline-flex", padding: "6px 10px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", fontSize: 12, fontWeight: 950 },
} as const;

function Metric({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <div style={styles.card}>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 950 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 950, letterSpacing: "-.04em" }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 12, fontWeight: 750 }}>{hint}</div> : null}
    </div>
  );
}


export default function InboxPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadInbox(leadId?: string) {
    setLoading(true);
    try {
      const url = leadId ? `/api/crm/inbox?leadId=${leadId}&t=${Date.now()}` : `/api/crm/inbox?t=${Date.now()}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (leadId) {
        const rawMessages = data.messages || data.items || data || [];
        const safeMessages = Array.isArray(rawMessages) ? rawMessages : [];
        setMessages(safeMessages);
      } else {
        const rawItems = data.leads || data.items || data.data || data.customers || data.conversations || data || [];
        const items = Array.isArray(rawItems) ? rawItems : [];
        setLeads(items);
        if (!selectedLead && items[0]) setSelectedLead(items[0]);
      }
    } finally { setLoading(false); }
  }

  async function sendMessage() {
    if (!selectedLead || !text.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/inbox-send", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selectedLead.id, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "Erro ao enviar mensagem.");
      setText(""); loadInbox(selectedLead.id);
    } finally { setSending(false); }
  }

  async function updateStatus(status: string) {
    if (!selectedLead) return;
    const res = await fetch("/api/crm/inbox", {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: selectedLead.id, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || "Erro ao atualizar status.");
    setSelectedLead({ ...selectedLead, status });
    loadInbox();
  }

  useEffect(() => { loadInbox(); const t = setInterval(() => loadInbox(), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (selectedLead?.id) loadInbox(selectedLead.id); }, [selectedLead?.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.kicker}>WhatsApp comercial</p>
          <h1 style={styles.title}>Inbox WhatsApp</h1>
          <p style={styles.subtitle}>Centralize conversas com clientes, acompanhe status comercial e responda com velocidade sem perder o histórico da carteira.</p>
        </div>
        <button style={styles.secondary} onClick={() => { loadInbox(); selectedLead?.id && loadInbox(selectedLead.id); }}>Atualizar</button>
      </section>

      <section style={styles.grid}>
        <Metric label="Conversas" value={leads.length} />
        <Metric label="Cliente aberto" value={selectedLead ? "1" : "0"} />
        <Metric label="Mensagens" value={messages.length} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "360px minmax(0,1fr)", gap: 16, minHeight: 620 }}>
        <aside style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0" }}>
            <h2 style={styles.sectionTitle}>Conversas</h2>
            <input style={styles.input} placeholder="Buscar cliente..." />
          </div>
          <div style={{ maxHeight: 560, overflow: "auto" }}>
            {leads.map((lead) => (
              <button key={lead.id} onClick={() => setSelectedLead(lead)} style={{ width: "100%", textAlign: "left", padding: 14, border: 0, borderBottom: "1px solid #f1f5f9", background: selectedLead?.id === lead.id ? "#eff6ff" : "#fff", cursor: "pointer" }}>
                <strong style={{ display: "block", color: "#0f172a" }}>{lead.name || lead.nome || lead.phone || "Cliente"}</strong>
                <span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 3 }}>{lead.lastMessage || lead.last_message || lead.phone || "-"}</span>
                <span style={{ ...styles.badge, marginTop: 8 }}>{STATUS_LABELS[normalizeStatus(lead.status)] || normalizeStatus(lead.status)}</span>
              </button>
            ))}
            {!leads.length ? <div style={{ padding: 18, color: "#64748b", fontWeight: 800 }}>{loading ? "Carregando..." : "Nenhuma conversa encontrada."}</div> : null}
          </div>
        </aside>

        <div style={{ ...styles.card, display: "flex", flexDirection: "column", minHeight: 620 }}>
          {selectedLead ? (
            <>
              <header style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 14 }}>
                <div>
                  <h2 style={{ ...styles.sectionTitle, marginBottom: 4 }}>{selectedLead.name || selectedLead.nome || "Cliente"}</h2>
                  <span style={styles.badge}>{STATUS_LABELS[normalizeStatus(selectedLead.status)] || "Novo"}</span>
                </div>
                <select style={{ ...styles.input, maxWidth: 220 }} value={normalizeStatus(selectedLead.status)} onChange={(e) => updateStatus(e.target.value)}>
                  {Object.entries(STATUS_LABELS).filter(([k]) => !["respondido","interesse","pedido","finalizado"].includes(k)).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </header>

              <div style={{ flex: 1, overflow: "auto", padding: "18px 0", display: "grid", alignContent: "start", gap: 10 }}>
                {messages.map((msg, index) => {
                  const mine = msg.direction === "out" || msg.fromMe || msg.role === "assistant";
                  return (
                    <div key={msg.id || index} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "78%", padding: "12px 14px", borderRadius: 18, background: mine ? "linear-gradient(135deg,#2563eb,#06b6d4)" : "#f1f5f9", color: mine ? "#fff" : "#0f172a", fontWeight: 700, lineHeight: 1.45 }}>
                        {msg.body || msg.text || msg.message || ""}
                        <div style={{ opacity: .7, fontSize: 11, marginTop: 6 }}>{msg.created_at ? new Date(msg.created_at).toLocaleString("pt-BR") : ""}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <footer style={{ display: "flex", gap: 10, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                <textarea style={{ ...styles.input, minHeight: 54 }} placeholder="Digite uma resposta comercial..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
                <button style={styles.primary} onClick={sendMessage} disabled={sending}>{sending ? "..." : "Enviar"}</button>
              </footer>
            </>
          ) : (
            <div style={{ margin: "auto", color: "#64748b", fontWeight: 900 }}>Selecione uma conversa.</div>
          )}
        </div>
      </section>
    </main>
  );
}
