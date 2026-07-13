"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

const SESSIONS = [1, 2, 3, 4, 5];

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "novo", label: "Novo" },
  { value: "campanha", label: "Em campanha" },
  { value: "enviado", label: "Mensagem enviada" },
  { value: "respondeu", label: "Respondeu" },
  { value: "cotacao", label: "Em cotação" },
  { value: "pedido", label: "Pedido" },
  { value: "reagendar_futuro", label: "Contatar depois" },
  { value: "sem_interesse", label: "Sem interesse" },
];

const INTENTS = [
  { value: "PROMOCAO_DIARIA", label: "Promoção diária" },
  { value: "REATIVACAO", label: "Reativação de cliente" },
  { value: "FOLLOW_UP_COTACAO", label: "Follow-up de cotação" },
  { value: "AUMENTAR_MIX", label: "Aumentar mix" },
  { value: "PEDIDO_SEMANAL", label: "Pedido semanal" },
  { value: "COBRANCA_LEMBRETE", label: "Lembrete comercial" },
];

type SessionStatus = {
  online: boolean;
  loading: boolean;
  finalSessionId?: string | null;
  error?: string | null;
};

function normalizeStatus(value?: string | null) {
  const status = String(value || "novo").trim().toLowerCase();

  const legacy: Record<string, string> = {
    respondido: "respondeu",
    interesse: "cotacao",
    quer_agendar_entrevista: "cotacao",
    entrevista_agendada: "pedido",
    contratado: "pedido",
    reativar_futuro: "reagendar_futuro",
    finalizado: "pedido",
  };

  return legacy[status] || status || "novo";
}

function statusLabel(value?: string | null) {
  const normalized = normalizeStatus(value);

  return (
    STATUS_OPTIONS.find((item) => item.value === normalized)?.label ||
    normalized
  );
}

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: unknown) {
  const digits = onlyDigits(value);

  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
}

function formatPhone(value?: string | null) {
  const digits = normalizePhone(value);
  return digits ? `+${digits}` : "-";
}

function parseBulk(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/[,;\t|]/)
        .map((item) => item.trim());

      const maybePhone = parts.find(
        (part) => onlyDigits(part).length >= 10
      );

      const phone = normalizePhone(maybePhone || "");

      const name =
        parts.find(
          (part) =>
            part !== maybePhone &&
            !/^\d+$/.test(onlyDigits(part))
        ) || "Contato";

      return phone ? { name, phone } : null;
    })
    .filter(Boolean) as { name: string; phone: string }[];
}

function whatsappLink(value?: string | null) {
  const digits = normalizePhone(value);
  return digits ? `https://wa.me/${digits}` : "#";
}

function isWhatsappOnline(data: any) {
  const status = String(
    data?.status ||
      data?.state ||
      data?.connectionStatus ||
      data?.session?.status ||
      ""
  )
    .trim()
    .toLowerCase();

  return Boolean(
    data?.connected === true ||
      data?.online === true ||
      data?.isConnected === true ||
      data?.ready === true ||
      data?.me ||
      data?.session?.connected === true ||
      ["connected", "online", "open", "ready"].includes(status)
  );
}

async function fetchWhatsappStatus(sessionId: number) {
  const endpoints = [
    `/api/whatsapp/qr?sessionId=${sessionId}`,
    `/api/whatsapp/qr/${sessionId}`,
  ];

  let lastData: any = {};

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await response.json().catch(() => ({}));
      lastData = data;

      if (response.ok || response.status !== 404) {
        return {
          online: response.ok && isWhatsappOnline(data),
          data,
          error: response.ok
            ? null
            : data?.error || `HTTP ${response.status}`,
        };
      }
    } catch (error: any) {
      lastData = {
        error: error?.message || "Falha de conexão",
      };
    }
  }

  return {
    online: isWhatsappOnline(lastData),
    data: lastData,
    error: lastData?.error || "Sessão indisponível",
  };
}

export default function ContactsDispatchPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [queueStats, setQueueStats] = useState<any>({});
  const [sessionStats, setSessionStats] = useState<
    Record<number, SessionStatus>
  >({});
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState<number | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const [filters, setFilters] = useState({
    q: "",
    status: "",
  });

  const [manual, setManual] = useState({
    name: "",
    phone: "",
    email: "",
  });

  const [bulkText, setBulkText] = useState("");
  const [intent, setIntent] = useState("PROMOCAO_DIARIA");
  const [sessionId, setSessionId] = useState("1");

  async function loadContacts() {
    try {
      setLoading(true);

      const params = new URLSearchParams();

      if (filters.q.trim()) {
        params.set("q", filters.q.trim());
      }

      if (filters.status) {
        params.set("status", filters.status);
      }

      params.set("limit", "1000");

      const response = await fetch(
        `/api/crm/leads?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data?.error || "Erro ao carregar contatos.");
        return;
      }

      setContacts(
        Array.isArray(data?.leads)
          ? data.leads
          : Array.isArray(data)
            ? data
            : []
      );

      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadQueueStats() {
    try {
      const response = await fetch("/api/crm/queue", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setQueueStats(data);
      }
    } catch {
      setQueueStats({});
    }
  }

  async function loadSessionStats() {
    const entries = await Promise.all(
      SESSIONS.map(async (id) => {
        const result = await fetchWhatsappStatus(id);

        return [
          id,
          {
            online: result.online,
            loading: false,
            finalSessionId:
              result.data?.finalSessionId || null,
            error: result.error,
          },
        ] as const;
      })
    );

    const next = Object.fromEntries(entries);
    setSessionStats(next);

    const firstOnline = SESSIONS.find(
      (id) => next[id]?.online
    );

    if (
      firstOnline &&
      !next[Number(sessionId)]?.online
    ) {
      setSessionId(String(firstOnline));
    }
  }

  async function refreshAll() {
    await Promise.all([
      loadContacts(),
      loadQueueStats(),
      loadSessionStats(),
    ]);
  }

  useEffect(() => {
    refreshAll();

    const interval = window.setInterval(() => {
      Promise.all([
        loadQueueStats(),
        loadSessionStats(),
      ]);
    }, 10_000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredContacts = useMemo(() => contacts, [contacts]);

  const onlineSessions = useMemo(
    () =>
      SESSIONS.filter(
        (id) => sessionStats[id]?.online
      ),
    [sessionStats]
  );

  const stats = useMemo(
    () => ({
      total: filteredContacts.length,
      enviados: filteredContacts.filter(
        (item) =>
          normalizeStatus(item.status) === "enviado"
      ).length,
      responderam: filteredContacts.filter(
        (item) =>
          normalizeStatus(item.status) === "respondeu"
      ).length,
      oportunidades: filteredContacts.filter((item) =>
        ["cotacao", "pedido", "campanha"].includes(
          normalizeStatus(item.status)
        )
      ).length,
    }),
    [filteredContacts]
  );

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleAll() {
    if (
      selectedIds.length === filteredContacts.length
    ) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(
      filteredContacts.map((item) => item.id)
    );
  }

  function selectedContacts() {
    if (!selectedIds.length) {
      return filteredContacts;
    }

    return filteredContacts.filter((item) =>
      selectedIds.includes(item.id)
    );
  }

  async function createLead(payload: any) {
    const response = await fetch("/api/crm/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.error || "Erro ao salvar contato."
      );
    }

    return data?.lead;
  }

  async function addManual() {
    if (!manual.phone.trim()) {
      alert("Informe o telefone.");
      return;
    }

    try {
      await createLead({
        name: manual.name || "Contato",
        phone: manual.phone,
        email: manual.email || null,
        status: "novo",
      });

      setManual({
        name: "",
        phone: "",
        email: "",
      });

      await loadContacts();
    } catch (error: any) {
      alert(
        error?.message || "Erro ao adicionar contato."
      );
    }
  }

  async function addBulk() {
    const rows = parseBulk(bulkText);

    if (!rows.length) {
      alert(
        "Cole contatos no formato: Nome, Telefone"
      );
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
      alert(`${rows.length} contato(s) adicionado(s).`);
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao adicionar contatos em massa."
      );
    }
  }

  async function importSpreadsheet() {
    if (!file) {
      alert("Selecione uma planilha.");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
      });
      const sheet =
        workbook.Sheets[workbook.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json<any>(
        sheet,
        {
          defval: "",
        }
      );

      let imported = 0;

      for (const row of rows) {
        const keys = Object.keys(row);

        const nameKey = keys.find((key) =>
          /nome|name|cliente|empresa/i.test(key)
        );

        const phoneKey = keys.find((key) =>
          /telefone|celular|whats|phone/i.test(key)
        );

        const emailKey = keys.find((key) =>
          /email|e-mail/i.test(key)
        );

        const phone = normalizePhone(
          phoneKey ? row[phoneKey] : ""
        );

        if (!phone) continue;

        await createLead({
          name: nameKey
            ? row[nameKey]
            : "Contato",
          phone,
          email: emailKey
            ? row[emailKey]
            : null,
          status: "novo",
        });

        imported++;
      }

      setFile(null);
      await loadContacts();
      alert(`${imported} contato(s) importado(s).`);
    } catch (error) {
      console.error(error);
      alert("Erro ao importar planilha.");
    }
  }

  async function enqueueSelected(
    intelligent = true
  ) {
    const items = selectedContacts().filter(
      (item) =>
        normalizePhone(
          item.phone ||
            item.telefone ||
            item.mobile
        )
    );

    if (!items.length) {
      alert("Nenhum contato com telefone.");
      return;
    }

    if (!onlineSessions.length) {
      alert(
        "Nenhum WhatsApp está online. Conecte uma sessão antes do disparo."
      );
      return;
    }

    const manualSession = Number(sessionId || 1);

    if (
      !intelligent &&
      !sessionStats[manualSession]?.online
    ) {
      alert(
        `O WhatsApp ${manualSession} não está online.`
      );
      return;
    }

    if (
      !confirm(
        `Adicionar ${items.length} contato(s) na fila de disparo?`
      )
    ) {
      return;
    }

    setQueueLoading(true);

    try {
      let success = 0;
      let failures = 0;
      const errors: string[] = [];

      for (let index = 0; index < items.length; index++) {
        const item = items[index];

        const selectedSession = intelligent
          ? onlineSessions[
              index % onlineSessions.length
            ]
          : manualSession;

        const response = await fetch(
          "/api/crm/queue",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              lead_id: item.id,
              intent,
              session_id: selectedSession,
            }),
          }
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (response.ok) {
          success++;
        } else {
          failures++;
          errors.push(
            data?.error ||
              `Erro em ${item.name || item.nome || item.id}`
          );
        }
      }

      await Promise.all([
        loadContacts(),
        loadQueueStats(),
      ]);

      alert(
        failures
          ? `Fila criada: ${success} sucesso(s), ${failures} erro(s).\n${errors
              .slice(0, 3)
              .join("\n")}`
          : `${success} contato(s) colocado(s) na fila.`
      );
    } finally {
      setQueueLoading(false);
    }
  }

  async function deleteContacts(ids: string[]) {
    const uniqueIds = [
      ...new Set(ids),
    ].filter(Boolean);

    if (!uniqueIds.length) {
      alert("Selecione pelo menos um contato.");
      return;
    }

    if (
      !confirm(
        `Excluir ${uniqueIds.length} contato(s)?`
      )
    ) {
      return;
    }

    const response = await fetch("/api/crm/leads", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        ids: uniqueIds,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      alert(
        data?.error ||
          "Erro ao excluir contato(s)."
      );
      return;
    }

    setSelectedIds([]);
    await loadContacts();

    alert(
      `${data?.deleted || uniqueIds.length} contato(s) excluído(s).`
    );
  }

  async function queueAction(
    action: "pause" | "resume"
  ) {
    const response = await fetch("/api/crm/queue", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ action }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      alert(data?.error || "Erro ao atualizar a fila.");
      return;
    }

    await loadQueueStats();

    alert(
      action === "pause"
        ? "Fila pausada."
        : "Fila retomada."
    );
  }

  async function startSession(id: number) {
    setSessionLoading(id);

    try {
      const response = await fetch(
        `/api/whatsapp/start/${id}`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (
        !response.ok ||
        data?.success === false
      ) {
        alert(
          data?.error ||
            `Erro ao iniciar o WhatsApp ${id}.`
        );
        return;
      }

      alert(
        `WhatsApp ${id} iniciado. Atualizando status...`
      );

      window.setTimeout(() => {
        loadSessionStats();
      }, 1500);
    } finally {
      setSessionLoading(null);
    }
  }

  async function restartSession(id: number) {
    if (
      !confirm(
        `Reiniciar o WhatsApp ${id}?`
      )
    ) {
      return;
    }

    setSessionLoading(id);

    try {
      const response = await fetch(
        `/api/whatsapp/restart/${id}`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (
        !response.ok ||
        data?.success === false
      ) {
        alert(
          data?.error ||
            `Erro ao reiniciar o WhatsApp ${id}.`
        );
        return;
      }

      window.setTimeout(() => {
        loadSessionStats();
      }, 1500);
    } finally {
      setSessionLoading(null);
    }
  }

  async function copyPhones() {
    const text = selectedContacts()
      .map((item) => {
        const phone =
          item.phone ||
          item.telefone ||
          item.mobile;

        return phone
          ? `${item.name || item.nome || "Contato"}, ${phone}`
          : null;
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
    <main className="contacts-page">
      <section className="hero">
        <div>
          <p className="kicker">
            Zentra Sales AI · PMG Atacadista
          </p>
          <h1>Contatos e Disparos</h1>
          <p>
            Gerencie sua carteira comercial, importe clientes e
            distribua mensagens somente entre os WhatsApps online
            do vendedor conectado.
          </p>
        </div>

        <button
          className="button primary"
          onClick={refreshAll}
        >
          Atualizar tudo
        </button>
      </section>

      <section className="session-grid">
        {SESSIONS.map((id) => {
          const session = sessionStats[id] || {
            online: false,
            loading: true,
          };

          const queueItem =
            queueStats?.stats?.[id] || {};

          const used = Number(queueItem?.used || 0);
          const limit = Number(
            queueItem?.limit ||
              queueStats?.antiban?.maxPerSessionDay ||
              80
          );

          const percentage = limit
            ? Math.min(
                100,
                Math.round((used / limit) * 100)
              )
            : 0;

          return (
            <article
              key={id}
              className={`session-card ${
                session.online ? "is-online" : ""
              }`}
            >
              <div className="session-top">
                <div>
                  <small>Sessão {id}</small>
                  <strong>WhatsApp {id}</strong>
                </div>

                <span
                  className={
                    session.online
                      ? "badge online"
                      : "badge offline"
                  }
                >
                  {session.online
                    ? "Online"
                    : "Offline"}
                </span>
              </div>

              <div className="usage">
                <strong>
                  {used}/{limit}
                </strong>
                <span>envios hoje</span>
              </div>

              <div className="progress">
                <div
                  style={{
                    width: `${percentage}%`,
                  }}
                />
              </div>

              <div className="session-actions">
                <button
                  className="button secondary"
                  onClick={() => startSession(id)}
                  disabled={sessionLoading === id}
                >
                  {sessionLoading === id
                    ? "Aguarde..."
                    : "Conectar"}
                </button>

                <button
                  className="button ghost"
                  onClick={() =>
                    restartSession(id)
                  }
                  disabled={sessionLoading === id}
                >
                  Reiniciar
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="metrics">
        <Metric label="Total" value={stats.total} />
        <Metric label="Enviados" value={stats.enviados} />
        <Metric
          label="Responderam"
          value={stats.responderam}
        />
        <Metric
          label="Oportunidades"
          value={stats.oportunidades}
        />
        <Metric
          label="Na fila"
          value={queueStats?.pending || 0}
        />
        <Metric
          label="WhatsApps online"
          value={onlineSessions.length}
        />
      </section>

      <section className="two-columns">
        <div className="panel">
          <h2>Importar planilha</h2>
          <p>
            Aceita XLSX ou CSV com nome, telefone e e-mail.
          </p>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) =>
              setFile(
                event.target.files?.[0] || null
              )
            }
          />

          <button
            className="button primary"
            onClick={importSpreadsheet}
          >
            Importar contatos
          </button>
        </div>

        <div className="panel">
          <h2>Adicionar contato</h2>

          <div className="form-grid">
            <input
              placeholder="Nome ou empresa"
              value={manual.name}
              onChange={(event) =>
                setManual({
                  ...manual,
                  name: event.target.value,
                })
              }
            />

            <input
              placeholder="WhatsApp"
              value={manual.phone}
              onChange={(event) =>
                setManual({
                  ...manual,
                  phone: event.target.value,
                })
              }
            />

            <input
              placeholder="E-mail"
              value={manual.email}
              onChange={(event) =>
                setManual({
                  ...manual,
                  email: event.target.value,
                })
              }
            />
          </div>

          <button
            className="button primary"
            onClick={addManual}
          >
            Adicionar
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Adicionar em massa</h2>
        <p>
          Use uma linha por contato no formato: Nome, Telefone.
        </p>

        <textarea
          rows={5}
          placeholder={`Mercado Central, 11999999999\nLoja Primavera, 11988888888`}
          value={bulkText}
          onChange={(event) =>
            setBulkText(event.target.value)
          }
        />

        <button
          className="button primary"
          onClick={addBulk}
        >
          Adicionar lista
        </button>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Configurar disparo</h2>
            <p>
              A distribuição inteligente alterna apenas entre
              sessões realmente online.
            </p>
          </div>

          <span className="online-summary">
            {onlineSessions.length} online
          </span>
        </div>

        <div className="dispatch-grid">
          <select
            value={intent}
            onChange={(event) =>
              setIntent(event.target.value)
            }
          >
            {INTENTS.map((item) => (
              <option
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={sessionId}
            onChange={(event) =>
              setSessionId(event.target.value)
            }
          >
            {SESSIONS.map((id) => (
              <option
                key={id}
                value={id}
                disabled={!sessionStats[id]?.online}
              >
                WhatsApp {id} —{" "}
                {sessionStats[id]?.online
                  ? "online"
                  : "offline"}
              </option>
            ))}
          </select>

          <button
            className="button primary"
            disabled={
              queueLoading ||
              !onlineSessions.length
            }
            onClick={() =>
              enqueueSelected(true)
            }
          >
            {queueLoading
              ? "Enfileirando..."
              : "Distribuição inteligente"}
          </button>

          <button
            className="button secondary"
            disabled={
              queueLoading ||
              !onlineSessions.length
            }
            onClick={() =>
              enqueueSelected(false)
            }
          >
            Usar WhatsApp selecionado
          </button>

          <button
            className="button danger"
            onClick={() =>
              queueAction("pause")
            }
          >
            Pausar fila
          </button>

          <button
            className="button success"
            onClick={() =>
              queueAction("resume")
            }
          >
            Retomar fila
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Carteira de contatos</h2>
            <p>
              {selectedIds.length
                ? `${selectedIds.length} contato(s) selecionado(s).`
                : "Sem seleção, o disparo considera todos os resultados filtrados."}
            </p>
          </div>
        </div>

        <div className="filters">
          <input
            placeholder="Buscar nome, telefone, e-mail ou mensagem"
            value={filters.q}
            onChange={(event) =>
              setFilters({
                ...filters,
                q: event.target.value,
              })
            }
          />

          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({
                ...filters,
                status: event.target.value,
              })
            }
          >
            {STATUS_OPTIONS.map((item) => (
              <option
                key={item.value || "all"}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>

          <button
            className="button secondary"
            onClick={loadContacts}
          >
            Filtrar
          </button>

          <button
            className="button ghost"
            onClick={toggleAll}
          >
            {selectedIds.length ===
              filteredContacts.length &&
            filteredContacts.length
              ? "Desmarcar todos"
              : "Selecionar todos"}
          </button>

          <button
            className="button ghost"
            onClick={copyPhones}
          >
            Copiar telefones
          </button>

          <button
            className="button danger"
            onClick={() =>
              deleteContacts(selectedIds)
            }
          >
            Excluir selecionados
          </button>
        </div>

        {loading && (
          <div className="empty">
            Carregando contatos...
          </div>
        )}

        {!loading &&
          filteredContacts.length === 0 && (
            <div className="empty">
              Nenhum contato encontrado.
            </div>
          )}

        {!loading &&
          filteredContacts.length > 0 && (
            <>
              <div className="desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={
                            filteredContacts.length >
                              0 &&
                            selectedIds.length ===
                              filteredContacts.length
                          }
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Contato</th>
                      <th>WhatsApp</th>
                      <th>E-mail</th>
                      <th>Status</th>
                      <th>Última mensagem</th>
                      <th>Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredContacts.map(
                      (contact) => (
                        <tr key={contact.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(
                                contact.id
                              )}
                              onChange={() =>
                                toggle(contact.id)
                              }
                            />
                          </td>
                          <td>
                            <strong>
                              {contact.name ||
                                contact.nome ||
                                "Sem nome"}
                            </strong>
                          </td>
                          <td>
                            {formatPhone(
                              contact.phone ||
                                contact.telefone ||
                                contact.mobile
                            )}
                          </td>
                          <td>
                            {contact.email || "-"}
                          </td>
                          <td>
                            <span className="status">
                              {statusLabel(
                                contact.status
                              )}
                            </span>
                          </td>
                          <td>
                            {contact.last_message ||
                              "-"}
                          </td>
                          <td>
                            <div className="row-actions">
                              <a
                                className="button success"
                                href={whatsappLink(
                                  contact.phone ||
                                    contact.telefone ||
                                    contact.mobile
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                WhatsApp
                              </a>

                              <button
                                className="button danger"
                                onClick={() =>
                                  deleteContacts([
                                    contact.id,
                                  ])
                                }
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mobile-list">
                {filteredContacts.map(
                  (contact) => (
                    <article
                      className="contact-card"
                      key={contact.id}
                    >
                      <div className="contact-card-top">
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(
                              contact.id
                            )}
                            onChange={() =>
                              toggle(contact.id)
                            }
                          />
                          Selecionar
                        </label>

                        <span className="status">
                          {statusLabel(contact.status)}
                        </span>
                      </div>

                      <h3>
                        {contact.name ||
                          contact.nome ||
                          "Sem nome"}
                      </h3>

                      <p>
                        {formatPhone(
                          contact.phone ||
                            contact.telefone ||
                            contact.mobile
                        )}
                      </p>

                      <small>
                        {contact.email ||
                          "Sem e-mail"}
                      </small>

                      {contact.last_message && (
                        <blockquote>
                          {contact.last_message}
                        </blockquote>
                      )}

                      <div className="row-actions">
                        <a
                          className="button success"
                          href={whatsappLink(
                            contact.phone ||
                              contact.telefone ||
                              contact.mobile
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir WhatsApp
                        </a>

                        <button
                          className="button danger"
                          onClick={() =>
                            deleteContacts([
                              contact.id,
                            ])
                          }
                        >
                          Excluir
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            </>
          )}
      </section>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .contacts-page {
          min-height: 100vh;
          padding: 20px;
          color: #0f172a;
          background: linear-gradient(
            135deg,
            #f0fdf4,
            #ffffff 42%,
            #ecfdf5
          );
        }

        .hero,
        .panel,
        .session-card,
        .metric {
          background: #ffffff;
          border: 1px solid #d1fae5;
          box-shadow: 0 18px 50px
            rgba(22, 163, 74, 0.07);
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 24px;
          border-radius: 28px;
        }

        .hero h1 {
          margin: 8px 0;
          font-size: clamp(28px, 4vw, 38px);
          font-weight: 950;
        }

        .hero p {
          max-width: 760px;
          margin: 0;
          color: #64748b;
          line-height: 1.55;
        }

        .kicker {
          color: #15803d !important;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .session-grid {
          display: grid;
          grid-template-columns: repeat(
            5,
            minmax(0, 1fr)
          );
          gap: 12px;
          margin-top: 16px;
        }

        .session-card {
          display: grid;
          gap: 12px;
          min-width: 0;
          padding: 16px;
          border-radius: 22px;
        }

        .session-card.is-online {
          border-color: #86efac;
          box-shadow: 0 16px 35px
            rgba(22, 163, 74, 0.12);
        }

        .session-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }

        .session-top small,
        .session-top strong {
          display: block;
        }

        .session-top small {
          margin-bottom: 4px;
          color: #64748b;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .session-top strong {
          font-size: 15px;
        }

        .badge,
        .status,
        .online-summary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 900;
          white-space: nowrap;
        }

        .badge.online,
        .online-summary {
          color: #166534;
          background: #dcfce7;
        }

        .badge.offline {
          color: #b91c1c;
          background: #fee2e2;
        }

        .usage {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .usage strong {
          font-size: 24px;
        }

        .usage span {
          color: #64748b;
          font-size: 11px;
        }

        .progress {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: #dcfce7;
        }

        .progress div {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            135deg,
            #22c55e,
            #15803d
          );
        }

        .session-actions,
        .row-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(
            6,
            minmax(0, 1fr)
          );
          gap: 12px;
          margin-top: 16px;
        }

        .metric {
          display: grid;
          gap: 7px;
          padding: 16px;
          border-radius: 20px;
        }

        .metric span {
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }

        .metric strong {
          font-size: 28px;
        }

        .two-columns {
          display: grid;
          grid-template-columns: repeat(
            2,
            minmax(0, 1fr)
          );
          gap: 16px;
        }

        .panel {
          margin-top: 18px;
          padding: 20px;
          border-radius: 26px;
        }

        .panel h2 {
          margin: 0 0 6px;
          font-size: 22px;
        }

        .panel p {
          margin: 0 0 14px;
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
        }

        .panel-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .form-grid,
        .dispatch-grid,
        .filters {
          display: grid;
          gap: 12px;
        }

        .form-grid {
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          margin-bottom: 12px;
        }

        .dispatch-grid {
          grid-template-columns: repeat(
            6,
            minmax(150px, 1fr)
          );
        }

        .filters {
          grid-template-columns:
            minmax(220px, 2fr)
            minmax(160px, 1fr)
            repeat(4, auto);
          margin-top: 14px;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #bbf7d0;
          border-radius: 14px;
          padding: 12px 14px;
          outline: none;
          color: #0f172a;
          background: #f8fffb;
          font: inherit;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 4px
            rgba(22, 163, 74, 0.1);
        }

        input[type="file"] {
          margin: 10px 0 14px;
          border-style: dashed;
        }

        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          border: 0;
          border-radius: 14px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 900;
          text-align: center;
          text-decoration: none;
          cursor: pointer;
        }

        .button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .primary {
          color: #ffffff;
          background: linear-gradient(
            135deg,
            #22c55e,
            #15803d
          );
        }

        .secondary {
          color: #15803d;
          border: 1px solid #86efac;
          background: #ffffff;
        }

        .ghost {
          color: #334155;
          border: 1px solid #e2e8f0;
          background: #ffffff;
        }

        .success {
          color: #ffffff;
          background: #16a34a;
        }

        .danger {
          color: #ffffff;
          background: #dc2626;
        }

        .empty {
          margin-top: 16px;
          border: 1px dashed #86efac;
          border-radius: 18px;
          padding: 24px;
          color: #64748b;
          text-align: center;
        }

        .desktop-table {
          margin-top: 16px;
          overflow-x: auto;
          border: 1px solid #dcfce7;
          border-radius: 18px;
          -webkit-overflow-scrolling: touch;
        }

        table {
          width: 100%;
          min-width: 920px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 12px;
          border-bottom: 1px solid #ecfdf5;
          text-align: left;
          vertical-align: top;
        }

        th {
          color: #166534;
          background: #f0fdf4;
          font-size: 12px;
          white-space: nowrap;
        }

        td {
          color: #334155;
          font-size: 13px;
        }

        .status {
          color: #166534;
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
        }

        .mobile-list {
          display: none;
        }

        .contact-card {
          border: 1px solid #dcfce7;
          border-radius: 18px;
          padding: 16px;
          background: #ffffff;
        }

        .contact-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .contact-card-top label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }

        .contact-card h3 {
          margin: 14px 0 5px;
        }

        .contact-card p {
          margin: 0 0 4px;
          color: #0f172a;
          font-weight: 800;
        }

        .contact-card small {
          color: #64748b;
        }

        blockquote {
          margin: 12px 0;
          border-left: 3px solid #22c55e;
          padding: 8px 12px;
          color: #475569;
          background: #f8fffb;
          font-size: 12px;
        }

        @media (max-width: 1180px) {
          .session-grid {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            );
          }

          .metrics {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            );
          }

          .dispatch-grid {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            );
          }

          .filters {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            );
          }
        }

        @media (max-width: 760px) {
          .contacts-page {
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

          .session-grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }

          .metrics {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }

          .two-columns,
          .form-grid,
          .dispatch-grid,
          .filters {
            grid-template-columns: 1fr;
          }

          .panel {
            border-radius: 20px;
            padding: 16px;
          }

          .panel-heading {
            align-items: stretch;
            flex-direction: column;
          }

          .dispatch-grid .button,
          .filters .button {
            width: 100%;
          }

          .desktop-table {
            display: none;
          }

          .mobile-list {
            display: grid;
            gap: 12px;
            margin-top: 16px;
          }
        }

        @media (max-width: 460px) {
          .session-grid {
            grid-template-columns: 1fr;
          }

          .session-actions .button,
          .row-actions .button {
            flex: 1;
          }

          .metric strong {
            font-size: 24px;
          }
        }
      `}</style>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
