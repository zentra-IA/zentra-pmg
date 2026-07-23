"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type UploadResponse = {
  success: boolean;
  jobId: string;
  snapshotId: string;
  status: string;
  fileName: string;
  message?: string;
};

type StatusResponse = {
  success: boolean;
  job: {
    id: string;
    fileName: string | null;
    snapshotId: string | null;
    storagePath: string | null;
    status: string;
    normalizedStatus: string;
    totalRows: number;
    processedRows: number;
    validRows: number;
    created: number;
    updated: number;
    removed: number;
    duplicated: number;
    invalidPhone: number;
    invalid: number;
    errorCount: number;
    progressPercent: number;
    attempts: number;
    maxAttempts: number;
    requiresConfirmation: boolean;
    confirmationReason: string | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  snapshot: {
    id: string;
    fileName: string;
    status: string;
    normalizedStatus: string;
    isCurrent: boolean;
    totalRows: number;
    processedRows: number;
    validRows: number;
    created: number;
    updated: number;
    removed: number;
    duplicated: number;
    invalidPhone: number;
    invalid: number;
    errorCount: number;
    progressPercent: number;
    requiresConfirmation: boolean;
    confirmationReason: string | null;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  state: {
    isCompleted: boolean;
    isFailed: boolean;
    isProcessing: boolean;
    isWaitingConfirmation: boolean;
    progressPercent: number;
    canPoll: boolean;
  };
};

const STORAGE_KEY = "radar-v2-current-job-id";
const POLL_INTERVAL_MS = 2500;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function getStatusLabel(status: string | undefined): string {
  switch (String(status || "").toUpperCase()) {
    case "PENDING":
      return "Aguardando processamento";
    case "PROCESSING":
      return "Processando";
    case "COMPLETED":
      return "Importação concluída";
    case "FAILED":
      return "Falha no processamento";
    default:
      return status || "Aguardando";
  }
}

function getStatusStyles(status: string | undefined) {
  switch (String(status || "").toUpperCase()) {
    case "COMPLETED":
      return {
        background: "#dcfce7",
        color: "#166534",
        borderColor: "#86efac",
      };
    case "FAILED":
      return {
        background: "#fee2e2",
        color: "#991b1b",
        borderColor: "#fca5a5",
      };
    case "PROCESSING":
      return {
        background: "#dbeafe",
        color: "#1d4ed8",
        borderColor: "#93c5fd",
      };
    default:
      return {
        background: "#fef3c7",
        color: "#92400e",
        borderColor: "#fcd34d",
      };
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: unknown }).error || "")
        : "";

    throw new Error(message || `Erro HTTP ${response.status}.`);
  }

  return data as T;
}

export default function RadarUploadV2Page() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestInFlightRef = useRef(false);

  const normalizedStatus =
    statusData?.job.normalizedStatus ||
    statusData?.job.status ||
    "";

  const progress = Math.max(
    0,
    Math.min(100, Number(statusData?.state.progressPercent || 0))
  );

  const statusStyles = useMemo(
    () => getStatusStyles(normalizedStatus),
    [normalizedStatus]
  );

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function fetchStatus(targetJobId: string, silent = false) {
    if (!targetJobId || requestInFlightRef.current) return;

    requestInFlightRef.current = true;

    if (!silent) {
      setCheckingStatus(true);
    }

    try {
      const response = await fetch(
        `/api/radar/import-v2/status?jobId=${encodeURIComponent(targetJobId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await readJson<StatusResponse>(response);

      setStatusData(data);
      setError("");

      if (
        data.state.isCompleted ||
        data.state.isFailed ||
        data.state.isWaitingConfirmation ||
        !data.state.canPoll
      ) {
        stopPolling();

        if (data.state.isCompleted) {
          setMessage("Importação concluída e snapshot ativado.");
          localStorage.removeItem(STORAGE_KEY);
        } else if (data.state.isFailed) {
          setError(
            data.job.error ||
              data.snapshot?.error ||
              "A importação falhou."
          );
        } else if (data.state.isWaitingConfirmation) {
          setMessage(
            data.job.confirmationReason ||
              data.snapshot?.confirmationReason ||
              "A importação aguarda confirmação administrativa."
          );
        }
      }
    } catch (statusError) {
      if (!silent) {
        setError(
          statusError instanceof Error
            ? statusError.message
            : "Não foi possível consultar o andamento."
        );
      }
    } finally {
      requestInFlightRef.current = false;

      if (!silent) {
        setCheckingStatus(false);
      }
    }
  }

  function startPolling(targetJobId: string) {
    stopPolling();

    void fetchStatus(targetJobId);

    pollingRef.current = setInterval(() => {
      void fetchStatus(targetJobId, true);
    }, POLL_INTERVAL_MS);
  }

  useEffect(() => {
    const savedJobId = localStorage.getItem(STORAGE_KEY);

    if (savedJobId) {
      setJobId(savedJobId);
      startPolling(savedJobId);
    }

    return () => {
      stopPolling();
    };
    // Executa uma única vez ao abrir a página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;

    setError("");
    setMessage("");
    setStatusData(null);
    setFile(selectedFile);

    if (!selectedFile) return;

    const extension = selectedFile.name.toLowerCase();

    if (!extension.endsWith(".xlsx") && !extension.endsWith(".xls")) {
      setFile(null);
      event.target.value = "";
      setError("Selecione um arquivo .xlsx ou .xls.");
      return;
    }

    if (selectedFile.size <= 0) {
      setFile(null);
      event.target.value = "";
      setError("O arquivo está vazio.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      event.target.value = "";
      setError("O arquivo ultrapassa o limite de 100 MB.");
    }
  }

  async function handleUpload() {
    if (!file || uploading) return;

    stopPolling();
    setUploading(true);
    setError("");
    setMessage("");
    setStatusData(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/radar/import-v2", {
        method: "POST",
        body: formData,
      });

      const data = await readJson<UploadResponse>(response);

      setJobId(data.jobId);
      localStorage.setItem(STORAGE_KEY, data.jobId);

      setMessage(
        data.message || "Arquivo recebido e aguardando processamento."
      );

      startPolling(data.jobId);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Erro inesperado ao enviar a planilha."
      );
    } finally {
      setUploading(false);
    }
  }

  function clearCurrentJob() {
    stopPolling();
    localStorage.removeItem(STORAGE_KEY);

    setJobId("");
    setStatusData(null);
    setMessage("");
    setError("");
    setFile(null);
  }

  const metricCards = [
    {
      label: "Total de linhas",
      value: statusData?.job.totalRows,
    },
    {
      label: "Processadas",
      value: statusData?.job.processedRows,
    },
    {
      label: "Válidas",
      value: statusData?.job.validRows,
    },
    {
      label: "Criadas",
      value: statusData?.job.created,
    },
    {
      label: "Atualizadas",
      value: statusData?.job.updated,
    },
    {
      label: "Removidas",
      value: statusData?.job.removed,
    },
    {
      label: "Duplicadas",
      value: statusData?.job.duplicated,
    },
    {
      label: "Inválidas",
      value: statusData?.job.invalid,
    },
  ];

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <span style={styles.eyebrow}>ZENTRA SALES AI</span>
            <h1 style={styles.title}>Importação do Radar</h1>
            <p style={styles.subtitle}>
              Envie a planilha de clientes. O arquivo será processado em
              segundo plano e o snapshot só será ativado após todas as
              validações.
            </p>
          </div>

          <a href="/crm/dashboard/radar" style={styles.backLink}>
            Voltar ao Radar
          </a>
        </header>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Nova importação</h2>

          <div style={styles.fileArea}>
            <input
              id="radar-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={uploading}
              style={styles.fileInput}
            />

            <label htmlFor="radar-file" style={styles.fileLabel}>
              {file ? file.name : "Selecionar planilha"}
            </label>

            <span style={styles.fileHelp}>
              Formatos aceitos: XLSX ou XLS. Limite máximo: 100 MB.
            </span>
          </div>

          <div style={styles.actions}>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{
                ...styles.primaryButton,
                opacity: !file || uploading ? 0.55 : 1,
                cursor: !file || uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? "Enviando arquivo..." : "Iniciar importação"}
            </button>

            {jobId && (
              <button
                type="button"
                onClick={() => fetchStatus(jobId)}
                disabled={checkingStatus}
                style={styles.secondaryButton}
              >
                {checkingStatus ? "Atualizando..." : "Atualizar status"}
              </button>
            )}

            {(jobId || statusData) && (
              <button
                type="button"
                onClick={clearCurrentJob}
                style={styles.linkButton}
              >
                Limpar acompanhamento
              </button>
            )}
          </div>
        </section>

        {(message || error) && (
          <section
            style={{
              ...styles.alert,
              ...(error ? styles.errorAlert : styles.successAlert),
            }}
          >
            {error || message}
          </section>
        )}

        {jobId && (
          <section style={styles.card}>
            <div style={styles.statusHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Andamento</h2>
                <p style={styles.jobId}>Job: {jobId}</p>
              </div>

              <span
                style={{
                  ...styles.statusBadge,
                  ...statusStyles,
                }}
              >
                {getStatusLabel(normalizedStatus || "PENDING")}
              </span>
            </div>

            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressBar,
                  width: `${progress}%`,
                }}
              />
            </div>

            <div style={styles.progressText}>
              <strong>{progress.toFixed(0)}%</strong>
              <span>
                {formatNumber(statusData?.job.processedRows)} de{" "}
                {formatNumber(statusData?.job.totalRows)} linhas
              </span>
            </div>

            {statusData && (
              <>
                <div style={styles.metricsGrid}>
                  {metricCards.map((metric) => (
                    <article key={metric.label} style={styles.metricCard}>
                      <span style={styles.metricLabel}>{metric.label}</span>
                      <strong style={styles.metricValue}>
                        {formatNumber(metric.value)}
                      </strong>
                    </article>
                  ))}
                </div>

                <div style={styles.detailsGrid}>
                  <div>
                    <span style={styles.detailLabel}>Arquivo</span>
                    <strong style={styles.detailValue}>
                      {statusData.job.fileName || "-"}
                    </strong>
                  </div>

                  <div>
                    <span style={styles.detailLabel}>Snapshot</span>
                    <strong style={styles.detailValue}>
                      {statusData.job.snapshotId || "-"}
                    </strong>
                  </div>

                  <div>
                    <span style={styles.detailLabel}>Início</span>
                    <strong style={styles.detailValue}>
                      {formatDateTime(statusData.job.startedAt)}
                    </strong>
                  </div>

                  <div>
                    <span style={styles.detailLabel}>Conclusão</span>
                    <strong style={styles.detailValue}>
                      {formatDateTime(statusData.job.finishedAt)}
                    </strong>
                  </div>

                  <div>
                    <span style={styles.detailLabel}>Snapshot atual</span>
                    <strong style={styles.detailValue}>
                      {statusData.snapshot?.isCurrent ? "Sim" : "Não"}
                    </strong>
                  </div>

                  <div>
                    <span style={styles.detailLabel}>Tentativas</span>
                    <strong style={styles.detailValue}>
                      {statusData.job.attempts} de{" "}
                      {statusData.job.maxAttempts}
                    </strong>
                  </div>
                </div>
              </>
            )}

            {!statusData && (
              <p style={styles.waitingText}>
                Aguardando a primeira atualização do job.
              </p>
            )}
          </section>
        )}

        <section style={styles.notice}>
          <strong>Importante:</strong> esta tela cria o job e acompanha o
          andamento. Enquanto o worker ainda estiver em execução manual,
          jobs novos permanecerão em “Aguardando processamento” até o worker
          ser iniciado.
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "32px 20px 64px",
    background:
      "linear-gradient(135deg, rgba(236,253,245,0.95), rgba(248,250,252,0.98))",
    color: "#172033",
  },

  container: {
    width: "100%",
    maxWidth: 1120,
    margin: "0 auto",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 24,
  },

  eyebrow: {
    display: "block",
    marginBottom: 8,
    color: "#15803d",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.14em",
  },

  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.15,
  },

  subtitle: {
    maxWidth: 760,
    margin: "10px 0 0",
    color: "#64748b",
    fontSize: 15,
    lineHeight: 1.6,
  },

  backLink: {
    flexShrink: 0,
    padding: "11px 16px",
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    background: "#ffffff",
    color: "#15803d",
    fontWeight: 800,
    textDecoration: "none",
  },

  card: {
    marginBottom: 20,
    padding: 24,
    border: "1px solid #dbe5df",
    borderRadius: 20,
    background: "rgba(255,255,255,0.96)",
    boxShadow: "0 12px 35px rgba(15, 23, 42, 0.06)",
  },

  sectionTitle: {
    margin: 0,
    fontSize: 20,
  },

  fileArea: {
    display: "grid",
    gap: 10,
    marginTop: 20,
  },

  fileInput: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none",
  },

  fileLabel: {
    display: "flex",
    alignItems: "center",
    minHeight: 64,
    padding: "0 18px",
    border: "2px dashed #86efac",
    borderRadius: 14,
    background: "#f0fdf4",
    color: "#166534",
    fontWeight: 800,
    cursor: "pointer",
  },

  fileHelp: {
    color: "#64748b",
    fontSize: 13,
  },

  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 20,
  },

  primaryButton: {
    padding: "12px 18px",
    border: 0,
    borderRadius: 12,
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: 800,
  },

  secondaryButton: {
    padding: "12px 18px",
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    background: "#ffffff",
    color: "#15803d",
    fontWeight: 800,
    cursor: "pointer",
  },

  linkButton: {
    padding: "12px 8px",
    border: 0,
    background: "transparent",
    color: "#64748b",
    fontWeight: 700,
    cursor: "pointer",
  },

  alert: {
    marginBottom: 20,
    padding: "14px 18px",
    border: "1px solid",
    borderRadius: 14,
    fontWeight: 700,
  },

  successAlert: {
    borderColor: "#86efac",
    background: "#dcfce7",
    color: "#166534",
  },

  errorAlert: {
    borderColor: "#fca5a5",
    background: "#fee2e2",
    color: "#991b1b",
  },

  statusHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  jobId: {
    margin: "7px 0 0",
    color: "#64748b",
    fontSize: 13,
    wordBreak: "break-all",
  },

  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    border: "1px solid",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
  },

  progressTrack: {
    height: 14,
    marginTop: 24,
    overflow: "hidden",
    borderRadius: 999,
    background: "#e2e8f0",
  },

  progressBar: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #16a34a, #22c55e)",
    transition: "width 300ms ease",
  },

  progressText: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 10,
    color: "#475569",
    fontSize: 14,
  },

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginTop: 24,
  },

  metricCard: {
    padding: 16,
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#f8fafc",
  },

  metricLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
  },

  metricValue: {
    display: "block",
    marginTop: 6,
    fontSize: 24,
  },

  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginTop: 24,
    paddingTop: 20,
    borderTop: "1px solid #e2e8f0",
  },

  detailLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
  },

  detailValue: {
    display: "block",
    marginTop: 5,
    fontSize: 14,
    wordBreak: "break-word",
  },

  waitingText: {
    margin: "20px 0 0",
    color: "#64748b",
  },

  notice: {
    padding: "15px 18px",
    border: "1px solid #bfdbfe",
    borderRadius: 14,
    background: "#eff6ff",
    color: "#1e40af",
    fontSize: 13,
    lineHeight: 1.55,
  },
};
