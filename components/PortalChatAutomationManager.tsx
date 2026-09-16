"use client";

import { useEffect, useMemo, useState } from "react";

type Automation = {
  id: string;
  name: string;
  intent?: string | null;
  trigger_keywords: string[];
  match_type: string;
  response_text: string;
  response_variations: string[];
  is_fallback: boolean;
  priority: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type FormState = {
  id: string;
  name: string;
  intent: string;
  keywords: string;
  matchType: string;
  responseText: string;
  responseVariations: string;
  isFallback: boolean;
  priority: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  intent: "",
  keywords: "",
  matchType: "contains",
  responseText: "",
  responseVariations: "",
  isFallback: false,
  priority: "0",
  active: true,
};

const INTENTS = [
  ["", "Sem intenção específica"],
  ["SAUDACAO", "Saudação"],
  ["COTACAO", "Pedido de cotação"],
  ["CLIENTE_QUER_COMPRAR", "Cliente quer comprar"],
  ["NEGOCIACAO", "Negociação / desconto / pagamento"],
  ["ENTREGA", "Entrega / frete / prazo"],
  ["TRANSFERIR_VENDEDOR", "Pedir atendimento humano"],
  ["SEM_INTERESSE", "Sem interesse"],
  ["RESPONDEU", "Resposta genérica"],
];

function intentLabel(value: unknown) {
  const key = String(value || "").toUpperCase();
  return INTENTS.find(([id]) => id === key)?.[1] || key || "—";
}

function matchLabel(value: string) {
  if (value === "exact") return "Frase exata";
  if (value === "starts_with") return "Começa com";
  return "Contém";
}

async function json(response: Response) {
  return response.json().catch(() => ({}));
}

export default function PortalChatAutomationManager() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const activeCount = useMemo(
    () => automations.filter((item) => item.active).length,
    [automations]
  );

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/crm/portal-chat/automations",
        {
          credentials: "include",
          cache: "no-store",
        }
      );
      const data = await json(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao carregar chatbot."
        );
      }

      setAutomations(
        Array.isArray(data?.automations) ? data.automations : []
      );
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar chatbot.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function edit(item: Automation) {
    setForm({
      id: item.id,
      name: item.name || "",
      intent: item.intent || "",
      keywords: (item.trigger_keywords || []).join("\n"),
      matchType: item.match_type || "contains",
      responseText: item.response_text || "",
      responseVariations: (item.response_variations || []).join("\n"),
      isFallback: Boolean(item.is_fallback),
      priority: String(item.priority ?? 0),
      active: item.active !== false,
    });
    setShowForm(true);
    window.setTimeout(() => {
      document
        .getElementById("portal-chatbot-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
  }

  async function save() {
    if (saving) return;

    if (!form.name.trim()) {
      window.alert("Informe o nome da automação.");
      return;
    }

    if (!form.responseText.trim()) {
      window.alert("Informe a resposta automática.");
      return;
    }

    if (
      !form.isFallback &&
      !form.keywords.trim() &&
      !form.intent
    ) {
      window.alert(
        "Informe palavras-chave, uma intenção ou marque como resposta padrão."
      );
      return;
    }

    setSaving(true);

    try {
      const editing = Boolean(form.id);
      const response = await fetch(
        "/api/crm/portal-chat/automations",
        {
          method: editing ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: form.id || undefined,
            name: form.name,
            intent: form.isFallback ? "" : form.intent,
            triggerKeywords: form.isFallback ? [] : form.keywords,
            matchType: form.matchType,
            responseText: form.responseText,
            responseVariations: form.responseVariations,
            isFallback: form.isFallback,
            priority: Number(form.priority || 0),
            active: form.active,
          }),
        }
      );

      const data = await json(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao salvar automação."
        );
      }

      reset();
      await load();
    } catch (err: any) {
      window.alert(
        err?.message || "Erro ao salvar automação."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: Automation) {
    try {
      const response = await fetch(
        "/api/crm/portal-chat/automations",
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            active: !item.active,
            toggleOnly: true,
          }),
        }
      );
      const data = await json(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao alterar automação."
        );
      }

      setAutomations((current) =>
        current.map((automation) =>
          automation.id === item.id
            ? { ...automation, active: !item.active }
            : automation
        )
      );
    } catch (err: any) {
      window.alert(
        err?.message || "Erro ao alterar automação."
      );
    }
  }

  async function remove(item: Automation) {
    if (
      !window.confirm(
        `Excluir a automação "${item.name}"?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/crm/portal-chat/automations?id=${encodeURIComponent(
          item.id
        )}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const data = await json(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Erro ao excluir automação."
        );
      }

      setAutomations((current) =>
        current.filter((automation) => automation.id !== item.id)
      );

      if (form.id === item.id) reset();
    } catch (err: any) {
      window.alert(
        err?.message || "Erro ao excluir automação."
      );
    }
  }

  return (
    <section className="portal-bot">
      <section className="bot-summary">
        <div>
          <span>CHATBOT EXCLUSIVO DO PORTAL</span>
          <h2>🤖 Respostas automáticas Portal + Push</h2>
          <p>
            Estas automações respondem somente o Chat do Portal.
            Elas não alteram nem utilizam as mensagens automáticas do WhatsApp.
          </p>
        </div>

        <div className="bot-summary-actions">
          <div>
            <b>{activeCount}</b>
            <small>automações ativas</small>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowForm(true);
            }}
          >
            + Nova automação
          </button>
        </div>
      </section>

      <section className="how-it-works">
        <strong>Como funciona</strong>
        <span>
          Cliente responde no Portal → Zentra identifica o gatilho →
          responde no chat → cliente recebe Push. Quando o vendedor
          assumir manualmente uma conversa, a IA daquela conversa é
          pausada automaticamente.
        </span>
      </section>

      {error && <div className="error">{error}</div>}

      {showForm && (
        <section className="bot-form" id="portal-chatbot-form">
          <div className="form-head">
            <div>
              <span>AUTOMAÇÃO</span>
              <h3>
                {form.id
                  ? "Editar resposta automática"
                  : "Criar resposta automática"}
              </h3>
            </div>
            <button
              type="button"
              className="close"
              onClick={reset}
            >
              ×
            </button>
          </div>

          <div className="form-grid">
            <label className="wide">
              <span>Nome interno</span>
              <input
                value={form.name}
                onChange={(event) =>
                  update("name", event.target.value)
                }
                placeholder="Ex: Cotação - primeira resposta"
              />
            </label>

            <label>
              <span>Intenção comercial</span>
              <select
                value={form.intent}
                disabled={form.isFallback}
                onChange={(event) =>
                  update("intent", event.target.value)
                }
              >
                {INTENTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Tipo de correspondência</span>
              <select
                value={form.matchType}
                disabled={form.isFallback}
                onChange={(event) =>
                  update("matchType", event.target.value)
                }
              >
                <option value="contains">
                  Mensagem contém
                </option>
                <option value="exact">
                  Mensagem é exatamente
                </option>
                <option value="starts_with">
                  Mensagem começa com
                </option>
              </select>
            </label>

            <label className="wide">
              <span>
                Palavras-chave / frases de gatilho
              </span>
              <textarea
                rows={3}
                value={form.keywords}
                disabled={form.isFallback}
                onChange={(event) =>
                  update("keywords", event.target.value)
                }
                placeholder={"cotação\nquanto custa\nme passa o preço\norçamento"}
              />
              <small>
                Uma por linha, ou separadas por vírgula. Se deixar
                sem palavras, selecione uma intenção acima.
              </small>
            </label>

            <label className="wide">
              <span>Resposta principal</span>
              <textarea
                rows={5}
                value={form.responseText}
                onChange={(event) =>
                  update("responseText", event.target.value)
                }
                placeholder="Claro, {{nome}}! Posso te ajudar com a cotação. Quais produtos e quantidades você precisa?"
              />
              <small>
                Você pode usar {"{{nome}}"} ou {"{{cliente}}"}.
              </small>
            </label>

            <label className="wide">
              <span>Variações da resposta (opcional)</span>
              <textarea
                rows={3}
                value={form.responseVariations}
                onChange={(event) =>
                  update("responseVariations", event.target.value)
                }
                placeholder={"Olá {{nome}}! Me diga os itens da cotação.\nPerfeito! Quais produtos e quantidades você precisa?"}
              />
              <small>
                Uma alternativa por linha. O sistema alterna entre
                a resposta principal e as variações.
              </small>
            </label>

            <label>
              <span>Prioridade</span>
              <input
                type="number"
                min="-1000"
                max="1000"
                value={form.priority}
                onChange={(event) =>
                  update("priority", event.target.value)
                }
              />
              <small>
                Maior prioridade é avaliada primeiro.
              </small>
            </label>

            <div className="switches">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    update("active", event.target.checked)
                  }
                />
                <span>Automação ativa</span>
              </label>

              <label className="check-line fallback">
                <input
                  type="checkbox"
                  checked={form.isFallback}
                  onChange={(event) =>
                    update("isFallback", event.target.checked)
                  }
                />
                <span>
                  Resposta padrão quando nenhum gatilho combinar
                </span>
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={reset}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving
                ? "Salvando..."
                : form.id
                  ? "Salvar alterações"
                  : "Criar automação"}
            </button>
          </div>
        </section>
      )}

      <section className="automation-list">
        <div className="list-head">
          <div>
            <span>REGRAS DO VENDEDOR</span>
            <h3>Automações configuradas</h3>
          </div>
          <small>
            {automations.length} cadastradas
          </small>
        </div>

        {loading && (
          <div className="empty">Carregando automações...</div>
        )}

        {!loading && !automations.length && (
          <div className="empty large">
            <strong>Nenhuma automação criada.</strong>
            <span>
              Crie a primeira resposta para o Chat do Portal.
            </span>
          </div>
        )}

        {!loading &&
          automations.map((item) => (
            <article
              key={item.id}
              className={`automation ${
                item.active ? "" : "inactive"
              }`}
            >
              <div className="automation-main">
                <div className="automation-title">
                  <strong>{item.name}</strong>
                  {item.is_fallback && (
                    <em className="default">Padrão</em>
                  )}
                  <em
                    className={item.active ? "on" : "off"}
                  >
                    {item.active ? "Ativa" : "Pausada"}
                  </em>
                </div>

                <div className="automation-meta">
                  {!item.is_fallback && item.intent && (
                    <span>🎯 {intentLabel(item.intent)}</span>
                  )}
                  {!item.is_fallback &&
                    item.trigger_keywords?.length > 0 && (
                      <span>
                        🔑 {matchLabel(item.match_type)}:{" "}
                        {item.trigger_keywords
                          .slice(0, 4)
                          .join(", ")}
                        {item.trigger_keywords.length > 4
                          ? "…"
                          : ""}
                      </span>
                    )}
                  <span>Prioridade {item.priority}</span>
                </div>

                <p>{item.response_text}</p>
              </div>

              <div className="automation-actions">
                <button
                  type="button"
                  className="toggle"
                  onClick={() => void toggle(item)}
                >
                  {item.active ? "Pausar" : "Ativar"}
                </button>
                <button
                  type="button"
                  className="edit"
                  onClick={() => edit(item)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="delete"
                  onClick={() => void remove(item)}
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
      </section>

      <style jsx>{`
        .portal-bot {
          display: grid;
          gap: 16px;
        }

        .bot-summary,
        .bot-form,
        .automation-list {
          border: 1px solid #e5e7eb;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 16px 45px rgba(15, 23, 42, 0.06);
        }

        .bot-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 22px;
        }

        .bot-summary > div:first-child {
          max-width: 780px;
        }

        .bot-summary span,
        .form-head span,
        .list-head span {
          color: #15803d;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
        }

        h2,
        h3,
        p {
          margin: 0;
        }

        .bot-summary h2 {
          margin-top: 4px;
          color: #17202e;
          font-size: 22px;
        }

        .bot-summary p {
          margin-top: 7px;
          color: #667085;
          font-size: 13px;
          line-height: 1.55;
        }

        .bot-summary-actions {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .bot-summary-actions > div {
          min-width: 110px;
          display: grid;
          text-align: center;
        }

        .bot-summary-actions b {
          color: #15803d;
          font-size: 24px;
        }

        .bot-summary-actions small {
          color: #667085;
          font-size: 10px;
        }

        button,
        input,
        textarea,
        select {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .primary,
        .secondary,
        .toggle,
        .edit,
        .delete {
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 900;
        }

        .primary {
          border: 1px solid #15803d;
          background: #15803d;
          color: #fff;
        }

        .secondary,
        .toggle,
        .edit {
          border: 1px solid #d0d5dd;
          background: #fff;
          color: #344054;
        }

        .how-it-works {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #bbf7d0;
          border-radius: 16px;
          padding: 12px 15px;
          background: #f0fdf4;
          color: #166534;
          font-size: 12px;
        }

        .how-it-works strong {
          flex: 0 0 auto;
        }

        .error {
          border: 1px solid #fecaca;
          border-radius: 14px;
          padding: 12px 14px;
          background: #fff1f2;
          color: #b42318;
          font-size: 12px;
          font-weight: 800;
        }

        .bot-form {
          padding: 20px;
        }

        .form-head,
        .list-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }

        .form-head h3,
        .list-head h3 {
          margin-top: 3px;
          color: #17202e;
          font-size: 17px;
        }

        .close {
          width: 34px;
          height: 34px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          color: #667085;
          font-size: 20px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .form-grid > label {
          display: grid;
          gap: 6px;
        }

        .form-grid .wide {
          grid-column: 1 / -1;
        }

        .form-grid label > span {
          color: #344054;
          font-size: 11px;
          font-weight: 900;
        }

        .form-grid label > small {
          color: #98a2b3;
          font-size: 10px;
          line-height: 1.4;
        }

        input,
        textarea,
        select {
          width: 100%;
          border: 1px solid #d0d5dd;
          border-radius: 12px;
          padding: 10px 11px;
          background: #fff;
          color: #17202e;
          outline: none;
          font-size: 12px;
        }

        textarea {
          resize: vertical;
        }

        input:focus,
        textarea:focus,
        select:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.1);
        }

        input:disabled,
        textarea:disabled,
        select:disabled {
          background: #f9fafb;
          color: #98a2b3;
        }

        .switches {
          display: grid;
          align-content: center;
          gap: 9px;
          padding-top: 20px;
        }

        .check-line {
          display: flex !important;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .check-line input {
          width: 16px;
          height: 16px;
          accent-color: #15803d;
        }

        .check-line span {
          font-size: 11px !important;
        }

        .check-line.fallback {
          color: #7c2d12;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          margin-top: 18px;
        }

        .automation-list {
          padding: 20px;
        }

        .list-head small {
          color: #667085;
          font-size: 11px;
        }

        .automation {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-top: 1px solid #eef2f6;
          padding: 16px 2px;
        }

        .automation:first-of-type {
          border-top: 0;
        }

        .automation.inactive {
          opacity: 0.65;
        }

        .automation-main {
          min-width: 0;
          display: grid;
          gap: 7px;
        }

        .automation-title,
        .automation-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
        }

        .automation-title strong {
          color: #17202e;
          font-size: 13px;
        }

        .automation-title em,
        .automation-meta span {
          border-radius: 999px;
          padding: 4px 7px;
          font-style: normal;
          font-size: 9px;
          font-weight: 850;
        }

        .automation-title .on {
          background: #dcfce7;
          color: #166534;
        }

        .automation-title .off {
          background: #f2f4f7;
          color: #667085;
        }

        .automation-title .default {
          background: #ffedd5;
          color: #9a3412;
        }

        .automation-meta span {
          background: #f2f4f7;
          color: #475467;
        }

        .automation-main p {
          max-width: 820px;
          overflow: hidden;
          color: #667085;
          font-size: 11px;
          line-height: 1.5;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .automation-actions {
          flex: 0 0 auto;
          display: flex;
          gap: 7px;
        }

        .delete {
          border: 1px solid #fecaca;
          background: #fff;
          color: #b42318;
        }

        .empty {
          display: grid;
          gap: 6px;
          place-items: center;
          padding: 25px;
          color: #667085;
          text-align: center;
          font-size: 12px;
        }

        .empty.large {
          min-height: 150px;
        }

        @media (max-width: 760px) {
          .bot-summary {
            align-items: stretch;
            flex-direction: column;
          }

          .bot-summary-actions {
            justify-content: space-between;
          }

          .how-it-works {
            align-items: flex-start;
            flex-direction: column;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .form-grid .wide {
            grid-column: auto;
          }

          .switches {
            padding-top: 0;
          }

          .automation {
            align-items: stretch;
            flex-direction: column;
          }

          .automation-actions {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
          }

          .automation-main p {
            white-space: normal;
          }
        }
      `}</style>
    </section>
  );
}
