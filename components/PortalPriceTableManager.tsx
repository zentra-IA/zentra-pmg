"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Version = {
  id: string;
  price_table: number;
  table_date: string;
  pdf_name: string;
  status: string;
  product_count: number;
  unmatched_count: number;
  parser_engine?: string | null;
  activated_at?: string | null;
  created_at: string;
};

type TableSummary = {
  price_table: number;
  customer_count: number;
  active_version: Version | null;
  versions: Version[];
};

function brDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function statusLabel(status: string) {
  if (status === "active") return "ATIVA";
  if (status === "ready") return "PRONTA";
  if (status === "superseded") return "ANTERIOR";
  if (status === "failed") return "FALHOU";
  return status.toUpperCase();
}

export default function PortalPriceTableManager() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [unclassified, setUnclassified] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activatingId, setActivatingId] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () =>
      tables.find((item) => item.price_table === selectedTable) ||
      null,
    [tables, selectedTable]
  );

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/crm/portal-price-tables", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar tabelas.");
      }

      setTables(Array.isArray(data?.tables) ? data.tables : []);
      setCanManage(Boolean(data?.can_manage));
      setUnclassified(Number(data?.unclassified_customers || 0));
    } catch (error: any) {
      setMessage(error?.message || "Erro ao carregar tabelas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Selecione um arquivo PDF.");
      return;
    }

    setUploading(true);
    setMessage(
      `Processando ${file.name} como Tabela ${selectedTable}. A versão atual continuará ativa até você validar esta importação.`
    );

    try {
      const form = new FormData();
      form.append("priceTable", String(selectedTable));
      form.append("file", file);

      const response = await fetch("/api/crm/portal-price-tables", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao importar PDF.");
      }

      setMessage(
        `Tabela ${selectedTable} processada: ${data?.version?.product_count || 0} preços. ` +
          `${data?.version?.unmatched_count || 0} sem vínculo no catálogo. Revise e clique em "Ativar".`
      );

      await load();
    } catch (error: any) {
      setMessage(error?.message || "Erro ao importar tabela.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function activate(version: Version) {
    if (
      !window.confirm(
        `Ativar "${version.pdf_name}" como Tabela ${version.price_table} oficial do Chatbot?\n\nA versão ativa anterior será preservada no histórico e poderá ser reativada.`
      )
    ) {
      return;
    }

    setActivatingId(version.id);
    setMessage("");

    try {
      const response = await fetch("/api/crm/portal-price-tables", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate",
          versionId: version.id,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao ativar tabela.");
      }

      setMessage(
        `Tabela ${version.price_table} ativada. O futuro cotador do Portal usará somente esta versão para clientes classificados nessa tabela.`
      );
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Erro ao ativar versão.");
    } finally {
      setActivatingId("");
    }
  }

  async function remove(version: Version) {
    if (
      !window.confirm(
        `Excluir a importação "${version.pdf_name}"?\n\nVersões ativas não podem ser excluídas.`
      )
    ) {
      return;
    }

    const response = await fetch(
      `/api/crm/portal-price-tables?versionId=${encodeURIComponent(
        version.id
      )}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(data?.error || "Erro ao excluir.");
      return;
    }

    setMessage("Versão excluída.");
    await load();
  }

  if (loading) {
    return <div className="portal-price-loading">Carregando Central de Tabelas...</div>;
  }

  return (
    <section className="portal-price-manager">
      <div className="price-hero">
        <div>
          <span className="eyebrow">PREÇO OFICIAL DO CHATBOT</span>
          <h2>💰 Tabelas do Dia</h2>
          <p>
            O Cotador atual do vendedor não é alterado. Estas versões são
            exclusivas da futura cotação conversacional do Portal e usam a
            tabela já calculada no cadastro de cada cliente.
          </p>
        </div>

        <div className="safety-box">
          <strong>Regra de segurança</strong>
          <span>
            Cliente Tabela 0 → somente preço ativo da Tabela 0. A IA nunca
            escolhe tabela e nunca inventa preço.
          </span>
        </div>
      </div>

      <div className="table-grid">
        {tables.map((table) => (
          <button
            type="button"
            key={table.price_table}
            className={`table-card ${
              selectedTable === table.price_table ? "selected" : ""
            } ${table.active_version ? "ready" : "missing"}`}
            onClick={() => {
              setSelectedTable(table.price_table);
              setMessage("");
            }}
          >
            <span className="table-number">Tabela {table.price_table}</span>
            <strong>
              {table.active_version
                ? "✅ Ativa"
                : "⚠️ Sem preço ativo"}
            </strong>
            <small>{table.customer_count} clientes classificados</small>
            {table.active_version && (
              <small>
                {table.active_version.product_count} preços ·{" "}
                {brDate(table.active_version.activated_at)}
              </small>
            )}
          </button>
        ))}
      </div>

      {unclassified > 0 && (
        <div className="warning">
          ⚠️ {unclassified} cliente(s) ainda estão sem `price_table`. Eles
          deverão ser direcionados ao vendedor, nunca receber preço automático.
        </div>
      )}

      <div className="work-grid">
        <section className="upload-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">IMPORTAÇÃO SEGURA</span>
              <h3>Tabela {selectedTable}</h3>
            </div>

            {selected?.active_version && (
              <span className="active-chip">● PREÇO ATIVO</span>
            )}
          </div>

          {selected?.active_version ? (
            <div className="active-version">
              <strong>{selected.active_version.pdf_name}</strong>
              <span>
                {selected.active_version.product_count} produtos ·{" "}
                {selected.active_version.unmatched_count} sem vínculo no catálogo
              </span>
              <span>
                Data da tabela:{" "}
                {new Date(
                  selected.active_version.table_date
                ).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ) : (
            <div className="empty-version">
              Nenhuma versão ativa para esta tabela.
            </div>
          )}

          {canManage ? (
            <label className={`upload-zone ${uploading ? "disabled" : ""}`}>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                disabled={uploading}
                onChange={(event) =>
                  void upload(event.target.files?.[0] || null)
                }
              />
              <b>
                {uploading
                  ? "Processando PDF..."
                  : `+ Importar PDF da Tabela ${selectedTable}`}
              </b>
              <span>
                O PDF é processado pelo mesmo parser remoto já usado pelo
                Cotador. A nova versão fica PRONTA, mas não entra em produção
                até você clicar em Ativar.
              </span>
            </label>
          ) : (
            <div className="no-permission">
              Somente gestão/administração pode trocar tabelas oficiais.
            </div>
          )}

          {message && <div className="feedback">{message}</div>}
        </section>

        <section className="versions-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">VERSIONAMENTO</span>
              <h3>Histórico da Tabela {selectedTable}</h3>
            </div>
          </div>

          {!selected?.versions?.length ? (
            <div className="empty-version">
              Nenhuma importação realizada ainda.
            </div>
          ) : (
            <div className="versions">
              {selected.versions.map((version) => (
                <article className="version-row" key={version.id}>
                  <div className="version-copy">
                    <div className="version-title">
                      <strong>{version.pdf_name}</strong>
                      <span className={`status status-${version.status}`}>
                        {statusLabel(version.status)}
                      </span>
                    </div>
                    <small>
                      {version.product_count} preços ·{" "}
                      {version.unmatched_count} sem vínculo ·{" "}
                      {brDate(version.created_at)}
                    </small>
                  </div>

                  {canManage && (
                    <div className="version-actions">
                      {version.status !== "active" && (
                        <button
                          type="button"
                          className="activate"
                          disabled={activatingId === version.id}
                          onClick={() => void activate(version)}
                        >
                          {activatingId === version.id
                            ? "Ativando..."
                            : "Ativar"}
                        </button>
                      )}
                      {version.status !== "active" && (
                        <button
                          type="button"
                          className="remove"
                          onClick={() => void remove(version)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="quote-foundation">
        <div>
          <span className="eyebrow">HISTÓRICO COMERCIAL</span>
          <h3>🧾 Cotações do Chatbot preparadas para histórico</h3>
          <p>
            A migration também cria sessões e itens de cotação com snapshot de
            produto, preço, tabela e versão. Quando conectarmos o diálogo ao
            Quotes Engine, cada cotação ficará registrada sem mudar amanhã
            quando o PDF de preços for atualizado.
          </p>
        </div>

        <div className="flow">
          <span>Cliente</span>
          <b>→</b>
          <span>Tabela {selectedTable}</span>
          <b>→</b>
          <span>Preço versionado</span>
          <b>→</b>
          <span>Cotação salva</span>
        </div>
      </section>

      <style jsx>{`
        .portal-price-manager {
          display: grid;
          gap: 14px;
          color: #182230;
        }
        .portal-price-loading,
        .price-hero,
        .upload-panel,
        .versions-panel,
        .quote-foundation {
          border: 1px solid #e5e7eb;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 16px 45px rgba(15, 23, 42, 0.06);
        }
        .portal-price-loading {
          padding: 28px;
          text-align: center;
          font-weight: 800;
        }
        .price-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 20px;
        }
        .price-hero > div:first-child {
          max-width: 760px;
        }
        .eyebrow {
          color: #15803d;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.13em;
        }
        h2, h3, p {
          margin: 0;
        }
        h2 {
          margin-top: 4px;
          font-size: 26px;
          letter-spacing: -0.04em;
        }
        h3 {
          margin-top: 3px;
          font-size: 18px;
          letter-spacing: -0.025em;
        }
        p {
          margin-top: 7px;
          color: #667085;
          font-size: 12px;
          font-weight: 650;
          line-height: 1.55;
        }
        .safety-box {
          max-width: 380px;
          display: grid;
          gap: 4px;
          padding: 13px;
          border: 1px solid #bbf7d0;
          border-radius: 14px;
          color: #166534;
          background: #f0fdf4;
        }
        .safety-box strong {
          font-size: 11px;
        }
        .safety-box span {
          font-size: 10px;
          font-weight: 700;
          line-height: 1.4;
        }
        .table-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
        }
        .table-card {
          min-width: 0;
          display: grid;
          gap: 4px;
          padding: 13px;
          border: 1px solid #e5e7eb;
          border-radius: 15px;
          text-align: left;
          background: #fff;
          cursor: pointer;
        }
        .table-card:hover {
          border-color: #86efac;
        }
        .table-card.selected {
          border-color: #16a34a;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
        }
        .table-card.missing {
          background: #fffbeb;
        }
        .table-card.ready {
          background: #f8fff9;
        }
        .table-number {
          color: #101828;
          font-size: 13px;
          font-weight: 950;
        }
        .table-card strong {
          color: #166534;
          font-size: 11px;
        }
        .table-card.missing strong {
          color: #b45309;
        }
        .table-card small {
          overflow: hidden;
          color: #667085;
          font-size: 9px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .warning,
        .feedback,
        .no-permission {
          padding: 11px 13px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 750;
        }
        .warning {
          border: 1px solid #fde68a;
          color: #92400e;
          background: #fffbeb;
        }
        .feedback {
          border: 1px solid #bbf7d0;
          color: #166534;
          background: #f0fdf4;
        }
        .no-permission {
          color: #667085;
          background: #f8fafc;
        }
        .work-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 12px;
        }
        .upload-panel,
        .versions-panel,
        .quote-foundation {
          padding: 16px;
        }
        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .active-chip {
          padding: 5px 8px;
          border-radius: 999px;
          color: #166534;
          background: #dcfce7;
          font-size: 9px;
          font-weight: 950;
        }
        .active-version,
        .empty-version {
          display: grid;
          gap: 3px;
          margin-top: 13px;
          padding: 12px;
          border-radius: 13px;
          background: #f8fafc;
        }
        .active-version strong {
          font-size: 12px;
        }
        .active-version span,
        .empty-version {
          color: #667085;
          font-size: 10px;
          font-weight: 700;
        }
        .upload-zone {
          display: grid;
          gap: 5px;
          margin-top: 12px;
          padding: 22px;
          border: 1px dashed #86efac;
          border-radius: 15px;
          color: #166534;
          background: #f0fdf4;
          cursor: pointer;
        }
        .upload-zone.disabled {
          opacity: .6;
          cursor: wait;
        }
        .upload-zone input {
          display: none;
        }
        .upload-zone b {
          font-size: 12px;
        }
        .upload-zone span {
          color: #4b6354;
          font-size: 10px;
          font-weight: 650;
          line-height: 1.45;
        }
        .versions {
          display: grid;
          gap: 7px;
          margin-top: 13px;
          max-height: 420px;
          overflow: auto;
        }
        .version-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px;
          border: 1px solid #eef2f6;
          border-radius: 13px;
        }
        .version-copy {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .version-title {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }
        .version-title strong {
          overflow: hidden;
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .version-copy small {
          color: #667085;
          font-size: 9px;
          font-weight: 700;
        }
        .status {
          flex: 0 0 auto;
          padding: 3px 6px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 950;
        }
        .status-active {
          color: #166534;
          background: #dcfce7;
        }
        .status-ready {
          color: #1d4ed8;
          background: #dbeafe;
        }
        .status-superseded {
          color: #667085;
          background: #f2f4f7;
        }
        .status-failed {
          color: #b42318;
          background: #fee4e2;
        }
        .version-actions {
          display: flex;
          gap: 5px;
        }
        .version-actions button {
          min-height: 32px;
          padding: 0 9px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 9px;
          font-weight: 900;
        }
        .activate {
          border: 1px solid #15803d;
          color: #fff;
          background: #15803d;
        }
        .remove {
          border: 1px solid #fecaca;
          color: #b91c1c;
          background: #fff;
        }
        .quote-foundation {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-color: #bbf7d0;
        }
        .quote-foundation > div:first-child {
          max-width: 720px;
        }
        .flow {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .flow span {
          padding: 6px 8px;
          border-radius: 9px;
          color: #166534;
          background: #f0fdf4;
          font-size: 9px;
          font-weight: 900;
        }
        .flow b {
          color: #98a2b3;
        }
        @media (max-width: 1050px) {
          .table-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .work-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 700px) {
          .price-hero,
          .quote-foundation {
            align-items: stretch;
            flex-direction: column;
          }
          .table-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .version-row {
            align-items: stretch;
            flex-direction: column;
          }
          .version-actions button {
            flex: 1;
          }
        }
      `}</style>
    </section>
  );
}
