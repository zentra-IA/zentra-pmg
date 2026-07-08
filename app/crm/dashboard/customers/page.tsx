"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  internal_code?: string | null;
  erp_code?: string | null;
  document?: string | null;
  legal_name: string;
  trade_name?: string | null;
  segment?: string | null;
  category?: string | null;
  buyer_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cep?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  payment_terms?: string | null;
  weekly_purchase_limit?: string | number | null;
  habitual_purchase_day?: string | null;
  purchase_weekdays?: string[];
  expected_ticket?: string | number | null;
  commercial_notes?: string | null;
  status: string;
  customer_score?: number;
  risk_level?: string;
  created_at?: string;
  updated_at?: string;
};


type CustomerActivity = {
  id: string;
  type?: string | null;
  title: string;
  description?: string | null;
  scheduled_at?: string | null;
  priority?: string | null;
  status?: string | null;
  customer_id?: string | null;
};

const EMPTY_FORM = {
  internal_code: "",
  erp_code: "",
  document: "",
  legal_name: "",
  trade_name: "",
  segment: "",
  category: "",
  buyer_name: "",
  phone: "",
  whatsapp: "",
  email: "",
  cep: "",
  address: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  payment_terms: "",
  weekly_purchase_limit: "",
  habitual_purchase_day: "",
  purchase_weekdays: [] as string[],
  expected_ticket: "",
  commercial_notes: "",
  status: "ativo",
};

const WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];


const EMPTY_NEXT_ACTION = {
  title: "Retornar cliente",
  date: "",
  time: "",
  description: "",
};


const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  risco: "Em risco",
  inativo: "Inativo",
  bloqueado: "Bloqueado",
};

function money(value: any) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [nextActionCustomer, setNextActionCustomer] = useState<Customer | null>(null);
  const [nextActionForm, setNextActionForm] = useState(EMPTY_NEXT_ACTION);
  const [savingNextAction, setSavingNextAction] = useState(false);

  const [filters, setFilters] = useState({
    q: "",
    status: "",
    segment: "",
  });

  async function loadCustomers() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.status) params.set("status", filters.status);
      if (filters.segment) params.set("segment", filters.segment);

      const res = await fetch(`/api/crm/customers?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao carregar clientes.");
        return;
      }

      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = customers.length;
    const ativos = customers.filter((item) => item.status === "ativo").length;
    const risco = customers.filter((item) => item.status === "risco").length;
    const inativos = customers.filter((item) => item.status === "inativo").length;

    return { total, ativos, risco, inativos };
  }, [customers]);

  function updateField(name: string, value: any) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function toggleWeekday(day: string) {
    setForm((prev) => {
      const exists = prev.purchase_weekdays.includes(day);
      return {
        ...prev,
        purchase_weekdays: exists
          ? prev.purchase_weekdays.filter((item) => item !== day)
          : [...prev.purchase_weekdays, day],
      };
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function editCustomer(customer: Customer) {
    setEditingId(customer.id);
    setSelected(customer);
    setForm({
      internal_code: customer.internal_code || "",
      erp_code: customer.erp_code || "",
      document: customer.document || "",
      legal_name: customer.legal_name || "",
      trade_name: customer.trade_name || "",
      segment: customer.segment || "",
      category: customer.category || "",
      buyer_name: customer.buyer_name || "",
      phone: customer.phone || "",
      whatsapp: customer.whatsapp || "",
      email: customer.email || "",
      cep: customer.cep || "",
      address: customer.address || "",
      number: customer.number || "",
      complement: customer.complement || "",
      neighborhood: customer.neighborhood || "",
      city: customer.city || "",
      state: customer.state || "",
      payment_terms: customer.payment_terms || "",
      weekly_purchase_limit: String(customer.weekly_purchase_limit || ""),
      habitual_purchase_day: customer.habitual_purchase_day || "",
      purchase_weekdays: customer.purchase_weekdays || [],
      expected_ticket: String(customer.expected_ticket || ""),
      commercial_notes: customer.commercial_notes || "",
      status: customer.status || "ativo",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();

    if (!form.legal_name.trim()) {
      alert("Informe a razão social ou nome do cliente.");
      return;
    }

    setSaving(true);

    try {
      const payload = editingId ? { id: editingId, ...form } : form;

      const res = await fetch("/api/crm/customers", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao salvar cliente.");
        return;
      }

      resetForm();
      await loadCustomers();
      alert(editingId ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(customer: Customer) {
    const ok = confirm(`Remover ${customer.trade_name || customer.legal_name}?`);
    if (!ok) return;

    const res = await fetch(`/api/crm/customers?id=${customer.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Erro ao remover cliente.");
      return;
    }

    if (selected?.id === customer.id) setSelected(null);
    await loadCustomers();
  }


  async function loadCustomerActivities(customerId: string) {
    if (!customerId) return;

    setLoadingActivities(true);

    try {
      const params = new URLSearchParams();
      params.set("customer_id", customerId);

      const res = await fetch(`/api/crm/customer-activities?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error(data.error || "Erro ao carregar agenda do cliente.");
        setActivities([]);
        return;
      }

      setActivities(Array.isArray(data.activities) ? data.activities : []);
    } finally {
      setLoadingActivities(false);
    }
  }

  function openCustomer(customer: Customer) {
    setSelected(customer);
    loadCustomerActivities(customer.id);
  }

  function openNextAction(customer: Customer) {
    setNextActionCustomer(customer);
    setNextActionForm(EMPTY_NEXT_ACTION);
  }

  function closeNextAction() {
    setNextActionCustomer(null);
    setNextActionForm(EMPTY_NEXT_ACTION);
  }

  function updateNextActionField(name: string, value: string) {
    setNextActionForm((prev) => ({ ...prev, [name]: value }));
  }

  async function saveNextAction(event: FormEvent) {
    event.preventDefault();

    if (!nextActionCustomer) return;

    if (!nextActionForm.title.trim()) {
      alert("Informe o título da próxima ação.");
      return;
    }

    if (!nextActionForm.date) {
      alert("Informe a data do retorno.");
      return;
    }

    const time = nextActionForm.time || "09:00";
    const scheduledAt = new Date(`${nextActionForm.date}T${time}:00`);

    if (Number.isNaN(scheduledAt.getTime())) {
      alert("Data ou hora inválida.");
      return;
    }

    setSavingNextAction(true);

    try {
      const res = await fetch("/api/crm/customer-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customer_id: nextActionCustomer.id,
          phone: nextActionCustomer.whatsapp || nextActionCustomer.phone || "",
          origin: "customer",
          type: "followup",
          title: nextActionForm.title,
          description: nextActionForm.description,
          scheduled_at: scheduledAt.toISOString(),
          priority: "media",
          status: "pendente",
          notify: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao salvar próxima ação.");
        return;
      }

      alert("Próxima ação salva com sucesso.");

      if (selected?.id === nextActionCustomer.id) {
        await loadCustomerActivities(nextActionCustomer.id);
      }

      closeNextAction();
    } finally {
      setSavingNextAction(false);
    }
  }

  async function completeActivity(activityId: string) {
    const res = await fetch("/api/crm/customer-activities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: activityId,
        status: "concluido",
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Erro ao concluir atividade.");
      return;
    }

    if (selected) {
      await loadCustomerActivities(selected.id);
    }
  }

  function formatActivityDate(value?: string | null) {
    if (!value) return "Sem data";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sem data";

    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const segments = useMemo(() => {
    return Array.from(new Set(customers.map((item) => item.segment).filter(Boolean) as string[])).sort();
  }, [customers]);

  return (
    <div className="customers-page">
      <section className="hero">
        <div>
          <span>ZENTRA SALES AI · PMG ATACADISTA</span>
          <h1>Clientes</h1>
          <p>
            Cadastre a carteira comercial por vendedor, acompanhe dados de compra e prepare a base para pedidos, OCR, BI e IA comercial.
          </p>
        </div>

        <button className="primary-button" onClick={() => window.scrollTo({ top: 320, behavior: "smooth" })}>
          Novo cliente
        </button>
      </section>

      <section className="stats-grid">
        <div className="stat-card"><span>Total</span><strong>{stats.total}</strong></div>
        <div className="stat-card good"><span>Ativos</span><strong>{stats.ativos}</strong></div>
        <div className="stat-card warn"><span>Em risco</span><strong>{stats.risco}</strong></div>
        <div className="stat-card danger"><span>Inativos</span><strong>{stats.inativos}</strong></div>
      </section>

      <form className="panel form-panel" onSubmit={saveCustomer}>
        <div className="section-title">
          <span>{editingId ? "EDITAR CLIENTE" : "NOVO CLIENTE"}</span>
          <h2>{editingId ? "Atualizar cadastro" : "Cadastrar cliente"}</h2>
        </div>

        <div className="form-grid">
          <label><span>ID do cliente / Código interno</span><input value={form.internal_code} onChange={(e) => updateField("internal_code", e.target.value)} placeholder="Ex: 10293" /></label>
          <label><span>CNPJ / CPF</span><input value={form.document} onChange={(e) => updateField("document", e.target.value)} placeholder="00.000.000/0000-00" /></label>
          <label className="wide"><span>Razão social *</span><input value={form.legal_name} onChange={(e) => updateField("legal_name", e.target.value)} placeholder="Razão social do cliente" /></label>
          <label><span>Nome fantasia</span><input value={form.trade_name} onChange={(e) => updateField("trade_name", e.target.value)} placeholder="Nome comercial" /></label>
          <label><span>Segmento</span><input value={form.segment} onChange={(e) => updateField("segment", e.target.value)} placeholder="Mercado, padaria, pizzaria..." /></label>
          <label><span>Categoria</span><input value={form.category} onChange={(e) => updateField("category", e.target.value)} placeholder="A, B, C, estratégico..." /></label>
          <label><span>Nome do comprador</span><input value={form.buyer_name} onChange={(e) => updateField("buyer_name", e.target.value)} placeholder="Responsável pela compra" /></label>
          <label><span>Celular</span><input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="(00) 00000-0000" /></label>
          <label><span>WhatsApp</span><input value={form.whatsapp} onChange={(e) => updateField("whatsapp", e.target.value)} placeholder="(00) 00000-0000" /></label>
          <label><span>E-mail</span><input value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="cliente@email.com" /></label>
          <label><span>Cidade</span><input value={form.city} onChange={(e) => updateField("city", e.target.value)} placeholder="Cidade" /></label>
          <label><span>Estado</span><input value={form.state} onChange={(e) => updateField("state", e.target.value)} placeholder="UF" /></label>
          <label className="wide"><span>Forma de pagamento</span><input value={form.payment_terms} onChange={(e) => updateField("payment_terms", e.target.value)} placeholder="Ex: boleto 7/14/21 dias, PIX, à vista..." /></label>
          <label><span>Limite de compra semanal</span><input value={form.weekly_purchase_limit} onChange={(e) => updateField("weekly_purchase_limit", e.target.value)} placeholder="Ex: 5000" /></label>
          <label><span>Dia habitual de compra</span><input value={form.habitual_purchase_day} onChange={(e) => updateField("habitual_purchase_day", e.target.value)} placeholder="Ex: terça-feira" /></label>
          <label><span>Ticket esperado</span><input value={form.expected_ticket} onChange={(e) => updateField("expected_ticket", e.target.value)} placeholder="Ex: 1200" /></label>
          <label><span>Status</span><select value={form.status} onChange={(e) => updateField("status", e.target.value)}><option value="ativo">Ativo</option><option value="risco">Em risco</option><option value="inativo">Inativo</option><option value="bloqueado">Bloqueado</option></select></label>

          <div className="wide">
            <span className="field-title">Dias que costuma comprar</span>
            <div className="weekday-list">
              {WEEKDAYS.map((day) => (
                <button key={day} type="button" className={form.purchase_weekdays.includes(day) ? "weekday active" : "weekday"} onClick={() => toggleWeekday(day)}>
                  {day}
                </button>
              ))}
            </div>
          </div>

          <label className="wide">
            <span>Observações</span>
            <textarea value={form.commercial_notes} onChange={(e) => updateField("commercial_notes", e.target.value)} placeholder="Preferências, restrições, horários, mix de produtos, detalhes de negociação..." />
          </label>
        </div>

        <div className="actions">
          <button className="primary-button" disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar cliente"}</button>
          {editingId && <button className="secondary-button" type="button" onClick={resetForm}>Cancelar edição</button>}
        </div>
      </form>

      <section className="panel">
        <div className="table-header">
          <div><span>CARTEIRA COMERCIAL</span><h2>Clientes cadastrados</h2></div>
          <button className="secondary-button" onClick={loadCustomers} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
        </div>

        <div className="filters">
          <input value={filters.q} onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") loadCustomers(); }} placeholder="Buscar por nome, CNPJ, WhatsApp, cidade..." />
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="">Todos os status</option><option value="ativo">Ativos</option><option value="risco">Em risco</option><option value="inativo">Inativos</option><option value="bloqueado">Bloqueados</option></select>
          <select value={filters.segment} onChange={(e) => setFilters((prev) => ({ ...prev, segment: e.target.value }))}><option value="">Todos os segmentos</option>{segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select>
          <button className="primary-button" onClick={loadCustomers}>Filtrar</button>
        </div>

        <div className="customers-grid">
          {customers.map((customer) => (
            <article key={customer.id} className="customer-card" onClick={() => openCustomer(customer)}>
              <div className="customer-top">
                <div><strong>{customer.trade_name || customer.legal_name}</strong><span>{customer.legal_name}</span></div>
                <em className={`status ${customer.status}`}>{STATUS_LABELS[customer.status] || customer.status}</em>
              </div>

              <div className="customer-meta">
                <span>{customer.document || "Sem CNPJ/CPF"}</span>
                <span>{customer.whatsapp || customer.phone || "Sem telefone"}</span>
                <span>{customer.city || "Cidade não informada"}</span>
              </div>

              <div className="customer-bottom"><small>{customer.segment || "Sem segmento"}</small><strong>{money(customer.weekly_purchase_limit)}</strong></div>

              <div className="card-actions">
                <button type="button" onClick={(e) => { e.stopPropagation(); openNextAction(customer); }}>📅 Próxima ação</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); editCustomer(customer); }}>Editar</button>
                <button type="button" className="danger-button" onClick={(e) => { e.stopPropagation(); deleteCustomer(customer); }}>Excluir</button>
              </div>
            </article>
          ))}

          {!customers.length && <div className="empty-state"><strong>Nenhum cliente cadastrado ainda.</strong><p>Cadastre o primeiro cliente para iniciar a gestão da carteira comercial.</p></div>}
        </div>
      </section>

      {selected && (
        <aside className="drawer">
          <button className="drawer-close" onClick={() => setSelected(null)}>×</button>
          <span>FICHA DO CLIENTE</span>
          <h2>{selected.trade_name || selected.legal_name}</h2>
          <p>{selected.legal_name}</p>

          <div className="drawer-grid">
            <div><small>CNPJ/CPF</small><strong>{selected.document || "—"}</strong></div>
            <div><small>Comprador</small><strong>{selected.buyer_name || "—"}</strong></div>
            <div><small>WhatsApp</small><strong>{selected.whatsapp || "—"}</strong></div>
            <div><small>E-mail</small><strong>{selected.email || "—"}</strong></div>
            <div><small>Pagamento</small><strong>{selected.payment_terms || "—"}</strong></div>
            <div><small>Limite semanal</small><strong>{money(selected.weekly_purchase_limit)}</strong></div>
            <div><small>Dias de compra</small><strong>{selected.purchase_weekdays?.join(", ") || "—"}</strong></div>
            <div><small>Status</small><strong>{STATUS_LABELS[selected.status] || selected.status}</strong></div>
          </div>

          <div className="drawer-notes"><small>Observações</small><p>{selected.commercial_notes || "Sem observações."}</p></div>

          <div className="drawer-agenda">
            <div className="drawer-agenda-head">
              <div>
                <small>Agenda do cliente</small>
                <strong>Próximas ações</strong>
              </div>

              <button className="mini-primary-button" onClick={() => openNextAction(selected)}>
                + Agendar
              </button>
            </div>

            {loadingActivities && (
              <p className="agenda-empty">Carregando agenda...</p>
            )}

            {!loadingActivities && activities.length === 0 && (
              <p className="agenda-empty">Nenhuma próxima ação cadastrada para este cliente.</p>
            )}

            {!loadingActivities && activities.map((activity) => (
              <div key={activity.id} className={`agenda-item ${activity.status === "concluido" ? "done" : ""}`}>
                <div>
                  <strong>{activity.title}</strong>
                  <span>{formatActivityDate(activity.scheduled_at)}</span>
                </div>

                {activity.description && <p>{activity.description}</p>}

                {activity.status !== "concluido" && (
                  <button type="button" onClick={() => completeActivity(activity.id)}>
                    Concluir
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="drawer-actions">
            <button className="primary-button" onClick={() => openNextAction(selected)}>📅 Próxima ação</button>
            <button className="secondary-button" onClick={() => editCustomer(selected)}>Editar cliente</button>
            <button className="secondary-button" onClick={() => alert("Integração com pedidos/OCR será conectada na próxima etapa.")}>Ver pedidos</button>
          </div>
        </aside>
      )}


      {nextActionCustomer && (
        <div className="modal-backdrop" onClick={closeNextAction}>
          <form className="next-action-modal" onSubmit={saveNextAction} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="drawer-close" onClick={closeNextAction}>×</button>

            <span>PRÓXIMA AÇÃO</span>
            <h2>{nextActionCustomer.trade_name || nextActionCustomer.legal_name}</h2>
            <p>{nextActionCustomer.whatsapp || nextActionCustomer.phone || "Telefone não informado"}</p>

            <label>
              <span>Título</span>
              <input
                value={nextActionForm.title}
                onChange={(e) => updateNextActionField("title", e.target.value)}
                placeholder="Ex: Retornar cliente"
              />
            </label>

            <div className="next-action-date-grid">
              <label>
                <span>Data</span>
                <input
                  type="date"
                  value={nextActionForm.date}
                  onChange={(e) => updateNextActionField("date", e.target.value)}
                />
              </label>

              <label>
                <span>Hora</span>
                <input
                  type="time"
                  value={nextActionForm.time}
                  onChange={(e) => updateNextActionField("time", e.target.value)}
                />
              </label>
            </div>

            <label>
              <span>Observação</span>
              <textarea
                value={nextActionForm.description}
                onChange={(e) => updateNextActionField("description", e.target.value)}
                placeholder="Ex: Cliente pediu para chamar sobre muçarela na segunda de manhã."
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeNextAction}>
                Cancelar
              </button>

              <button className="primary-button" disabled={savingNextAction}>
                {savingNextAction ? "Salvando..." : "Salvar próxima ação"}
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`
        .customers-page { display: grid; gap: 16px; max-width: 1180px; margin: 0 auto; }
        .hero, .panel, .stat-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 24px; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.06); }
        .hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 28px; }
        .hero span, .section-title span, .table-header span, .drawer > span { display: block; color: #15803d; font-size: 11px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; }
        .hero h1, .section-title h2, .table-header h2, .drawer h2 { margin: 6px 0; color: #111827; font-size: clamp(26px, 3vw, 38px); line-height: 1; letter-spacing: -0.05em; }
        .hero p { max-width: 760px; margin: 0; color: #64748b; font-weight: 600; line-height: 1.6; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .stat-card { padding: 18px; }
        .stat-card span { display: block; color: #64748b; font-size: 12px; font-weight: 800; }
        .stat-card strong { display: block; margin-top: 6px; color: #111827; font-size: 30px; font-weight: 950; }
        .stat-card.good strong { color: #15803d; } .stat-card.warn strong { color: #d97706; } .stat-card.danger strong { color: #dc2626; }
        .panel { padding: 18px; }
        .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
        label, .wide { display: grid; gap: 7px; }
        label span, .field-title { color: #334155; font-size: 12px; font-weight: 900; }
        input, select, textarea { width: 100%; min-height: 46px; border: 1px solid #dbe3ea; border-radius: 16px; background: #fff; color: #111827; padding: 0 14px; font-weight: 700; outline: none; }
        textarea { min-height: 100px; padding-top: 14px; resize: vertical; }
        input:focus, select:focus, textarea:focus { border-color: #16a34a; box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.12); }
        .wide { grid-column: 1 / -1; }
        .weekday-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .weekday, .secondary-button, .primary-button, .card-actions button { min-height: 44px; border-radius: 14px; border: 1px solid #dbe3ea; cursor: pointer; font-weight: 900; transition: 0.18s ease; }
        .weekday { padding: 0 14px; background: #fff; color: #475569; }
        .weekday.active { border-color: #16a34a; background: #dcfce7; color: #166534; }
        .primary-button { border: 0; background: #15803d; color: #fff; padding: 0 18px; box-shadow: 0 12px 24px rgba(21, 128, 61, 0.18); }
        .primary-button:hover { background: #166534; transform: translateY(-1px); }
        .secondary-button { background: #fff; color: #111827; padding: 0 16px; }
        .actions, .table-header, .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
        .table-header { justify-content: space-between; margin-top: 0; }
        .filters { display: grid; grid-template-columns: 1fr 190px 190px auto; }
        .customers-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
        .customer-card { border: 1px solid #e5e7eb; border-radius: 20px; padding: 16px; background: #fff; cursor: pointer; transition: 0.18s ease; }
        .customer-card:hover { border-color: #16a34a; transform: translateY(-2px); box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08); }
        .customer-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .customer-top strong { display: block; color: #111827; font-size: 16px; font-weight: 950; }
        .customer-top span, .customer-meta span, .customer-bottom small { color: #64748b; font-size: 12px; font-weight: 700; }
        .status { border-radius: 999px; padding: 5px 9px; background: #f1f5f9; color: #475569; font-size: 11px; font-style: normal; font-weight: 950; white-space: nowrap; }
        .status.ativo { background: #dcfce7; color: #166534; } .status.risco { background: #fef3c7; color: #92400e; } .status.inativo { background: #fee2e2; color: #991b1b; } .status.bloqueado { background: #e5e7eb; color: #111827; }
        .customer-meta { display: grid; gap: 6px; margin-top: 14px; }
        .customer-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f5f9; }
        .customer-bottom strong { color: #15803d; font-weight: 950; }
        .card-actions { display: flex; gap: 8px; margin-top: 12px; }
        .card-actions button { flex: 1; background: #f8fafc; color: #111827; }
        .card-actions .danger-button { color: #dc2626; }
        .empty-state { grid-column: 1 / -1; border: 1px dashed #dbe3ea; border-radius: 20px; padding: 32px; text-align: center; color: #64748b; }
        .empty-state strong { display: block; color: #111827; font-size: 18px; }
        .drawer { position: fixed; right: 18px; top: 18px; bottom: 18px; width: min(440px, calc(100vw - 36px)); z-index: 90; overflow: auto; border: 1px solid #e5e7eb; border-radius: 28px; background: #fff; padding: 24px; box-shadow: 0 30px 80px rgba(15, 23, 42, 0.18); }
        .drawer-close { position: absolute; right: 18px; top: 16px; width: 38px; height: 38px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; cursor: pointer; font-size: 24px; }
        .drawer p { color: #64748b; font-weight: 700; }
        .drawer-grid { display: grid; gap: 10px; margin-top: 18px; }
        .drawer-grid div, .drawer-notes { padding: 14px; border: 1px solid #f1f5f9; border-radius: 16px; background: #f8fafc; }
        .drawer-grid small, .drawer-notes small { display: block; color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .drawer-grid strong { display: block; margin-top: 4px; color: #111827; font-weight: 950; }
        .drawer-actions { display: grid; gap: 10px; margin-top: 16px; }

        .drawer-agenda { margin-top: 16px; display: grid; gap: 10px; }
        .drawer-agenda-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px; border: 1px solid #dcfce7; border-radius: 18px; background: #f0fdf4; }
        .drawer-agenda-head small { display: block; color: #15803d; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .drawer-agenda-head strong { display: block; margin-top: 3px; color: #111827; font-size: 15px; font-weight: 950; }
        .mini-primary-button { min-height: 36px; border: 0; border-radius: 999px; background: #15803d; color: #fff; padding: 0 12px; cursor: pointer; font-weight: 950; }
        .agenda-empty { margin: 0; padding: 14px; border: 1px dashed #dbe3ea; border-radius: 16px; color: #64748b; font-weight: 700; }
        .agenda-item { display: grid; gap: 8px; padding: 14px; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; }
        .agenda-item.done { opacity: 0.65; background: #f8fafc; }
        .agenda-item > div { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .agenda-item strong { color: #111827; font-weight: 950; }
        .agenda-item span { color: #15803d; font-size: 12px; font-weight: 950; white-space: nowrap; }
        .agenda-item p { margin: 0; color: #64748b; font-size: 13px; font-weight: 700; line-height: 1.5; }
        .agenda-item button { justify-self: flex-start; min-height: 34px; border: 1px solid #bbf7d0; border-radius: 999px; background: #f0fdf4; color: #166534; padding: 0 12px; cursor: pointer; font-weight: 950; }
        .modal-backdrop { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 18px; background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(4px); }
        .next-action-modal { position: relative; width: min(520px, 100%); display: grid; gap: 12px; border: 1px solid #e5e7eb; border-radius: 28px; background: #fff; padding: 24px; box-shadow: 0 30px 90px rgba(15, 23, 42, 0.25); }
        .next-action-modal > span { color: #15803d; font-size: 11px; font-weight: 950; letter-spacing: 0.16em; text-transform: uppercase; }
        .next-action-modal h2 { margin: 0; padding-right: 44px; color: #111827; font-size: 28px; font-weight: 950; letter-spacing: -0.04em; }
        .next-action-modal p { margin: -6px 0 4px; color: #64748b; font-weight: 800; }
        .next-action-date-grid { display: grid; grid-template-columns: 1fr 150px; gap: 10px; }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }

        @media (max-width: 980px) { .hero { display: grid; } .stats-grid, .customers-grid, .form-grid, .filters { grid-template-columns: 1fr; } .primary-button, .secondary-button { width: 100%; } .next-action-date-grid, .modal-actions { grid-template-columns: 1fr; display: grid; } .panel { padding: 14px; border-radius: 20px; } .hero { padding: 20px; border-radius: 20px; } .drawer { left: 10px; right: 10px; top: 10px; bottom: 10px; width: auto; border-radius: 22px; } }
      `}</style>
    </div>
  );
}
