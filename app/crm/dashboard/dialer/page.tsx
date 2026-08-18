"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  status: string;
  total: number;
  processed: number;
  answered: number;
  sales: number;
  createdAt: string;
};

type DueCallback = {
  id: string;
  campaignId: string;
  nextCallAt: string | null;
  prospect: {
    id: string;
    name: string;
    phone1?: string | null;
    city?: string | null;
    state?: string | null;
  };
  campaign: {
    id: string;
    name: string;
  };
};

type ManualContactPreview = {
  line: number;
  name: string;
  phone: string;
  valid: boolean;
  duplicate: boolean;
  reason?: string;
};


function normalizeManualPhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  return digits;
}

function parseManualList(text: string): ManualContactPreview[] {
  const seen = new Set<string>();

  return String(text || "")
    .split(/\r?\n/)
    .map((raw, index) => {
      const line = raw.trim();

      if (!line) {
        return null;
      }

      let parts = line.split(/\t/);

      if (parts.length < 2) {
        parts = line.includes(";")
          ? line.split(";")
          : line.split(",");
      }

      const name = String(parts[0] || "").trim();
      const phone = normalizeManualPhone(parts.slice(1).join(" "));
      const validPhone = phone.length === 10 || phone.length === 11;
      const duplicate = validPhone && seen.has(phone);

      if (validPhone && !duplicate) {
        seen.add(phone);
      }

      return {
        line: index + 1,
        name,
        phone,
        valid: Boolean(name) && validPhone && !duplicate,
        duplicate,
        reason: !name
          ? "Nome ausente"
          : !validPhone
            ? "Telefone inválido"
            : duplicate
              ? "Duplicado"
              : undefined,
      };
    })
    .filter(Boolean) as ManualContactPreview[];
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    READY: "Pronta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluída",
  };

  return labels[status] || status;
}

export default function DialerPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dueCallbacks, setDueCallbacks] = useState<DueCallback[]>([]);
  const [campaignAction, setCampaignAction] = useState<{
    type: "edit" | "delete";
    campaign: Campaign;
  } | null>(null);
  const [campaignNameDraft, setCampaignNameDraft] = useState("");
  const [campaignSaving, setCampaignSaving] = useState(false);

  const [manualCampaignOpen, setManualCampaignOpen] = useState(false);
  const [manualCampaignName, setManualCampaignName] = useState("");
  const [manualListText, setManualListText] = useState("");
  const [manualPreview, setManualPreview] = useState<ManualContactPreview[]>([]);
  const [manualAnalyzed, setManualAnalyzed] = useState(false);
  const [manualCreating, setManualCreating] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  function resetManualCampaign() {
    setManualCampaignOpen(false);
    setManualCampaignName("");
    setManualListText("");
    setManualPreview([]);
    setManualAnalyzed(false);
    setManualCreating(false);
  }

  function analyzeManualContacts() {
    const preview = parseManualList(manualListText);
    setManualPreview(preview);
    setManualAnalyzed(true);
  }

  async function createManualCampaign() {
    if (manualCreating) return;

    const name = manualCampaignName.trim();
    const validContacts = manualPreview.filter((item) => item.valid);

    if (!name) {
      setMessage("Informe o nome da campanha manual.");
      return;
    }

    if (!manualAnalyzed) {
      setMessage("Analise a lista de contatos antes de criar a campanha.");
      return;
    }

    if (!validContacts.length) {
      setMessage("Nenhum contato válido foi encontrado.");
      return;
    }

    setManualCreating(true);
    setMessage("");

    try {
      const response = await fetch("/api/crm/dialer/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          name,
          manualContacts: validContacts.map((item) => ({
            name: item.name,
            phone: item.phone,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao criar campanha manual.");
      }

      resetManualCampaign();
      window.location.href = `/crm/dashboard/dialer/${data.campaign.id}`;
    } catch (error: any) {
      setMessage(error?.message || "Erro ao criar campanha manual.");
      setManualCreating(false);
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setMessage("Este navegador não oferece notificações web neste modo.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setMessage("Avisos de retorno ativados neste aparelho.");
    }
  }

  function notifyDue(callback: DueCallback) {
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate([180, 80, 180]);
      } catch {}
    }

    if (
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification("Retorno de ligação agora", {
          body: `${callback.prospect.name} • ${callback.campaign.name}`,
          tag: `dialer-callback-${callback.id}`,
        });
      } catch {}
    }
  }

  async function loadCallbacks() {
    try {
      const response = await fetch("/api/crm/dialer/callbacks", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao carregar retornos.");
      }

      const nextDue: DueCallback[] = data.due || [];

      setDueCallbacks((previous) => {
        const previousIds = new Set(previous.map((item) => item.id));
        const newlyDue = nextDue.filter((item) => !previousIds.has(item.id));

        if (newlyDue[0]) {
          notifyDue(newlyDue[0]);
        }

        return nextDue;
      });
    } catch {}
  }

  function openEditCampaign(campaign: Campaign) {
    setCampaignNameDraft(campaign.name);
    setCampaignAction({
      type: "edit",
      campaign,
    });
  }

  async function saveCampaignName() {
    if (!campaignAction || campaignAction.type !== "edit" || campaignSaving) return;

    const name = campaignNameDraft.trim();

    if (!name) {
      setMessage("Informe o nome da campanha.");
      return;
    }

    setCampaignSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/crm/dialer/campaigns/${campaignAction.campaign.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ name }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao editar campanha.");
      }

      setCampaignAction(null);
      await loadCampaigns();
    } catch (error: any) {
      setMessage(error?.message || "Erro ao editar campanha.");
    } finally {
      setCampaignSaving(false);
    }
  }

  async function deleteCampaign() {
    if (!campaignAction || campaignAction.type !== "delete" || campaignSaving) return;

    setCampaignSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/crm/dialer/campaigns/${campaignAction.campaign.id}`,
        {
          method: "DELETE",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao excluir campanha.");
      }

      setCampaignAction(null);
      await Promise.all([
        loadCampaigns(),
        loadCallbacks(),
      ]);
    } catch (error: any) {
      setMessage(error?.message || "Erro ao excluir campanha.");
    } finally {
      setCampaignSaving(false);
    }
  }

  async function loadCampaigns() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/crm/dialer/campaigns", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao carregar campanhas.");
      }

      setCampaigns(data.campaigns || []);
    } catch (error: any) {
      setMessage(error?.message || "Erro ao carregar campanhas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
    void loadCallbacks();

    const timer = window.setInterval(() => {
      void loadCallbacks();
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.kicker}>ZENTRA SALES AI</div>
          <h1 style={styles.title}>Discador Comercial</h1>
          <p style={styles.subtitle}>
            Ligue usando o chip e a operadora do próprio celular. Cada usuário visualiza somente as próprias campanhas.
          </p>
        </div>

        <div style={styles.heroActions}>
          <Link href="/crm/dashboard/radar" style={styles.primaryLink}>
            + Criar pelo Radar
          </Link>

          <button
            type="button"
            style={styles.manualCampaignButton}
            onClick={() => setManualCampaignOpen(true)}
          >
            + Nova campanha
          </button>
        </div>
      </section>

      {message ? <div style={styles.message}>{message}</div> : null}

      {dueCallbacks.length ? (
        <section style={styles.duePanel}>
          <div>
            <div style={styles.dueKicker}>⏰ RETORNOS PARA AGORA</div>
            <h2 style={styles.dueTitle}>
              {dueCallbacks.length} retorno{dueCallbacks.length === 1 ? "" : "s"} aguardando
            </h2>
            <p style={styles.dueText}>
              {dueCallbacks[0].prospect.name} • {dueCallbacks[0].campaign.name}
            </p>
          </div>

          <Link
            href={`/crm/dashboard/dialer/${dueCallbacks[0].campaignId}`}
            style={styles.dueLink}
          >
            Abrir retorno
          </Link>
        </section>
      ) : null}

      {notificationPermission !== "granted" &&
      notificationPermission !== "unsupported" ? (
        <button
          type="button"
          style={styles.notificationButton}
          onClick={enableNotifications}
        >
          🔔 Ativar avisos de retorno
        </button>
      ) : null}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Minhas campanhas</h2>
            <p style={styles.sectionText}>Continue de onde parou, use o Radar ou crie uma campanha manual de prospecção.</p>
          </div>

          <button type="button" style={styles.secondaryButton} onClick={loadCampaigns}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div style={styles.empty}>Carregando campanhas...</div>
        ) : !campaigns.length ? (
          <div style={styles.empty}>
            <strong>Nenhuma campanha criada ainda.</strong>
            <span>Crie pelo Radar ou use “Nova campanha” para colar uma lista de Nome, Telefone.</span>
          </div>
        ) : (
          <div style={styles.grid}>
            {campaigns.map((campaign) => {
              const progress = campaign.total
                ? Math.round((campaign.processed / campaign.total) * 100)
                : 0;

              return (
                <article key={campaign.id} style={styles.campaignCard}>
                  <div style={styles.cardTop}>
                    <div>
                      <div style={styles.badge}>{statusLabel(campaign.status)}</div>
                      <h3 style={styles.campaignTitle}>{campaign.name}</h3>
                    </div>
                    <div style={styles.progressNumber}>{progress}%</div>
                  </div>

                  <div style={styles.progressTrack}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${Math.min(100, Math.max(0, progress))}%`,
                      }}
                    />
                  </div>

                  <div style={styles.metrics}>
                    <div><strong>{campaign.total}</strong><span>Contatos</span></div>
                    <div><strong>{campaign.processed}</strong><span>Ligados</span></div>
                    <div><strong>{campaign.answered}</strong><span>Atendidos</span></div>
                    <div><strong>{campaign.sales}</strong><span>Vendas</span></div>
                  </div>

                  <div style={styles.campaignActions}>
                    <button
                      type="button"
                      style={styles.smallAction}
                      onClick={() => openEditCampaign(campaign)}
                    >
                      ✏️ Editar
                    </button>

                    <button
                      type="button"
                      style={styles.smallDangerAction}
                      onClick={() =>
                        setCampaignAction({
                          type: "delete",
                          campaign,
                        })
                      }
                    >
                      🗑️ Excluir
                    </button>
                  </div>

                  <Link
                    href={`/crm/dashboard/dialer/${campaign.id}`}
                    style={styles.openLink}
                  >
                    {campaign.status === "COMPLETED" ? "Ver campanha" : "Abrir discador"}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {manualCampaignOpen ? (
        <div
          style={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !manualCreating
            ) {
              resetManualCampaign();
            }
          }}
        >
          <div style={styles.manualModalCard}>
            <div style={styles.manualModalTop}>
              <div>
                <div style={styles.manualKicker}>PROSPECÇÃO EXTERNA</div>
                <h3 style={styles.modalTitle}>Nova campanha manual</h3>
              </div>

              <button
                type="button"
                style={styles.closeButton}
                disabled={manualCreating}
                onClick={resetManualCampaign}
              >
                ×
              </button>
            </div>

            <p style={styles.modalText}>
              Cole uma linha por contato. O mínimo necessário é Nome, Telefone.
              Esses leads ficam separados do fluxo do Radar.
            </p>

            <label style={styles.manualField}>
              <span>Nome da campanha</span>
              <input
                value={manualCampaignName}
                onChange={(event) => setManualCampaignName(event.target.value)}
                maxLength={120}
                placeholder="Ex.: Prospecção Pizzarias Guarulhos"
                style={styles.modalInput}
              />
            </label>

            <label style={styles.manualField}>
              <span>Adicionar em massa</span>
              <small style={styles.manualHelp}>
                Aceita vírgula, ponto e vírgula ou TAB. Ex.: Mercado Central,11999999999
              </small>
              <textarea
                rows={9}
                value={manualListText}
                onChange={(event) => {
                  setManualListText(event.target.value);
                  setManualAnalyzed(false);
                  setManualPreview([]);
                }}
                placeholder={"Mercado Central,11999999999\nLoja Primavera,11988888888"}
                style={{
                  ...styles.modalInput,
                  resize: "vertical",
                  minHeight: 170,
                }}
              />
            </label>

            <button
              type="button"
              style={styles.analyzeButton}
              onClick={analyzeManualContacts}
              disabled={!manualListText.trim() || manualCreating}
            >
              Analisar lista
            </button>

            {manualAnalyzed ? (
              <div style={styles.previewBox}>
                <div style={styles.previewMetrics}>
                  <div>
                    <strong>{manualPreview.length}</strong>
                    <span>Linhas</span>
                  </div>
                  <div>
                    <strong>{manualPreview.filter((item) => item.valid).length}</strong>
                    <span>Válidos</span>
                  </div>
                  <div>
                    <strong>{manualPreview.filter((item) => item.duplicate).length}</strong>
                    <span>Duplicados</span>
                  </div>
                  <div>
                    <strong>{manualPreview.filter((item) => !item.valid && !item.duplicate).length}</strong>
                    <span>Inválidos</span>
                  </div>
                </div>

                <div style={styles.previewList}>
                  {manualPreview.slice(0, 12).map((item) => (
                    <div
                      key={`${item.line}-${item.phone}-${item.name}`}
                      style={{
                        ...styles.previewRow,
                        ...(item.valid ? styles.previewRowValid : styles.previewRowInvalid),
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong>{item.name || `Linha ${item.line}`}</strong>
                        <span>{item.phone || "Sem telefone"}</span>
                      </div>
                      <b>{item.valid ? "✓ Válido" : item.reason}</b>
                    </div>
                  ))}

                  {manualPreview.length > 12 ? (
                    <div style={styles.previewMore}>
                      + {manualPreview.length - 12} linha(s) na lista
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.modalSecondary}
                disabled={manualCreating}
                onClick={resetManualCampaign}
              >
                Cancelar
              </button>

              <button
                type="button"
                style={styles.modalPrimary}
                disabled={
                  manualCreating ||
                  !manualCampaignName.trim() ||
                  !manualAnalyzed ||
                  !manualPreview.some((item) => item.valid)
                }
                onClick={createManualCampaign}
              >
                {manualCreating
                  ? "Criando..."
                  : `Criar e começar a ligar (${manualPreview.filter((item) => item.valid).length})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {campaignAction ? (
        <div
          style={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !campaignSaving
            ) {
              setCampaignAction(null);
            }
          }}
        >
          <div style={styles.modalCard}>
            {campaignAction.type === "edit" ? (
              <>
                <h3 style={styles.modalTitle}>Editar campanha</h3>
                <p style={styles.modalText}>
                  Altere somente o nome. Contatos, histórico e resultados permanecem intactos.
                </p>

                <input
                  autoFocus
                  maxLength={120}
                  value={campaignNameDraft}
                  onChange={(event) => setCampaignNameDraft(event.target.value)}
                  style={styles.modalInput}
                />

                <div style={styles.modalActions}>
                  <button
                    type="button"
                    style={styles.modalSecondary}
                    disabled={campaignSaving}
                    onClick={() => setCampaignAction(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    style={styles.modalPrimary}
                    disabled={campaignSaving || !campaignNameDraft.trim()}
                    onClick={saveCampaignName}
                  >
                    {campaignSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={styles.modalTitle}>Excluir campanha?</h3>
                <p style={styles.modalText}>
                  A campanha e o histórico do Discador dela serão excluídos. O cliente/Prospect do Radar não será apagado.
                </p>

                <div style={styles.deleteName}>{campaignAction.campaign.name}</div>

                <div style={styles.modalActions}>
                  <button
                    type="button"
                    style={styles.modalSecondary}
                    disabled={campaignSaving}
                    onClick={() => setCampaignAction(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    style={styles.modalDanger}
                    disabled={campaignSaving}
                    onClick={deleteCampaign}
                  >
                    {campaignSaving ? "Excluindo..." : "Excluir campanha"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

    </main>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "#f6f8fb",
    color: "#0f172a",
    padding: "24px",
  },
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
    background: "#fff",
    border: "1px solid #edf1f7",
    boxShadow: "0 8px 24px rgba(15,23,42,.04)",
    padding: "22px 24px",
    marginBottom: 18,
  },
  kicker: {
    color: "#14843f",
    fontSize: 12,
    letterSpacing: ".16em",
    fontWeight: 950,
  },
  title: {
    margin: "6px 0 8px",
    fontSize: "clamp(28px,5vw,38px)",
    letterSpacing: "-.045em",
    fontWeight: 950,
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.55,
    fontWeight: 650,
    maxWidth: 760,
  },
  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  manualCampaignButton: {
    border: "1px solid rgba(22,163,74,.25)",
    background: "#fff",
    color: "#14843f",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
  primaryLink: {
    textDecoration: "none",
    background: "linear-gradient(135deg,#16a34a,#14843f)",
    color: "#fff",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 950,
    boxShadow: "0 12px 24px rgba(22,163,74,.22)",
  },
  card: {
    background: "#fff",
    border: "1px solid rgba(22,163,74,.12)",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 12px 30px rgba(15,23,42,.045)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 950,
  },
  sectionText: {
    margin: "5px 0 0",
    color: "#64748b",
    fontWeight: 650,
  },
  secondaryButton: {
    border: "1px solid rgba(22,163,74,.22)",
    color: "#14843f",
    background: "#fff",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  message: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontWeight: 800,
  },
  duePanel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 14,
    padding: 18,
    borderRadius: 18,
    background: "linear-gradient(135deg,#fef3c7,#fff7ed)",
    border: "2px solid #f59e0b",
    boxShadow: "0 14px 30px rgba(245,158,11,.16)",
  },
  dueKicker: {
    color: "#b45309",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: ".08em",
  },
  dueTitle: {
    margin: "5px 0 3px",
    color: "#7c2d12",
    fontSize: 20,
    fontWeight: 950,
  },
  dueText: {
    margin: 0,
    color: "#92400e",
    fontWeight: 800,
  },
  dueLink: {
    textDecoration: "none",
    borderRadius: 13,
    padding: "11px 15px",
    background: "#d97706",
    color: "#fff",
    fontWeight: 950,
  },
  notificationButton: {
    width: "100%",
    marginBottom: 14,
    border: "1px solid #bbf7d0",
    borderRadius: 14,
    padding: "11px 14px",
    background: "#f0fdf4",
    color: "#166534",
    fontWeight: 950,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
    gap: 14,
  },
  campaignCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 16,
    background: "linear-gradient(180deg,#ffffff,#fbfffd)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  badge: {
    display: "inline-flex",
    borderRadius: 999,
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 950,
  },
  campaignTitle: {
    margin: "10px 0 0",
    fontSize: 18,
    fontWeight: 950,
  },
  progressNumber: {
    color: "#14843f",
    fontWeight: 950,
    fontSize: 20,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
    margin: "16px 0",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg,#16a34a,#14843f)",
    borderRadius: 999,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
    marginBottom: 14,
  },
  campaignActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 8,
  },
  smallAction: {
    border: "1px solid #dbe3ef",
    borderRadius: 10,
    padding: "8px 10px",
    background: "#fff",
    color: "#334155",
    fontWeight: 900,
    cursor: "pointer",
  },
  smallDangerAction: {
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "8px 10px",
    background: "#fff7f7",
    color: "#b91c1c",
    fontWeight: 900,
    cursor: "pointer",
  },
  modalBackdrop: {
    position: "fixed",
    zIndex: 9999,
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "rgba(15,23,42,.5)",
    backdropFilter: "blur(4px)",
  },
  manualModalCard: {
    width: "min(100%,680px)",
    maxHeight: "90vh",
    overflowY: "auto",
    borderRadius: 22,
    padding: 22,
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 28px 80px rgba(15,23,42,.24)",
  },
  manualModalTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  manualKicker: {
    color: "#14843f",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: ".12em",
    marginBottom: 5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#475569",
    fontSize: 22,
    cursor: "pointer",
  },
  manualField: {
    display: "grid",
    gap: 7,
    marginTop: 14,
    color: "#334155",
    fontSize: 12,
    fontWeight: 950,
  },
  manualHelp: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 650,
  },
  analyzeButton: {
    width: "100%",
    marginTop: 14,
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    padding: "11px 14px",
    background: "#f0fdf4",
    color: "#166534",
    fontWeight: 950,
    cursor: "pointer",
  },
  previewBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  previewMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
    marginBottom: 10,
  },
  previewList: {
    display: "grid",
    gap: 6,
  },
  previewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    padding: "9px 10px",
    fontSize: 11,
  },
  previewRowValid: {
    background: "#f0fdf4",
    color: "#166534",
  },
  previewRowInvalid: {
    background: "#fff7ed",
    color: "#9a3412",
  },
  previewMore: {
    textAlign: "center",
    padding: 8,
    color: "#64748b",
    fontSize: 11,
    fontWeight: 800,
  },
  modalCard: {
    width: "min(100%,460px)",
    borderRadius: 22,
    padding: 22,
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 28px 80px rgba(15,23,42,.24)",
  },
  modalTitle: {
    margin: 0,
    fontSize: 21,
    fontWeight: 950,
    color: "#0f172a",
  },
  modalText: {
    margin: "8px 0 16px",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  modalInput: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #dbe3ef",
    borderRadius: 13,
    padding: "12px 13px",
    outline: "none",
    font: "inherit",
    fontWeight: 800,
  },
  modalActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 9,
    marginTop: 16,
  },
  modalSecondary: {
    border: "1px solid #dbe3ef",
    borderRadius: 12,
    padding: "10px 12px",
    background: "#fff",
    color: "#475569",
    fontWeight: 950,
    cursor: "pointer",
  },
  modalPrimary: {
    border: 0,
    borderRadius: 12,
    padding: "10px 12px",
    background: "#14843f",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
  modalDanger: {
    border: 0,
    borderRadius: 12,
    padding: "10px 12px",
    background: "#b91c1c",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
  deleteName: {
    padding: 12,
    borderRadius: 12,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontWeight: 950,
  },
  openLink: {
    display: "block",
    textAlign: "center",
    textDecoration: "none",
    padding: "11px 14px",
    borderRadius: 12,
    color: "#fff",
    background: "#14843f",
    fontWeight: 950,
  },
  empty: {
    minHeight: 180,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    textAlign: "center",
    color: "#64748b",
    fontWeight: 700,
  },
};
