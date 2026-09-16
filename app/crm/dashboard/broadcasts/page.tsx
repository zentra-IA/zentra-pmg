"use client";

import { useEffect, useMemo, useState } from "react";
import PortalChatAutomationManager from "@/components/PortalChatAutomationManager";
import PortalPriceTableManager from "@/components/PortalPriceTableManager";

type Customer = {
  id: string;
  internal_code?: string | null;
  erp_code?: string | null;
  name: string;
  legal_name: string;
  buyer_name?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  category?: string | null;
  status: string;
  price_table?: number | null;
  phone?: string | null;
  portal_active: boolean;
  portal_accessed: boolean;
  push_active: boolean;
  push_permission?: string | null;
};

type BroadcastList = {
  id: string;
  name: string;
  description?: string | null;
  member_count: number;
  customer_ids: string[];
  created_at?: string;
  updated_at?: string;
};

type Filters = {
  cities: string[];
  segments: string[];
  categories: string[];
  statuses: string[];
  price_tables: number[];
};

type SendResult = {
  selected: number;
  eligible: number;
  message_delivered: number;
  push_sent: number;
  without_push: number;
  without_portal: number;
  push_failed: number;
  failed: number;
};

const EMPTY_FILTERS: Filters = {
  cities: [],
  segments: [],
  categories: [],
  statuses: [],
  price_tables: [],
};

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function PortalBroadcastsPage() {
  const [workspaceMode, setWorkspaceMode] = useState<"broadcasts" | "chatbot" | "prices">("broadcasts");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lists, setLists] = useState<BroadcastList[]>([]);
  const [filterOptions, setFilterOptions] =
    useState<Filters>(EMPTY_FILTERS);

  const [query, setQuery] = useState("");
  const [pushFilter, setPushFilter] = useState("all");
  const [portalFilter, setPortalFilter] = useState("active");
  const [statusFilter, setStatusFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priceTableFilter, setPriceTableFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeListId, setActiveListId] = useState("");
  const [listName, setListName] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [savingList, setSavingList] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendResult, setSendResult] =
    useState<SendResult | null>(null);

  const selectedSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds]
  );

  const selectedVisible = useMemo(
    () =>
      customers.filter((customer) =>
        selectedSet.has(customer.id)
      ).length,
    [customers, selectedSet]
  );

  const activeList = useMemo(
    () => lists.find((item) => item.id === activeListId) || null,
    [lists, activeListId]
  );

  const pushActiveCount = useMemo(
    () => customers.filter((customer) => customer.push_active).length,
    [customers]
  );

  const portalActiveCount = useMemo(
    () => customers.filter((customer) => customer.portal_active).length,
    [customers]
  );

  async function loadBootstrap() {
    setBootstrapLoading(true);

    try {
      const response = await fetch(
        "/api/crm/portal-chat/broadcasts?mode=bootstrap",
        {
          cache: "no-store",
          credentials: "include",
        }
      );
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao carregar listas."
        );
      }

      setLists(Array.isArray(data?.lists) ? data.lists : []);
      setFilterOptions(data?.filters || EMPTY_FILTERS);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar listas.");
    } finally {
      setBootstrapLoading(false);
    }
  }

  async function loadCustomers() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (query.trim()) params.set("q", query.trim());
      if (pushFilter !== "all") params.set("push", pushFilter);
      if (portalFilter !== "all")
        params.set("portal", portalFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (segmentFilter) params.set("segment", segmentFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (priceTableFilter)
        params.set("priceTable", priceTableFilter);

      const response = await fetch(
        `/api/crm/portal-chat/broadcasts?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao buscar clientes."
        );
      }

      setCustomers(
        Array.isArray(data?.customers) ? data.customers : []
      );
    } catch (err: any) {
      setError(err?.message || "Erro ao buscar clientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCustomers();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [
    query,
    pushFilter,
    portalFilter,
    statusFilter,
    cityFilter,
    segmentFilter,
    categoryFilter,
    priceTableFilter,
  ]);

  function toggleCustomer(id: string) {
    setActiveListId("");
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleAllVisible() {
    setActiveListId("");

    const visibleIds = customers.map((customer) => customer.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedSet.has(id));

    if (allSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id))
      );
      return;
    }

    setSelectedIds((current) => [
      ...new Set([...current, ...visibleIds]),
    ]);
  }

  function selectPushActiveVisible() {
    setActiveListId("");
    const ids = customers
      .filter(
        (customer) =>
          customer.push_active && customer.portal_active
      )
      .map((customer) => customer.id);

    setSelectedIds(ids);
  }

  function clearSelection() {
    setSelectedIds([]);
    setActiveListId("");
    setSendResult(null);
  }

  function loadList(list: BroadcastList) {
    setActiveListId(list.id);
    setSelectedIds(list.customer_ids || []);
    setListName(list.name);
    setSendResult(null);
  }

  async function createList() {
    const name = listName.trim();

    if (!name) {
      window.alert("Digite o nome da lista.");
      return;
    }

    if (!selectedIds.length) {
      window.alert("Selecione os clientes da lista.");
      return;
    }

    setSavingList(true);

    try {
      const response = await fetch(
        "/api/crm/portal-chat/broadcasts",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create_list",
            name,
            customerIds: selectedIds,
          }),
        }
      );
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao criar lista."
        );
      }

      await loadBootstrap();
      setActiveListId(data?.list?.id || "");
      window.alert(
        `Lista criada com ${data?.list?.member_count || selectedIds.length} clientes.`
      );
    } catch (err: any) {
      window.alert(err?.message || "Erro ao criar lista.");
    } finally {
      setSavingList(false);
    }
  }

  async function updateActiveList() {
    if (!activeListId) return;

    setSavingList(true);

    try {
      const response = await fetch(
        "/api/crm/portal-chat/broadcasts",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "replace_list",
            listId: activeListId,
            customerIds: selectedIds,
          }),
        }
      );
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao atualizar lista."
        );
      }

      await loadBootstrap();
      window.alert(
        `Lista atualizada com ${data?.member_count || 0} clientes.`
      );
    } catch (err: any) {
      window.alert(err?.message || "Erro ao atualizar lista.");
    } finally {
      setSavingList(false);
    }
  }

  async function deleteList(list: BroadcastList) {
    if (
      !window.confirm(
        `Excluir a lista "${list.name}"?\n\nAs conversas e mensagens já enviadas não serão apagadas.`
      )
    ) {
      return;
    }

    const response = await fetch(
      `/api/crm/portal-chat/broadcasts?listId=${encodeURIComponent(
        list.id
      )}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const data = await readJson(response);

    if (!response.ok) {
      window.alert(data?.error || "Erro ao excluir lista.");
      return;
    }

    if (activeListId === list.id) {
      clearSelection();
      setListName("");
    }

    await loadBootstrap();
  }

  async function sendBroadcast() {
    const text = message.trim();

    if (!text) {
      window.alert("Digite a mensagem da transmissão.");
      return;
    }

    if (!selectedIds.length) {
      window.alert("Selecione pelo menos um cliente.");
      return;
    }

    const destination = activeList
      ? `"${activeList.name}" (${selectedIds.length} clientes)`
      : `${selectedIds.length} clientes selecionados`;

    if (
      !window.confirm(
        `Enviar esta mensagem para ${destination}?\n\nCada cliente receberá uma conversa individual. Os clientes não verão os demais destinatários.`
      )
    ) {
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const response = await fetch(
        "/api/crm/portal-chat/broadcasts",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "send",
            listId: activeListId || undefined,
            customerIds:
              activeListId ? undefined : selectedIds,
            message: text,
          }),
        }
      );
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao enviar transmissão."
        );
      }

      setSendResult(data?.result || null);
    } catch (err: any) {
      window.alert(
        err?.message || "Erro ao enviar transmissão."
      );
    } finally {
      setSending(false);
    }
  }

  function resetFilters() {
    setQuery("");
    setPushFilter("all");
    setPortalFilter("active");
    setStatusFilter("");
    setCityFilter("");
    setSegmentFilter("");
    setCategoryFilter("");
    setPriceTableFilter("");
  }

  return (
    <main className="broadcast-page">
      <section className="hero">
        <div>
          <span>ZENTRA SALES AI · PORTAL + PUSH</span>
          <h1>Central Portal + Push</h1>
          <p>
            Faça transmissões segmentadas, configure o chatbot e mantenha
            as tabelas oficiais de preço do Portal separadas por cliente.
            WhatsApp e Portal continuam com configurações separadas.
          </p>
        </div>

        <div className="hero-numbers">
          <div>
            <b>{customers.length}</b>
            <small>No filtro</small>
          </div>
          <div className="green">
            <b>{pushActiveCount}</b>
            <small>Push ativo</small>
          </div>
          <div>
            <b>{selectedIds.length}</b>
            <small>Selecionados</small>
          </div>
        </div>
      </section>

      <nav className="module-tabs" aria-label="Módulos Portal + Push">
        <button
          type="button"
          className={workspaceMode === "broadcasts" ? "active" : ""}
          onClick={() => setWorkspaceMode("broadcasts")}
        >
          📣 Transmissões Push
        </button>
        <button
          type="button"
          className={workspaceMode === "chatbot" ? "active" : ""}
          onClick={() => setWorkspaceMode("chatbot")}
        >
          🤖 Chatbot do Portal
        </button>
        <button
          type="button"
          className={workspaceMode === "prices" ? "active" : ""}
          onClick={() => setWorkspaceMode("prices")}
        >
          💰 Tabelas de Preço
        </button>
      </nav>

      {workspaceMode === "broadcasts" ? (
      <section className="broadcast-layout">
        <aside className="lists-panel">
          <div className="panel-title">
            <div>
              <span>SEGMENTAÇÃO SALVA</span>
              <h2>📣 Listas</h2>
            </div>
          </div>

          <div className="new-list">
            <label>
              <span>Nome da lista</span>
              <input
                value={listName}
                onChange={(event) =>
                  setListName(event.target.value)
                }
                placeholder="Ex: Pizzarias com Push"
              />
            </label>

            <div className="new-list-actions">
              <button
                type="button"
                className="primary"
                disabled={savingList || !selectedIds.length}
                onClick={() => void createList()}
              >
                {savingList
                  ? "Salvando..."
                  : `+ Criar lista (${selectedIds.length})`}
              </button>

              {activeListId && (
                <button
                  type="button"
                  className="secondary"
                  disabled={savingList}
                  onClick={() => void updateActiveList()}
                >
                  Atualizar lista atual
                </button>
              )}
            </div>
          </div>

          <div className="saved-lists">
            {bootstrapLoading && (
              <div className="empty">Carregando listas...</div>
            )}

            {!bootstrapLoading && !lists.length && (
              <div className="empty">
                Nenhuma lista criada ainda.
              </div>
            )}

            {lists.map((list) => (
              <article
                key={list.id}
                className={`list-card ${
                  activeListId === list.id ? "active" : ""
                }`}
              >
                <button
                  type="button"
                  className="list-main"
                  onClick={() => loadList(list)}
                >
                  <strong>{list.name}</strong>
                  <span>{list.member_count} clientes</span>
                </button>

                <button
                  type="button"
                  className="delete-list"
                  onClick={() => void deleteList(list)}
                  title="Excluir lista"
                >
                  ×
                </button>
              </article>
            ))}
          </div>
        </aside>

        <section className="workspace">
          <section className="filters-card">
            <div className="filters-top">
              <div>
                <span>CARTEIRA DO VENDEDOR</span>
                <h2>Selecione quem vai receber</h2>
              </div>

              <div className="quick-actions">
                <button
                  type="button"
                  className="green-action"
                  onClick={selectPushActiveVisible}
                >
                  🔔 Selecionar Push ativo
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={resetFilters}
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            <div className="filters-grid">
              <label className="search-field">
                <span>Buscar cliente</span>
                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Nome, código, CNPJ, cidade..."
                />
              </label>

              <label>
                <span>Notificação</span>
                <select
                  value={pushFilter}
                  onChange={(event) =>
                    setPushFilter(event.target.value)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="active">🔔 Push ativo</option>
                  <option value="inactive">Sem Push</option>
                </select>
              </label>

              <label>
                <span>Portal</span>
                <select
                  value={portalFilter}
                  onChange={(event) =>
                    setPortalFilter(event.target.value)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="active">Portal ativo</option>
                  <option value="inactive">Sem portal</option>
                </select>
              </label>

              <label>
                <span>Status cliente</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value)
                  }
                >
                  <option value="">Todos</option>
                  {filterOptions.statuses.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Cidade</span>
                <select
                  value={cityFilter}
                  onChange={(event) =>
                    setCityFilter(event.target.value)
                  }
                >
                  <option value="">Todas</option>
                  {filterOptions.cities.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Segmento</span>
                <select
                  value={segmentFilter}
                  onChange={(event) =>
                    setSegmentFilter(event.target.value)
                  }
                >
                  <option value="">Todos</option>
                  {filterOptions.segments.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Categoria</span>
                <select
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(event.target.value)
                  }
                >
                  <option value="">Todas</option>
                  {filterOptions.categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Tabela</span>
                <select
                  value={priceTableFilter}
                  onChange={(event) =>
                    setPriceTableFilter(event.target.value)
                  }
                >
                  <option value="">Todas</option>
                  {filterOptions.price_tables.map((value) => (
                    <option key={value} value={String(value)}>
                      Tabela {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="selection-bar">
              <button
                type="button"
                className="secondary"
                onClick={toggleAllVisible}
                disabled={!customers.length}
              >
                {customers.length > 0 &&
                selectedVisible === customers.length
                  ? "Desmarcar filtro"
                  : `Selecionar todos do filtro (${customers.length})`}
              </button>

              <span>
                <b>{selectedIds.length}</b> selecionados no total
              </span>

              {selectedIds.length > 0 && (
                <button
                  type="button"
                  className="link-button"
                  onClick={clearSelection}
                >
                  Limpar seleção
                </button>
              )}
            </div>
          </section>

          <section className="customer-list">
            {loading && (
              <div className="empty large">
                Buscando sua carteira...
              </div>
            )}

            {!loading && error && (
              <div className="error-box">{error}</div>
            )}

            {!loading && !error && !customers.length && (
              <div className="empty large">
                Nenhum cliente encontrado com estes filtros.
              </div>
            )}

            {!loading &&
              customers.map((customer) => {
                const selected = selectedSet.has(customer.id);

                return (
                  <button
                    type="button"
                    key={customer.id}
                    className={`customer-row ${
                      selected ? "selected" : ""
                    }`}
                    onClick={() => toggleCustomer(customer.id)}
                  >
                    <span
                      className={`check ${
                        selected ? "checked" : ""
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>

                    <span className="customer-copy">
                      <strong>{customer.name}</strong>
                      <small>
                        {customer.internal_code ||
                          customer.erp_code ||
                          "Sem código"}
                        {customer.city
                          ? ` · ${customer.city}${
                              customer.state
                                ? `/${customer.state}`
                                : ""
                            }`
                          : ""}
                        {customer.segment
                          ? ` · ${customer.segment}`
                          : ""}
                      </small>
                    </span>

                    <span className="customer-flags">
                      <em
                        className={
                          customer.portal_active
                            ? "good"
                            : "muted"
                        }
                      >
                        {customer.portal_active
                          ? "✓ Portal"
                          : "Sem portal"}
                      </em>

                      <em
                        className={
                          customer.push_active
                            ? "push"
                            : "muted"
                        }
                      >
                        {customer.push_active
                          ? "🔔 Push"
                          : "Push pendente"}
                      </em>

                      <em className="status">
                        {customer.status}
                      </em>
                    </span>
                  </button>
                );
              })}
          </section>

          <section className="composer">
            <div className="composer-head">
              <div>
                <span>TRANSMISSÃO PRIVADA</span>
                <h2>
                  {activeList
                    ? `Enviar para: ${activeList.name}`
                    : "Enviar para selecionados"}
                </h2>
              </div>

              <strong className="recipient-count">
                {selectedIds.length} clientes
              </strong>
            </div>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Ex: Bom dia! Separei algumas condições especiais para você hoje. Quer que eu monte uma cotação?"
            />

            <div className="composer-footer">
              <p>
                A mensagem será criada individualmente no Chat do Portal.
                Quem tiver Push ativo também receberá a notificação no
                celular.
              </p>

              <button
                type="button"
                className="send-button"
                disabled={
                  sending ||
                  !message.trim() ||
                  !selectedIds.length
                }
                onClick={() => void sendBroadcast()}
              >
                {sending
                  ? "Enviando transmissão..."
                  : `📣 Enviar para ${selectedIds.length}`}
              </button>
            </div>

            {sendResult && (
              <div className="result-grid">
                <Result
                  label="Selecionados"
                  value={sendResult.selected}
                />
                <Result
                  label="Mensagens criadas"
                  value={sendResult.message_delivered}
                  good
                />
                <Result
                  label="Push enviados"
                  value={sendResult.push_sent}
                  good
                />
                <Result
                  label="Sem Push"
                  value={sendResult.without_push}
                />
                <Result
                  label="Sem portal"
                  value={sendResult.without_portal}
                  warn
                />
                <Result
                  label="Falhas"
                  value={
                    sendResult.failed + sendResult.push_failed
                  }
                  warn
                />
              </div>
            )}
          </section>
        </section>
      </section>
      ) : workspaceMode === "chatbot" ? (
        <PortalChatAutomationManager />
      ) : (
        <PortalPriceTableManager />
      )}

      <style jsx>{`
        .broadcast-page {
          width: min(1480px, 100%);
          margin: 0 auto;
          padding: 4px;
          color: #182230;
        }

        .module-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 14px 0;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 6px;
          background: #fff;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
        }

        .module-tabs button {
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 11px;
          padding: 10px 14px;
          background: transparent;
          color: #667085;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .module-tabs button.active {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #15803d;
        }

        .hero,
        .lists-panel,
        .filters-card,
        .customer-list,
        .composer {
          border: 1px solid #e5e7eb;
          background: #fff;
          box-shadow: 0 16px 45px rgba(15, 23, 42, 0.06);
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          border-radius: 24px;
          padding: 24px;
        }

        .hero > div:first-child {
          max-width: 760px;
        }

        .hero span,
        .panel-title span,
        .filters-top span,
        .composer-head span {
          color: #15803d;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
        }

        .hero h1 {
          margin: 5px 0 8px;
          color: #101828;
          font-size: clamp(27px, 3vw, 40px);
          letter-spacing: -0.05em;
          line-height: 1;
        }

        .hero p,
        .composer-footer p {
          margin: 0;
          color: #667085;
          font-size: 13px;
          font-weight: 650;
          line-height: 1.55;
        }

        .hero-numbers {
          display: flex;
          gap: 10px;
        }

        .hero-numbers > div {
          min-width: 100px;
          padding: 14px;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          background: #f8fafc;
        }

        .hero-numbers b,
        .hero-numbers small {
          display: block;
        }

        .hero-numbers b {
          font-size: 24px;
          color: #101828;
        }

        .hero-numbers .green b {
          color: #15803d;
        }

        .hero-numbers small {
          margin-top: 2px;
          color: #667085;
          font-size: 10px;
          font-weight: 800;
        }

        .broadcast-layout {
          display: grid;
          grid-template-columns: 300px minmax(0, 1fr);
          gap: 14px;
          margin-top: 14px;
        }

        .lists-panel {
          align-self: start;
          position: sticky;
          top: 16px;
          border-radius: 22px;
          padding: 16px;
        }

        .panel-title h2,
        .filters-top h2,
        .composer-head h2 {
          margin: 4px 0 0;
          color: #101828;
          font-size: 20px;
          letter-spacing: -0.035em;
        }

        .new-list {
          display: grid;
          gap: 10px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #eef2f6;
        }

        label {
          min-width: 0;
          display: grid;
          gap: 5px;
        }

        label > span {
          color: #667085;
          font-size: 10px;
          font-weight: 850;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #dfe4ea;
          border-radius: 12px;
          outline: none;
          background: #fff;
          color: #182230;
          font: inherit;
          font-size: 12px;
          font-weight: 650;
        }

        input,
        select {
          height: 40px;
          padding: 0 10px;
        }

        textarea {
          resize: vertical;
          min-height: 120px;
          padding: 12px;
          line-height: 1.5;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: #22c55e;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
        }

        .new-list-actions {
          display: grid;
          gap: 7px;
        }

        button {
          font: inherit;
        }

        button.primary,
        button.secondary,
        .green-action,
        .send-button {
          min-height: 39px;
          border-radius: 11px;
          padding: 0 12px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        button.primary,
        .send-button {
          border: 1px solid #15803d;
          color: #fff;
          background: #15803d;
        }

        button.primary:hover,
        .send-button:hover {
          background: #166534;
        }

        button.secondary {
          border: 1px solid #dfe4ea;
          color: #344054;
          background: #fff;
        }

        .green-action {
          border: 1px solid #bbf7d0;
          color: #166534;
          background: #f0fdf4;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .saved-lists {
          display: grid;
          gap: 7px;
          margin-top: 14px;
          max-height: 520px;
          overflow: auto;
        }

        .list-card {
          display: grid;
          grid-template-columns: 1fr 30px;
          border: 1px solid #e5e7eb;
          border-radius: 13px;
          overflow: hidden;
        }

        .list-card.active {
          border-color: #22c55e;
          background: #f0fdf4;
        }

        .list-main {
          min-width: 0;
          display: grid;
          gap: 2px;
          padding: 10px;
          border: 0;
          text-align: left;
          background: transparent;
          cursor: pointer;
        }

        .list-main strong {
          overflow: hidden;
          color: #101828;
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .list-main span {
          color: #667085;
          font-size: 10px;
          font-weight: 750;
        }

        .delete-list {
          border: 0;
          background: transparent;
          color: #98a2b3;
          cursor: pointer;
          font-size: 18px;
        }

        .delete-list:hover {
          color: #dc2626;
        }

        .workspace {
          min-width: 0;
          display: grid;
          gap: 12px;
        }

        .filters-card,
        .customer-list,
        .composer {
          border-radius: 22px;
          padding: 16px;
        }

        .filters-top,
        .composer-head,
        .composer-footer,
        .selection-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .quick-actions {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: 1.7fr repeat(7, minmax(100px, 1fr));
          gap: 8px;
          margin-top: 15px;
        }

        .selection-bar {
          justify-content: flex-start;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #eef2f6;
          color: #667085;
          font-size: 11px;
          font-weight: 750;
        }

        .selection-bar b {
          color: #15803d;
        }

        .link-button {
          border: 0;
          background: transparent;
          color: #dc2626;
          cursor: pointer;
          font-size: 10px;
          font-weight: 850;
        }

        .customer-list {
          max-height: 480px;
          overflow: auto;
          padding: 8px;
        }

        .customer-row {
          width: 100%;
          min-width: 0;
          display: grid;
          grid-template-columns: 28px minmax(190px, 1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border: 0;
          border-bottom: 1px solid #f0f2f5;
          text-align: left;
          background: #fff;
          cursor: pointer;
        }

        .customer-row:hover {
          background: #f8fafc;
        }

        .customer-row.selected {
          background: #f0fdf4;
        }

        .check {
          width: 21px;
          height: 21px;
          display: grid;
          place-items: center;
          border: 1px solid #cfd6df;
          border-radius: 6px;
          color: #fff;
          font-size: 12px;
          font-weight: 950;
        }

        .check.checked {
          border-color: #15803d;
          background: #15803d;
        }

        .customer-copy {
          min-width: 0;
          display: grid;
          gap: 3px;
        }

        .customer-copy strong {
          overflow: hidden;
          color: #101828;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .customer-copy small {
          overflow: hidden;
          color: #667085;
          font-size: 10px;
          font-weight: 650;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .customer-flags {
          display: flex;
          justify-content: flex-end;
          gap: 5px;
          flex-wrap: wrap;
        }

        .customer-flags em {
          padding: 4px 7px;
          border-radius: 999px;
          font-size: 9px;
          font-style: normal;
          font-weight: 900;
          white-space: nowrap;
        }

        .customer-flags .good {
          color: #166534;
          background: #dcfce7;
        }

        .customer-flags .push {
          color: #1d4ed8;
          background: #dbeafe;
        }

        .customer-flags .muted,
        .customer-flags .status {
          color: #667085;
          background: #f2f4f7;
        }

        .composer {
          border-color: #bbf7d0;
        }

        .recipient-count {
          padding: 6px 10px;
          border-radius: 999px;
          color: #166534;
          background: #dcfce7;
          font-size: 11px;
        }

        .composer textarea {
          margin-top: 13px;
        }

        .composer-footer {
          align-items: flex-end;
          margin-top: 10px;
        }

        .composer-footer p {
          max-width: 720px;
          font-size: 11px;
        }

        .send-button {
          min-width: 180px;
          min-height: 44px;
        }

        .result-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 7px;
          margin-top: 13px;
        }

        .empty,
        .error-box {
          padding: 16px;
          border-radius: 12px;
          color: #667085;
          background: #f8fafc;
          text-align: center;
          font-size: 11px;
          font-weight: 750;
        }

        .empty.large {
          padding: 48px 16px;
        }

        .error-box {
          color: #b42318;
          background: #fef3f2;
        }

        @media (max-width: 1280px) {
          .filters-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .search-field {
            grid-column: span 2;
          }

          .result-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 980px) {
          .hero {
            align-items: stretch;
            flex-direction: column;
          }

          .hero-numbers {
            overflow-x: auto;
          }

          .broadcast-layout {
            grid-template-columns: 1fr;
          }

          .lists-panel {
            position: static;
          }

          .saved-lists {
            max-height: 240px;
          }
        }

        @media (max-width: 700px) {
          .broadcast-page {
            padding: 0;
          }

          .hero,
          .lists-panel,
          .filters-card,
          .customer-list,
          .composer {
            border-radius: 16px;
            padding: 12px;
          }

          .hero-numbers > div {
            min-width: 88px;
          }

          .filters-top,
          .composer-head,
          .composer-footer,
          .selection-bar {
            align-items: stretch;
            flex-direction: column;
          }

          .quick-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .filters-grid {
            grid-template-columns: 1fr 1fr;
          }

          .search-field {
            grid-column: 1 / -1;
          }

          .customer-row {
            grid-template-columns: 28px minmax(0, 1fr);
          }

          .customer-flags {
            grid-column: 2;
            justify-content: flex-start;
          }

          .composer-footer .send-button {
            width: 100%;
          }

          .result-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function Result({
  label,
  value,
  good = false,
  warn = false,
}: {
  label: string;
  value: number;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`result ${good ? "good" : ""} ${
        warn ? "warn" : ""
      }`}
    >
      <small>{label}</small>
      <strong>{value}</strong>

      <style jsx>{`
        .result {
          padding: 10px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #f8fafc;
        }

        small,
        strong {
          display: block;
        }

        small {
          color: #667085;
          font-size: 9px;
          font-weight: 800;
        }

        strong {
          margin-top: 3px;
          color: #101828;
          font-size: 19px;
        }

        .good strong {
          color: #15803d;
        }

        .warn strong {
          color: #d97706;
        }
      `}</style>
    </div>
  );
}
