"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

const SESSIONS = [1, 2, 3, 4, 5];

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
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

const INTENTS = [
  { value: "RH_ABERTURA", label: "Abertura de vaga" },
  { value: "RH_ENTREVISTA", label: "Convite entrevista" },
  { value: "RH_RELEMBRETE", label: "Lembrete entrevista" },
  { value: "RH_REAGENDAMENTO", label: "Reagendamento" },
  { value: "RH_BANCO_TALENTOS", label: "Banco de talentos" },
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

function onlyDigits(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: any) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function formatPhone(value?: string | null) {
  const digits = normalizePhone(value);
  if (!digits) return "-";
  return `+${digits}`;
}

function parseBulk(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\t|]/).map((item) => item.trim());
      const maybePhone = parts.find((part) => onlyDigits(part).length >= 10);
      const phone = normalizePhone(maybePhone || "");
      const name =
        parts.find((part) => part !== maybePhone && !/^\d+$/.test(onlyDigits(part))) ||
        "Candidato";

      return phone ? { name, phone } : null;
    })
    .filter(Boolean) as { name: string; phone: string }[];
}

function whatsappLink(value?: string | null) {
  const digits = normalizePhone(value);
  if (!digits) return "#";
  return `https://wa.me/${digits}`;
}

export default function ContactsDispatchPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [queueStats, setQueueStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const [filters, setFilters] = useState({
    q: "",
    status: "",
    batchId: "",
    jobId: "",
  });

  const [manual, setManual] = useState({
    name: "",
    phone: "",
    email: "",
  });

  const [bulkText, setBulkText] = useState("");
  const [intent, setIntent] = useState("RH_ABERTURA");
  const [sessionId, setSessionId] = useState("0");

  async function loadContacts() {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status) params.set("status", filters.status);
      if (filters.batchId) params.set("batchId", filters.batchId);
      if (filters.jobId) params.set("jobId", filters.jobId);
      params.set("limit", "1000");

      const res = await fetch(`/api/crm/leads?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao carregar contatos.");
        return;
      }

      setContacts(data.leads || data || []);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadQueueStats() {
    const res = await fetch("/api/crm/queue", {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) setQueueStats(data);
  }

  async function loadBatches() {
    const res = await fetch("/api/rh/recruitment-batches", {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) setBatches(data.batches || []);
  }

  useEffect(() => {
    loadContacts();
    loadQueueStats();
    loadBatches();

    const interval = setInterval(loadQueueStats, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const batchOptions = useMemo(() => batches || [], [batches]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      if (filters.batchId && String(contact.batch_id || "") !== filters.batchId) return false;
      if (filters.jobId && String(contact.job_id || contact.current_job_id || "") !== filters.jobId) return false;
      return true;
    });
  }, [contacts, filters.batchId, filters.jobId]);

  function batchName(id?: string | null, contact?: any) {
    if (!id) return contact?.batch_name || "-";
    const batch = batches.find((item) => String(item.id) === String(id));
    return contact?.batch_name || batch?.name || String(id).slice(0, 8);
  }

  function jobName(id?: string | null, contact?: any) {
    if (!id) return contact?.job_title || "-";
    const batch = batches.find((item) => String(item.job_id) === String(id));
    return contact?.job_title || contact?.job?.title || batch?.job?.title || String(id).slice(0, 8);
  }

  const stats = useMemo(() => {
    return {
      total: filteredContacts.length,
      enviados: filteredContacts.filter((item) => normalizeStatus(item.status) === "enviado").length,
      respondeu: filteredContacts.filter((item) => normalizeStatus(item.status) === "respondeu").length,
      entrevista: filteredContacts.filter((item) =>
        ["quer_agendar_entrevista", "entrevista_agendada"].includes(normalizeStatus(item.status))
      ).length,
    };
  }, [filteredContacts]);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleAll() {
    if (selectedIds.length === filteredContacts.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(filteredContacts.map((item) => item.id));
  }

  function selectedContacts() {
    if (!selectedIds.length) return filteredContacts;
    return filteredContacts.filter((item) => selectedIds.includes(item.id));
  }

  async function createLead(payload: any) {
    const res = await fetch("/api/crm/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || "Erro ao salvar contato.");

    return data.lead;
  }

  async function addManual() {
    if (!manual.phone.trim()) {
      alert("Informe o telefone.");
      return;
    }

    try {
      await createLead({
        name: manual.name || "Candidato",
        phone: manual.phone,
        email: manual.email || null,
        status: "novo",
      });

      setManual({ name: "", phone: "", email: "" });
      await loadContacts();
    } catch (error: any) {
      alert(error.message || "Erro ao adicionar contato.");
    }
  }

  async function addBulk() {
    const rows = parseBulk(bulkText);

    if (!rows.length) {
      alert("Cole contatos no formato: Nome, Telefone");
      return;
    }

    try {
      for (const row of rows) {
        await createLead({
          name: row.name,
          phone: row.phone,
          status: "novo",
        });
      }

      setBulkText("");
      await loadContacts();
      alert(`${rows.length} contato(s) adicionados.`);
    } catch (error: any) {
      alert(error.message || "Erro ao adicionar em massa.");
    }
  }

  async function importSpreadsheet() {
    if (!file) {
      alert("Selecione uma planilha.");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

      let imported = 0;

      for (const row of rows) {
        const keys = Object.keys(row);
        const nameKey = keys.find((key) => /nome|name|candidato/i.test(key));
        const phoneKey = keys.find((key) => /telefone|celular|whats|phone/i.test(key));
        const emailKey = keys.find((key) => /email|e-mail/i.test(key));

        const phone = normalizePhone(phoneKey ? row[phoneKey] : "");

        if (!phone) continue;

        await createLead({
          name: nameKey ? row[nameKey] : "Candidato",
          phone,
          email: emailKey ? row[emailKey] : null,
          status: "novo",
        });

        imported++;
      }

      setFile(null);
      await loadContacts();
      alert(`${imported} contato(s) importados.`);
    } catch (error: any) {
      console.error(error);
      alert("Erro ao importar planilha.");
    }
  }

  async function enqueueSelected(smart = true) {
    const items = selectedContacts().filter((item) => item.phone);

    if (!items.length) {
      alert("Nenhum contato com telefone.");
      return;
    }

    if (!confirm(`Adicionar ${items.length} contato(s) na fila de disparo?`)) return;

    setQueueLoading(true);

    try {
      let ok = 0;
      let fail = 0;

      for (const item of items) {
        const res = await fetch("/api/crm/queue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            lead_id: item.id,
            job_id: item.job_id || item.current_job_id || null,
            batch_id: item.batch_id || null,
            intent,
            session_id: smart ? 0 : Number(sessionId || 1),
          }),
        });

        if (res.ok) ok++;
        else fail++;
      }

      await loadContacts();
      await loadQueueStats();

      alert(`Fila criada. Sucesso: ${ok}. Erros: ${fail}.`);
    } finally {
      setQueueLoading(false);
    }
  }


  async function deleteContacts(ids: string[]) {
    const uniqueIds = [...new Set(ids)].filter(Boolean);

    if (!uniqueIds.length) {
      alert("Selecione pelo menos um contato.");
      return;
    }

    if (!confirm(`Excluir ${uniqueIds.length} contato(s)?`)) return;

    const res = await fetch("/api/crm/leads", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ ids: uniqueIds }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Erro ao excluir contato(s).");
      return;
    }

    setSelectedIds([]);
    await loadContacts();
    await loadQueueStats();
    alert(`${data.deleted || uniqueIds.length} contato(s) excluído(s).`);
  }

  async function deleteSelectedContacts() {
    await deleteContacts(selectedIds);
  }

  async function queueAction(action: "pause" | "resume") {
    const res = await fetch("/api/crm/queue", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ action }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Erro na fila.");
      return;
    }

    await loadQueueStats();
    alert(`${data.updated || 0} item(ns) atualizados.`);
  }

  async function startSession(id: number) {
    const res = await fetch(`/api/whatsapp/start/${id}`, {
      method: "POST",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      alert(data.error || "Erro ao iniciar WhatsApp.");
      return;
    }

    await loadQueueStats();
    alert(`WhatsApp ${id} iniciado.`);
  }

  async function restartSession(id: number) {
    const res = await fetch(`/api/whatsapp/restart/${id}`, {
      method: "POST",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      alert(data.error || "Erro ao reiniciar WhatsApp.");
      return;
    }

    await loadQueueStats();
    alert(`WhatsApp ${id} reiniciado.`);
  }

  async function copyPhones() {
    const text = selectedContacts()
      .map((item) => {
        const phone = item.phone || item.telefone || item.mobile;
        return phone ? `${item.name || item.nome || "Contato"}, ${phone}` : null;
      })
      .filter(Boolean)
      .join("\n");

    if (!text) {
      alert("Nenhum telefone para copiar.");
      return;
    }

    await navigator.clipboard.writeText(text);
    alert("Telefones copiados.");
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.kicker}>Zentra RH</p>
          <h1 style={styles.title}>Contatos e Disparos</h1>
          <p style={styles.subtitle}>
            Importe candidatos, cole contatos em massa, distribua disparos entre WhatsApps e acompanhe o limite antiban.
          </p>
        </div>

        <button style={styles.primaryButton} onClick={() => { loadContacts(); loadQueueStats(); loadBatches(); }}>
          Atualizar
        </button>
      </section>

      <section style={styles.whatsappGrid}>
        {SESSIONS.map((id) => {
          const item = queueStats?.stats?.[id] || {};
          const used = Number(item.used || 0);
          const limit = Number(item.limit || queueStats?.antiban?.maxPerSessionDay || 80);
          const online = Boolean(item.online);

          return (
            <div key={id} style={styles.whatsappCard}>
              <div style={styles.whatsappTop}>
                <strong>WhatsApp {id}</strong>
                <span style={online ? styles.online : styles.offline}>
                  {online ? "Online" : "Offline"}
                </span>
              </div>

              <div style={styles.limitText}>{used}/{limit}</div>
              <div style={styles.progress}>
                <div style={{ ...styles.progressBar, width: `${Math.min(100, Math.round((used / limit) * 100))}%` }} />
              </div>

              <div style={styles.whatsappActions}>
                <button style={styles.secondaryButton} onClick={() => startSession(id)}>Conectar</button>
                <button style={styles.secondaryButton} onClick={() => restartSession(id)}>Reiniciar</button>
              </div>
            </div>
          );
        })}
      </section>

      <section style={styles.statsGrid}>
        <Metric label="Total" value={stats.total} />
        <Metric label="Enviados" value={stats.enviados} />
        <Metric label="Responderam" value={stats.respondeu} />
        <Metric label="Entrevista" value={stats.entrevista} />
        <Metric label="Na fila" value={queueStats?.pending || 0} />
        <Metric label="Pausados" value={queueStats?.paused || 0} />
      </section>

      <section style={styles.gridTwo}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Importar planilha</h2>
          <p style={styles.smallText}>Aceita XLSX/CSV com Nome, Telefone e Email.</p>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            style={styles.fileInput}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />

          <button style={styles.primaryButton} onClick={importSpreadsheet}>
            Importar
          </button>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Adicionar manual</h2>

          <div style={styles.formGrid}>
            <input style={styles.input} placeholder="Nome" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            <input style={styles.input} placeholder="Telefone" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} />
            <input style={styles.input} placeholder="E-mail" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
          </div>

          <button style={styles.primaryButton} onClick={addManual}>
            Adicionar
          </button>
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Colar contatos em massa</h2>
        <p style={styles.smallText}>Formato: Nome, Telefone. Um por linha.</p>

        <textarea
          style={{ ...styles.input, minHeight: 130 }}
          placeholder={`João, 11999999999\nMaria, 11988888888`}
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
        />

        <button style={styles.primaryButton} onClick={addBulk}>
          Adicionar em massa
        </button>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Disparo</h2>

        <div style={styles.dispatchGrid}>
          <select style={styles.input} value={intent} onChange={(e) => setIntent(e.target.value)}>
            {INTENTS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <select style={styles.input} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="0">Distribuição inteligente</option>
            {SESSIONS.map((id) => (
              <option key={id} value={id}>WhatsApp {id}</option>
            ))}
          </select>

          <button style={styles.primaryButton} disabled={queueLoading} onClick={() => enqueueSelected(true)}>
            {queueLoading ? "Enfileirando..." : "Disparo inteligente"}
          </button>

          <button style={styles.secondaryButton} disabled={queueLoading} onClick={() => enqueueSelected(false)}>
            Disparo manual
          </button>

          <button style={styles.dangerButton} onClick={() => queueAction("pause")}>
            Pausar
          </button>

          <button style={styles.successButton} onClick={() => queueAction("resume")}>
            Retomar
          </button>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.listHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Base de contatos</h2>
            <p style={styles.smallText}>
              {selectedIds.length
                ? `${selectedIds.length} contato(s) selecionado(s).`
                : "Nenhum selecionado. O disparo usa todos da lista filtrada."}
            </p>
          </div>
        </div>

        <div style={styles.filters}>
          <input style={styles.input} placeholder="Buscar nome, telefone, e-mail ou mensagem..." value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />

          <select style={styles.input} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value || "all"} value={status.value}>{status.label}</option>
            ))}
          </select>

          <select style={styles.input} value={filters.batchId} onChange={(event) => setFilters({ ...filters, batchId: event.target.value })}>
            <option value="">Todos os lotes</option>
            {batchOptions.map((batch) => (
              <option key={batch.id} value={batch.id}>{batch.name || batch.id}</option>
            ))}
          </select>

          <button style={styles.secondaryButton} onClick={loadContacts}>Filtrar</button>
          <button style={styles.secondaryButton} onClick={toggleAll}>{selectedIds.length === filteredContacts.length ? "Desmarcar todos" : "Selecionar todos"}</button>
          <button style={styles.secondaryButton} onClick={copyPhones}>Copiar telefones</button>
          <button style={styles.dangerButton} onClick={deleteSelectedContacts}>Excluir selecionados</button>
        </div>

        {loading && <p style={styles.smallText}>Carregando contatos...</p>}

        {!loading && filteredContacts.length === 0 && (
          <div style={styles.empty}>Nenhum contato encontrado.</div>
        )}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}><input type="checkbox" checked={filteredContacts.length > 0 && selectedIds.length === filteredContacts.length} onChange={toggleAll} /></th>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Telefone</th>
                <th style={styles.th}>E-mail</th>
                <th style={styles.th}>Vaga</th>
                <th style={styles.th}>Lote</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Última mensagem</th>
                <th style={styles.th}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {filteredContacts.map((contact) => (
                <tr key={contact.id}>
                  <td style={styles.td}><input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={() => toggle(contact.id)} /></td>
                  <td style={styles.td}><strong>{contact.name || contact.nome || "Sem nome"}</strong><br /><span style={styles.smallText}>Sessão {contact.session_id || "-"}</span></td>
                  <td style={styles.td}>{formatPhone(contact.phone || contact.telefone)}</td>
                  <td style={styles.td}>{contact.email || "-"}</td>
                  <td style={styles.td}>{jobName(contact.job_id || contact.current_job_id, contact)}</td>
                  <td style={styles.td}>{batchName(contact.batch_id, contact)}</td>
                  <td style={styles.td}><span style={styles.badge}>{statusLabel(contact.status)}</span></td>
                  <td style={styles.td}>{contact.last_message || "-"}</td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <a style={styles.successButton} href={whatsappLink(contact.phone || contact.telefone)} target="_blank" rel="noreferrer">WhatsApp</a>
                      <button style={styles.dangerButton} onClick={() => deleteContacts([contact.id])}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: 20, background: "linear-gradient(135deg, #eff6ff, #ffffff, #dbeafe)", color: "#0f172a" },
  hero: { background: "#fff", border: "1px solid #bfdbfe", borderRadius: 28, padding: 24, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", boxShadow: "0 18px 50px rgba(37,99,235,.08)" },
  kicker: { margin: 0, color: "#2563eb", fontWeight: 900, letterSpacing: ".22em", fontSize: 12, textTransform: "uppercase" },
  title: { margin: "8px 0", fontSize: 36, fontWeight: 950 },
  subtitle: { margin: 0, color: "#64748b", fontSize: 14, maxWidth: 760 },
  primaryButton: { border: 0, borderRadius: 16, padding: "12px 16px", background: "linear-gradient(135deg, #38bdf8, #2563eb)", color: "#fff", fontWeight: 900, cursor: "pointer", textDecoration: "none" },
  secondaryButton: { border: "1px solid #bfdbfe", borderRadius: 14, padding: "10px 12px", background: "#fff", color: "#2563eb", fontWeight: 900, cursor: "pointer", textDecoration: "none", textAlign: "center" },
  successButton: { border: 0, borderRadius: 14, padding: "10px 12px", background: "#16a34a", color: "#fff", fontWeight: 900, cursor: "pointer", textDecoration: "none", textAlign: "center" },
  dangerButton: { border: 0, borderRadius: 14, padding: "10px 12px", background: "#ef4444", color: "#fff", fontWeight: 900, cursor: "pointer" },
  whatsappGrid: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  whatsappCard: { background: "#fff", border: "1px solid #bfdbfe", borderRadius: 22, padding: 16, display: "grid", gap: 10, boxShadow: "0 12px 30px rgba(37,99,235,.06)" },
  whatsappTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  online: { color: "#16a34a", fontWeight: 900, fontSize: 12 },
  offline: { color: "#ef4444", fontWeight: 900, fontSize: 12 },
  limitText: { fontSize: 24, fontWeight: 950 },
  progress: { height: 8, background: "#e0f2fe", borderRadius: 999, overflow: "hidden" },
  progressBar: { height: "100%", background: "linear-gradient(135deg, #38bdf8, #2563eb)", borderRadius: 999 },
  whatsappActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  statsGrid: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 },
  metric: { background: "#fff", border: "1px solid #bfdbfe", borderRadius: 20, padding: 16, display: "grid", gap: 8 },
  gridTwo: { marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 },
  card: { marginTop: 18, background: "#fff", border: "1px solid #bfdbfe", borderRadius: 28, padding: 20, boxShadow: "0 18px 50px rgba(37,99,235,.06)" },
  sectionTitle: { margin: 0, fontSize: 22, fontWeight: 950 },
  smallText: { margin: "4px 0", color: "#64748b", fontSize: 12 },
  fileInput: { margin: "14px 0", border: "1px dashed #93c5fd", borderRadius: 16, padding: 14, background: "#f8fafc", width: "100%" },
  formGrid: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 },
  input: { width: "100%", boxSizing: "border-box", borderRadius: 16, border: "1px solid #bfdbfe", background: "#f8fafc", padding: "13px 14px", outline: "none", fontSize: 14, color: "#0f172a" },
  dispatchGrid: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 },
  listHeader: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  filters: { marginTop: 14, display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto auto auto", gap: 12, alignItems: "center" },
  empty: { marginTop: 16, border: "1px dashed #93c5fd", borderRadius: 20, padding: 24, textAlign: "center", color: "#64748b" },
  tableWrap: { marginTop: 16, overflowX: "auto", border: "1px solid #dbeafe", borderRadius: 18 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 1180 },
  th: { background: "#eff6ff", color: "#1e3a8a", padding: 12, textAlign: "left", borderBottom: "1px solid #bfdbfe", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" },
  td: { padding: 12, borderBottom: "1px solid #e2e8f0", fontSize: 13, verticalAlign: "top" },
  badge: { display: "inline-block", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
};
