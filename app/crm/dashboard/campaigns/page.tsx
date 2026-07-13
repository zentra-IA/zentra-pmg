"use client";

import { useEffect, useMemo, useState } from "react";

const SESSIONS = [1, 2, 3, 4, 5];

const CAMPAIGN_TYPES = [
  {
    value: "PROMOCAO_DIARIA",
    label: "Promoção diária",
    desc: "Oferta do dia para clientes selecionados.",
    message:
      "Olá {cliente}, tudo bem? Aqui é da PMG Atacadista. Hoje temos uma condição especial para {segmento}. Quer que eu te envie a oferta do dia?",
  },
  {
    value: "REATIVACAO",
    label: "Reativação",
    desc: "Clientes parados ou sem compra recente.",
    message:
      "Olá {cliente}, tudo bem? Sentimos sua falta aqui na PMG. Posso te mandar as melhores condições de hoje para repor seu estoque?",
  },
  {
    value: "FOLLOW_UP_COTACAO",
    label: "Follow-up de cotação",
    desc: "Clientes que cotaram e ainda não fecharam.",
    message:
      "Olá {cliente}, tudo bem? Passando para acompanhar sua cotação. Consigo verificar uma condição melhor para você fechar hoje?",
  },
  {
    value: "AUMENTAR_MIX",
    label: "Aumentar mix",
    desc: "Oferecer produtos complementares ao perfil do cliente.",
    message:
      "Olá {cliente}, vi aqui que seu perfil combina com alguns itens de giro alto. Quer que eu te mande sugestões para aumentar o mix da sua loja?",
  },
  {
    value: "PEDIDO_SEMANAL",
    label: "Pedido semanal",
    desc: "Clientes que costumam comprar em dias específicos.",
    message:
      "Olá {cliente}, tudo bem? Hoje é um bom dia para organizar seu pedido da semana. Quer que eu te ajude com a reposição?",
  },
  {
    value: "COBRANCA_LEMBRETE",
    label: "Lembrete comercial",
    desc: "Aviso para combinar pagamento, boleto ou fechamento.",
    message:
      "Olá {cliente}, tudo bem? Estou passando para alinhar seu pedido/pagamento e deixar tudo certo com a PMG.",
  },
];

const DAYS = [0, 7, 15, 30, 45, 60, 90];

type Customer = {
  id: string;
  name?: string;
  razao_social?: string;
  nome_fantasia?: string;
  fantasy_name?: string;
  whatsapp?: string;
  phone?: string;
  telefone?: string;
  celular?: string;
  email?: string;
  city?: string;
  cidade?: string;
  segment?: string;
  segmento?: string;
  status?: string;
  updated_at?: string;
  updatedAt?: string;
  created_at?: string;
  createdAt?: string;
  last_order_at?: string;
  last_order?: string;
  weekly_limit?: number;
  limite_semanal?: number;
};

function getCustomerName(customer: Customer) {
  return (
    customer.nome_fantasia ||
    customer.fantasy_name ||
    customer.razao_social ||
    customer.name ||
    "Cliente"
  );
}

function getCustomerPhone(customer: Customer) {
  return customer.whatsapp || customer.celular || customer.phone || customer.telefone || "-";
}

function getCustomerSegment(customer: Customer) {
  return customer.segmento || customer.segment || "-";
}

function formatDate(value?: string) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
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

async function fetchWhatsappSession(sessionId: number) {
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
        };
      }
    } catch {
      // Tenta a rota compatível seguinte.
    }
  }

  return {
    online: isWhatsappOnline(lastData),
    data: lastData,
  };
}

export default function CampaignsPage() {
  const [campaignType, setCampaignType] = useState("PROMOCAO_DIARIA");
  const [targetDays, setTargetDays] = useState(0);
  const [selectedWpp, setSelectedWpp] = useState<number[]>([1]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [sessionStats, setSessionStats] = useState<Record<number, any>>({});
  const [queueStats, setQueueStats] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("TODOS");
  const [message, setMessage] = useState(CAMPAIGN_TYPES[0].message);

  const currentType = useMemo(
    () => CAMPAIGN_TYPES.find((x) => x.value === campaignType) || CAMPAIGN_TYPES[0],
    [campaignType]
  );

  const onlineCount = Object.values(sessionStats).filter((s: any) => s?.online).length;
  const totalRemaining = Object.values(sessionStats).reduce(
    (sum: number, s: any) => sum + Number(s?.remaining || 0),
    0
  );

  const selectedCount = selectedCustomers.length;
  const targetCount = selectedCount || customers.length;

  function selectCampaignType(value: string) {
    const next = CAMPAIGN_TYPES.find((x) => x.value === value) || CAMPAIGN_TYPES[0];
    setCampaignType(value);
    setMessage(next.message);
  }

  async function getAvailableSessions(ids: number[]) {
    const checks = await Promise.all(
      ids.map(async (id) => {
        const result = await fetchWhatsappSession(id);
        return result.online ? id : null;
      })
    );

    return checks.filter((id): id is number => id !== null);
  }

  async function loadSessionStats() {
    const entries = await Promise.all(
      SESSIONS.map(async (id) => {
        const result = await fetchWhatsappSession(id);
        const queueItem = queueStats?.stats?.[id] || {};
        const limit = Number(
          queueItem?.limit ||
            queueStats?.antiban?.maxPerSessionDay ||
            80
        );
        const used = Number(queueItem?.used || 0);

        return [
          id,
          {
            online: result.online,
            status: result.online ? "online" : "offline",
            remaining: Math.max(
              0,
              Number(result.data?.remaining ?? limit - used)
            ),
            finalSessionId:
              result.data?.finalSessionId ||
              result.data?.sessionId ||
              null,
          },
        ] as const;
      })
    );

    setSessionStats(Object.fromEntries(entries));

    try {
      const res = await fetch("/api/crm/campaigns?stats=1", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setQueueStats(data?.queue || {});
      }
    } catch {
      setQueueStats({});
    }
  }

  async function loadPreview() {
    setPreviewLoading(true);

    try {
      const params = new URLSearchParams({
        type: campaignType,
        targetDays: String(targetDays),
        q,
        segment,
        city,
        status,
      });

      const res = await fetch(`/api/crm/campaigns?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || "Erro ao carregar clientes da campanha.");
        setCustomers([]);
        return;
      }

      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setSelectedCustomers([]);
      setQueueStats(data?.queue || {});
    } finally {
      setPreviewLoading(false);
    }
  }

  async function patchQueue(action: "pause" | "resume") {
    const res = await fetch("/api/crm/campaigns", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Não foi possível atualizar a fila.");
      return;
    }

    alert(action === "pause" ? "Fila pausada." : "Fila retomada.");
    loadSessionStats();
    loadPreview();
  }

  async function startCampaign() {
    if (!selectedWpp.length) {
      alert("Selecione pelo menos um WhatsApp.");
      return;
    }

    if (!targetCount) {
      alert("Nenhum cliente elegível para esta campanha.");
      return;
    }

    if (!message.trim()) {
      alert("Escreva a mensagem centralizada da campanha.");
      return;
    }

    const confirmed = confirm(
      `Colocar ${targetCount} cliente(s) na fila da campanha "${currentType.label}"?`
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const onlineSessions = await getAvailableSessions(selectedWpp);

      if (!onlineSessions.length) {
        await loadSessionStats();
        alert(
          "Os WhatsApps selecionados não responderam como online. Atualize o status e confirme se a sessão está conectada."
        );
        return;
      }

      const res = await fetch("/api/crm/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignType,
          targetDays,
          selectedWpp: onlineSessions,
          selectedCustomerIds: selectedCustomers,
          filters: { q, segment, city, status },
          message,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao iniciar campanha.");
        return;
      }

      alert(`${data.queued || 0} cliente(s) colocados na fila de disparo.`);
      await loadPreview();
      await loadSessionStats();
    } finally {
      setLoading(false);
    }
  }

  function toggleCustomer(id: string) {
    setSelectedCustomers((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id]
    );
  }

  function toggleAll() {
    if (selectedCustomers.length === customers.length) {
      setSelectedCustomers([]);
      return;
    }

    setSelectedCustomers(customers.map((customer) => customer.id));
  }

  useEffect(() => {
    loadSessionStats();

    const interval = window.setInterval(() => {
      loadSessionStats();
    }, 10_000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadPreview();
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignType, targetDays, q, segment, city, status]);

  return (
    <main className="campaign-page">
      <section className="campaign-hero">
        <div>
          <p className="campaign-kicker">Zentra Sales AI · PMG Atacadista</p>
          <h1>Campanhas Comerciais</h1>
          <p>
            Selecione clientes da carteira, escreva uma mensagem centralizada e dispare em lote
            usando os WhatsApps conectados com controle antibanimento.
          </p>
        </div>

        <button className="primary-button" onClick={startCampaign} disabled={loading || !targetCount}>
          {loading ? "Colocando na fila..." : `Iniciar campanha (${targetCount})`}
        </button>
      </section>

      <section className="metrics-grid">
        <div className="metric-card">
          <span>Clientes elegíveis</span>
          <strong>{previewLoading ? "..." : customers.length}</strong>
          <small>Com base nos filtros atuais</small>
        </div>

        <div className="metric-card">
          <span>Selecionados</span>
          <strong>{selectedCount || "Todos"}</strong>
          <small>{selectedCount ? "Disparo manual por lote" : "Usará todos os elegíveis"}</small>
        </div>

        <div className="metric-card">
          <span>WhatsApps online</span>
          <strong>{onlineCount}</strong>
          <small>{totalRemaining} envios disponíveis estimados</small>
        </div>

        <div className="metric-card">
          <span>Pendentes na fila</span>
          <strong>{queueStats?.pending || 0}</strong>
          <small>{queueStats?.sent || 0} enviados hoje</small>
        </div>
      </section>

      <section className="campaign-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span>Tipo de campanha</span>
              <h2>Escolha o objetivo</h2>
            </div>
          </div>

          <div className="type-grid">
            {CAMPAIGN_TYPES.map((item) => (
              <button
                key={item.value}
                className={`type-card ${item.value === campaignType ? "active" : ""}`}
                onClick={() => selectCampaignType(item.value)}
              >
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
          </div>

          <div className="message-box">
            <label>Mensagem centralizada</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={7}
              placeholder="Digite a mensagem que será enviada para o lote..."
            />

            <div className="tokens">
              <span>Variáveis:</span>
              <button type="button" onClick={() => setMessage((old) => `${old} {cliente}`)}>
                + cliente
              </button>
              <button type="button" onClick={() => setMessage((old) => `${old} {segmento}`)}>
                + segmento
              </button>
              <button type="button" onClick={() => setMessage((old) => `${old} {cidade}`)}>
                + cidade
              </button>
              <button type="button" onClick={() => setMessage((old) => `${old} {vendedor}`)}>
                + vendedor
              </button>
            </div>
          </div>
        </div>

        <aside className="panel side-panel">
          <div className="panel-header">
            <div>
              <span>Configuração</span>
              <h2>Filtro e envio</h2>
            </div>
          </div>

          <label>Dias sem compra/ação</label>
          <select value={targetDays} onChange={(event) => setTargetDays(Number(event.target.value))}>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {day === 0 ? "Todos" : `${day}+ dias`}
              </option>
            ))}
          </select>

          <label>WhatsApps conectados</label>
          <div className="wpp-grid">
            {SESSIONS.map((id) => (
              <button
                key={id}
                className={`wpp-button ${selectedWpp.includes(id) ? "active" : ""}`}
                onClick={() =>
                  setSelectedWpp((old) =>
                    old.includes(id) ? old.filter((item) => item !== id) : [...old, id]
                  )
                }
              >
                WhatsApp {id}
                <small>
                  {sessionStats[id]?.online ? "Online e disponível" : "Offline"}
                </small>
              </button>
            ))}
          </div>

          <div className="queue-actions">
            <button onClick={() => patchQueue("pause")}>Pausar fila</button>
            <button onClick={() => patchQueue("resume")}>Retomar fila</button>
          </div>
        </aside>
      </section>

      <section className="panel customers-panel">
        <div className="customers-top">
          <div>
            <span>Carteira comercial</span>
            <h2>Clientes do lote</h2>
          </div>

          <button onClick={toggleAll} className="ghost-button">
            {selectedCustomers.length === customers.length && customers.length
              ? "Limpar seleção"
              : "Selecionar todos"}
          </button>
        </div>

        <div className="filters">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar por nome, CNPJ, WhatsApp..."
          />
          <input
            value={segment}
            onChange={(event) => setSegment(event.target.value)}
            placeholder="Segmento. Ex: pizzaria"
          />
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Cidade"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="TODOS">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="risco">Em risco</option>
            <option value="inativo">Inativos</option>
            <option value="bloqueado">Bloqueados</option>
          </select>
          <button onClick={loadPreview}>Atualizar</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>Segmento</th>
                <th>Cidade</th>
                <th>Status</th>
                <th>Última ação</th>
              </tr>
            </thead>

            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedCustomers.includes(customer.id)}
                      onChange={() => toggleCustomer(customer.id)}
                    />
                  </td>
                  <td>
                    <strong>{getCustomerName(customer)}</strong>
                    <small>{customer.email || "Sem e-mail"}</small>
                  </td>
                  <td>{getCustomerPhone(customer)}</td>
                  <td>{getCustomerSegment(customer)}</td>
                  <td>{customer.cidade || customer.city || "-"}</td>
                  <td>
                    <span className="status-badge">{customer.status || "ativo"}</span>
                  </td>
                  <td>{formatDate(customer.updated_at || customer.updatedAt || customer.created_at || customer.createdAt)}</td>
                </tr>
              ))}

              {!customers.length ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    Nenhum cliente encontrado. Cadastre clientes na carteira ou ajuste os filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .campaign-page {
          padding: 24px;
          color: #111827;
        }

        .campaign-hero {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          margin-bottom: 18px;
          padding: 28px;
          border-radius: 28px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06);
        }

        .campaign-kicker,
        .panel-header span,
        .customers-top span {
          display: block;
          margin-bottom: 8px;
          color: #15803d;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .campaign-hero h1 {
          margin: 0 0 10px;
          font-size: 36px;
          line-height: 1;
          letter-spacing: -0.05em;
        }

        .campaign-hero p {
          max-width: 760px;
          margin: 0;
          color: #64748b;
          font-weight: 650;
          line-height: 1.55;
        }

        .primary-button,
        .filters button {
          border: 0;
          color: #ffffff;
          background: #15803d;
          padding: 13px 18px;
          border-radius: 15px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 12px 26px rgba(21, 128, 61, 0.18);
          transition: 0.18s ease;
          white-space: nowrap;
        }

        .primary-button:hover,
        .filters button:hover {
          background: #166534;
          transform: translateY(-1px);
        }

        .primary-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .metric-card,
        .panel {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
        }

        .metric-card {
          padding: 18px;
        }

        .metric-card span {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
        }

        .metric-card strong {
          display: block;
          margin-top: 6px;
          font-size: 30px;
          letter-spacing: -0.05em;
        }

        .metric-card small {
          display: block;
          margin-top: 4px;
          color: #94a3b8;
          font-weight: 700;
        }

        .campaign-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 16px;
          margin-bottom: 16px;
        }

        .panel {
          padding: 20px;
        }

        .panel-header h2,
        .customers-top h2 {
          margin: 0;
          font-size: 22px;
          letter-spacing: -0.04em;
        }

        .type-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .type-card {
          padding: 16px;
          border-radius: 18px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          text-align: left;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .type-card strong {
          display: block;
          color: #111827;
          font-weight: 900;
        }

        .type-card span {
          display: block;
          margin-top: 6px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.45;
          font-weight: 650;
        }

        .type-card.active {
          border-color: #16a34a;
          background: #f0fdf4;
          box-shadow: inset 4px 0 0 #16a34a;
        }

        .message-box {
          margin-top: 18px;
        }

        label {
          display: block;
          margin: 14px 0 7px;
          color: #475569;
          font-size: 12px;
          font-weight: 900;
        }

        textarea,
        input,
        select {
          width: 100%;
          border: 1px solid #dbe3ef;
          background: #ffffff;
          border-radius: 15px;
          padding: 12px 14px;
          outline: none;
          color: #111827;
          font-weight: 700;
        }

        textarea:focus,
        input:focus,
        select:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.08);
        }

        .tokens {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .tokens span {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
        }

        .tokens button,
        .ghost-button,
        .queue-actions button {
          border: 1px solid #dbe3ef;
          background: #ffffff;
          color: #334155;
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .tokens button:hover,
        .ghost-button:hover,
        .queue-actions button:hover {
          border-color: #16a34a;
          color: #15803d;
        }

        .wpp-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .wpp-button {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 15px;
          padding: 12px;
          cursor: pointer;
          color: #111827;
          font-weight: 900;
          text-align: left;
        }

        .wpp-button small {
          display: block;
          margin-top: 3px;
          color: #64748b;
          font-size: 11px;
        }

        .wpp-button.active {
          border-color: #16a34a;
          background: #f0fdf4;
          color: #15803d;
        }

        .queue-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .customers-panel {
          padding: 20px;
        }

        .customers-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 14px;
        }

        .filters {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr 180px auto;
          gap: 10px;
          margin-bottom: 14px;
        }

        .table-wrap {
          overflow-x: auto;
          border: 1px solid #eef2f7;
          border-radius: 18px;
        }

        table {
          width: 100%;
          min-width: 900px;
          border-collapse: collapse;
        }

        th {
          padding: 14px;
          border-bottom: 1px solid #e5e7eb;
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          text-align: left;
          background: #f8fafc;
        }

        td {
          padding: 14px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          font-size: 13px;
          font-weight: 700;
        }

        td strong {
          display: block;
          color: #111827;
          font-weight: 900;
        }

        td small {
          display: block;
          margin-top: 4px;
          color: #94a3b8;
          font-size: 11px;
        }

        .status-badge {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 999px;
          background: #dcfce7;
          color: #166534;
          font-size: 12px;
          font-weight: 900;
        }

        .empty-state {
          padding: 24px;
          color: #64748b;
          text-align: center;
        }

        @media (max-width: 980px) {
          .campaign-page {
            padding: 14px;
          }

          .campaign-hero,
          .customers-top {
            flex-direction: column;
            align-items: stretch;
          }

          .campaign-hero h1 {
            font-size: 30px;
          }

          .metrics-grid,
          .campaign-grid {
            grid-template-columns: 1fr;
          }

          .filters {
            grid-template-columns: 1fr;
          }

          .primary-button {
            width: 100%;
          }

          .wpp-grid {
            grid-template-columns: 1fr;
          }

          .queue-actions {
            flex-direction: column;
          }

          .queue-actions button,
          .ghost-button {
            width: 100%;
          }

          .table-wrap {
            -webkit-overflow-scrolling: touch;
          }
        }

        @media (max-width: 560px) {
          .campaign-page {
            padding: 10px;
          }

          .campaign-hero,
          .panel,
          .customers-panel {
            border-radius: 18px;
            padding: 16px;
          }

          .campaign-hero h1 {
            font-size: 26px;
          }

          .type-grid {
            grid-template-columns: 1fr;
          }

          .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .metric-card {
            padding: 14px;
          }

          .metric-card strong {
            font-size: 25px;
          }
        }
      `}</style>
    </main>
  );
}
