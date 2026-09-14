"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SearchPlace = {
  id: string;
  source?: string;
  cnpj?: string;
  name: string;
  address: string;
  primaryType: string | null;
  segmentTags?: string[];
  phone?: string | null;
  phoneDigits?: string | null;
  phoneType?: "mobile" | "mobile_candidate" | "landline" | "unknown";
  whatsapp?: string | null;
  whatsappOperational?: string | null;
  whatsappSuggested?: string | null;
  whatsappSuggestedDisplay?: string | null;
  whatsappNeedsConfirmation?: boolean;
  whatsappNeedsValidation?: boolean;
  email?: string | null;
  leadScore?: number;
  scoreReasons?: string[];
  startDate?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  cnae?: string | null;
  sourceMonth?: string | null;
  mapsUri: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Lead = {
  id: string;
  seller_id: string;
  status: string;
  priority: string;
  company_name: string;
  owner_name: string | null;
  buyer_name: string | null;
  phone: string | null;
  phoneType?: "mobile" | "mobile_candidate" | "landline" | "unknown";
  whatsapp: string | null;
  whatsappOperational?: string | null;
  whatsappSuggested?: string | null;
  whatsappNeedsConfirmation?: boolean;
  whatsappNeedsValidation?: boolean;
  whatsapp_link: string | null;
  email: string | null;
  cnpj: string | null;
  site: string | null;
  address: string | null;
  notes: string | null;
  next_action_at: string | null;
  last_contact_at: string | null;
  claimed_at: string;
  converted_at: string | null;
  converted_customer_id: string | null;
  created_at: string;
  updated_at: string;
  source: string;
  segment: string | null;
  city: string | null;
  region: string | null;
  source_external_id?: string | null;
  google_place_id: string | null;
  google_maps: string | null;
  google_business_status: string | null;
  google_live: boolean;
};

type LeadForm = {
  company_name: string;
  owner_name: string;
  buyer_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  cnpj: string;
  site: string;
  address: string;
  notes: string;
  next_action_at: string;
  priority: string;
  status: string;
};

const SEGMENTOS = [
  "Pizzaria",
  "Hamburgueria",
  "Restaurante",
  "Lanchonete",
  "Marmitaria",
  "Padaria",
  "Confeitaria",
  "Açougue",
  "Peixaria",
  "Supermercado",
  "Mercado",
  "Minimercado",
  "Mercearia",
  "Bar",
  "Cafeteria",
  "Buffet",
  "Conveniência",
];

const STATUS: Record<
  string,
  { label: string; short: string; tone: string }
> = {
  novo: {
    label: "Novo",
    short: "Novo",
    tone: "blue",
  },
  contato_realizado: {
    label: "Contato realizado",
    short: "Contato",
    tone: "indigo",
  },
  interessado: {
    label: "Interessado",
    short: "Interessado",
    tone: "green",
  },
  cotacao: {
    label: "Cotação enviada",
    short: "Cotação",
    tone: "amber",
  },
  negociacao: {
    label: "Negociação",
    short: "Negociação",
    tone: "orange",
  },
  convertido: {
    label: "Convertido",
    short: "Convertido",
    tone: "emerald",
  },
  sem_resposta: {
    label: "Sem resposta",
    short: "Sem resposta",
    tone: "gray",
  },
  retornar_depois: {
    label: "Retornar depois",
    short: "Retornar",
    tone: "violet",
  },
  sem_interesse: {
    label: "Sem interesse",
    short: "Sem interesse",
    tone: "slate",
  },
  descartado: {
    label: "Descartado",
    short: "Descartado",
    tone: "red",
  },
};

const KANBAN = [
  "novo",
  "contato_realizado",
  "interessado",
  "cotacao",
  "negociacao",
  "convertido",
] as const;

function safeText(value?: string | null) {
  return String(value || "").trim();
}

function onlyDigits(value?: string | null) {
  return safeText(value).replace(/\D/g, "");
}

function whatsappDigits(value?: string | null) {
  const raw = onlyDigits(value);

  if (!raw) return "";
  if (raw.startsWith("55") && raw.length >= 12) return raw;
  if (raw.length === 10 || raw.length === 11) return `55${raw}`;

  return raw;
}

function formatPhoneForDisplay(value?: string | null) {
  let raw = onlyDigits(value);

  if (
    raw.startsWith("55") &&
    (raw.length === 12 || raw.length === 13)
  ) {
    raw = raw.slice(2);
  }

  if (raw.length === 11) {
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  }

  if (raw.length === 10) {
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
  }

  return safeText(value) || "—";
}

function operationalWhatsapp(input: {
  phone?: string | null;
  whatsapp?: string | null;
  whatsappOperational?: string | null;
  whatsappSuggested?: string | null;
  phoneType?: "mobile" | "mobile_candidate" | "landline" | "unknown";
}) {
  if (input.phoneType === "landline" || input.phoneType === "unknown") {
    return "";
  }

  return whatsappDigits(
    input.whatsappOperational ||
      input.whatsappSuggested ||
      input.whatsapp ||
      input.phone
  );
}

function scoreLabel(score?: number) {
  const value = Number(score || 0);

  if (value >= 85) return "Alta prioridade";
  if (value >= 70) return "Boa oportunidade";
  if (value >= 50) return "Oportunidade";
  return "Cadastro básico";
}

function phoneTypeLabel(
  type?: "mobile" | "mobile_candidate" | "landline" | "unknown"
) {
  if (type === "mobile") return "WhatsApp pronto";
  if (type === "mobile_candidate") return "Celular antigo provável";
  if (type === "landline") return "Telefone fixo";
  return "Telefone a revisar";
}

function phoneTypeClass(
  type?: "mobile" | "mobile_candidate" | "landline" | "unknown"
) {
  if (type === "mobile") return "is-mobile";
  if (type === "mobile_candidate") return "is-candidate";
  if (type === "landline") return "is-landline";
  return "is-unknown";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLeadForm(lead: Lead): LeadForm {
  return {
    company_name: safeText(lead.company_name),
    owner_name: safeText(lead.owner_name),
    buyer_name: safeText(lead.buyer_name),
    phone: safeText(lead.phone),
    whatsapp: safeText(lead.whatsapp),
    email: safeText(lead.email),
    cnpj: safeText(lead.cnpj),
    site: safeText(lead.site),
    address: safeText(lead.address),
    notes: safeText(lead.notes),
    next_action_at: toLocalDateTime(lead.next_action_at),
    priority: safeText(lead.priority) || "media",
    status: safeText(lead.status) || "novo",
  };
}

export default function ProspeccaoPage() {
  const [activeTab, setActiveTab] = useState<"buscar" | "meus">("buscar");
  const [view, setView] = useState<"cards" | "list" | "kanban">("cards");

  const [segment, setSegment] = useState("Pizzaria");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("all");
  const [hasEmail, setHasEmail] = useState(false);
  const [hasTradeName, setHasTradeName] = useState(false);
  const [cnaeMain, setCnaeMain] = useState("");
  const [companyAge, setCompanyAge] = useState("all");
  const [sortMode, setSortMode] = useState<
    "score" | "name" | "newest" | "oldest"
  >("score");
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [hiddenReserved, setHiddenReserved] = useState(0);
  const [hiddenCustomers, setHiddenCustomers] = useState(0);
  const [hiddenByFilters, setHiddenByFilters] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [lastQuery, setLastQuery] = useState("");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<"seller" | "management">("seller");
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [queryFilter, setQueryFilter] = useState("");

  const [claiming, setClaiming] = useState<string | null>(null);
  const [selectedSearchIds, setSelectedSearchIds] = useState<string[]>([]);
  const [bulkClaiming, setBulkClaiming] = useState(false);
  const [bulkClaimProgress, setBulkClaimProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkBusy, setBulkBusy] = useState<
    "messages" | "dialer" | "status" | null
  >(null);

  const loadLeads = useCallback(async () => {
    setLeadLoading(true);
    setLeadError("");

    try {
      const response = await fetch("/api/crm/prospecting/leads", {
        cache: "no-store",
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao carregar prospects.");
      }

      setLeads(Array.isArray(payload?.leads) ? payload.leads : []);
      setStats(payload?.stats || {});
      setTotal(Number(payload?.total || 0));
      setScope(payload?.scope === "management" ? "management" : "seller");
    } catch (error: any) {
      setLeadError(error?.message || "Falha ao carregar prospects.");
    } finally {
      setLeadLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  async function search(next = false) {
    if (!segment.trim() || !city.trim()) {
      setSearchError("Informe segmento e cidade.");
      return;
    }

    setSearchLoading(true);
    setSearchError("");

    try {
      const response = await fetch("/api/crm/prospecting/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          segment,
          city,
          region,
          phoneFilter,
          hasEmail,
          hasTradeName,
          cnaeMain,
          companyAge,
          pageSize: 20,
          pageToken: next ? pageToken : null,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao buscar empresas.");
      }

      const incoming = Array.isArray(payload?.results)
        ? payload.results
        : [];

      setResults((current) =>
        next
          ? [
              ...current,
              ...incoming.filter(
                (item: SearchPlace) =>
                  !current.some((old) => old.id === item.id)
              ),
            ]
          : incoming
      );

      if (!next) {
        setSelectedSearchIds([]);
      }

      setHiddenReserved(Number(payload?.hiddenReserved || 0));
      setHiddenCustomers(Number(payload?.hiddenCustomers || 0));
      setHiddenByFilters(Number(payload?.hiddenByFilters || 0));
      setPageToken(payload?.nextPageToken || null);
      setLastQuery(payload?.query || "");
    } catch (error: any) {
      setSearchError(error?.message || "Falha ao buscar empresas.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function claim(place: SearchPlace) {
    setClaiming(place.id);
    setSearchError("");

    try {
      const response = await fetch("/api/crm/prospecting/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId: place.id,
          segment,
          city,
          region,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao assumir prospect.");
      }

      setResults((current) =>
        current.filter((item) => item.id !== place.id)
      );

      await loadLeads();
      setActiveTab("meus");
    } catch (error: any) {
      setSearchError(error?.message || "Falha ao assumir prospect.");
    } finally {
      setClaiming(null);
    }
  }


  function toggleSearchSelection(id: string) {
    setSelectedSearchIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleAllSearchResults() {
    const loadedIds = results.map((item) => item.id);

    if (!loadedIds.length) {
      return;
    }

    const allSelected = loadedIds.every((id) =>
      selectedSearchIds.includes(id)
    );

    if (allSelected) {
      setSelectedSearchIds((current) =>
        current.filter((id) => !loadedIds.includes(id))
      );
      return;
    }

    setSelectedSearchIds((current) => [
      ...new Set([...current, ...loadedIds]),
    ]);
  }

  async function claimSelectedSearchResults() {
    if (bulkClaiming) return;

    const chosen = results.filter((place) =>
      selectedSearchIds.includes(place.id)
    );

    if (!chosen.length) {
      window.alert("Selecione pelo menos uma empresa para assumir.");
      return;
    }

    if (
      chosen.length > 50 &&
      !window.confirm(
        `Você selecionou ${chosen.length} empresas.\n\n` +
          "Deseja realmente assumir todos esses leads para a sua carteira?"
      )
    ) {
      return;
    }

    setBulkClaiming(true);
    setBulkClaimProgress({
      completed: 0,
      total: chosen.length,
    });
    setSearchError("");

    const claimedIds: string[] = [];
    const unavailable: string[] = [];
    const errors: string[] = [];

    try {
      for (let index = 0; index < chosen.length; index += 1) {
        const place = chosen[index];

        try {
          const response = await fetch(
            "/api/crm/prospecting/claim",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sourceId: place.id,
                segment,
                city,
                region,
              }),
            }
          );

          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            if (response.status === 409 || response.status === 404) {
              unavailable.push(
                `${place.name}: ${
                  payload?.error || "não está mais disponível"
                }`
              );
            } else {
              errors.push(
                `${place.name}: ${
                  payload?.error || "falha ao assumir"
                }`
              );
            }
          } else {
            claimedIds.push(place.id);
          }
        } catch (error: any) {
          errors.push(
            `${place.name}: ${
              error?.message || "falha de conexão"
            }`
          );
        }

        setBulkClaimProgress({
          completed: index + 1,
          total: chosen.length,
        });
      }

      if (claimedIds.length) {
        const claimedSet = new Set(claimedIds);

        setResults((current) =>
          current.filter((item) => !claimedSet.has(item.id))
        );

        setSelectedSearchIds((current) =>
          current.filter((id) => !claimedSet.has(id))
        );

        await loadLeads();
      }

      const summary = [
        `✅ ${claimedIds.length} lead(s) assumido(s).`,
        unavailable.length
          ? `⚠ ${unavailable.length} já estavam indisponíveis, reservados ou eram clientes.`
          : "",
        errors.length
          ? `❌ ${errors.length} apresentaram erro.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      window.alert(summary);
    } finally {
      setBulkClaiming(false);
      setBulkClaimProgress({
        completed: 0,
        total: 0,
      });
    }
  }

  async function patchLead(
    id: string,
    data: Record<string, unknown>,
    quiet = false
  ) {
    const old = leads;

    setLeads((current) =>
      current.map((lead) =>
        lead.id === id
          ? {
              ...lead,
              ...data,
            }
          : lead
      )
    );

    try {
      const response = await fetch("/api/crm/prospecting/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          ...data,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao atualizar.");
      }

      if (!quiet) {
        await loadLeads();
      }

      return true;
    } catch (error: any) {
      setLeads(old);
      window.alert(error?.message || "Falha ao atualizar prospect.");
      return false;
    }
  }

  function openEdit(lead: Lead) {
    setEditing(lead);
    setForm(toLeadForm(lead));
  }

  async function saveEdit() {
    if (!editing || !form) return;

    setSaving(true);

    try {
      const response = await fetch("/api/crm/prospecting/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editing.id,
          ...form,
          next_action_at: form.next_action_at
            ? new Date(form.next_action_at).toISOString()
            : "",
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao salvar.");
      }

      setEditing(null);
      setForm(null);
      await loadLeads();
    } catch (error: any) {
      window.alert(error?.message || "Falha ao salvar prospect.");
    } finally {
      setSaving(false);
    }
  }

  function toggleLeadSelection(id: string) {
    setSelectedLeadIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function clearLeadSelection() {
    setSelectedLeadIds([]);
  }

  async function copyPhone(value?: string | null) {
    const text = safeText(value);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copie o telefone:", text);
    }
  }

  async function copySelectedNameAndPhone() {
    const chosen = visibleLeads.filter((lead) =>
      selectedLeadIds.includes(lead.id)
    );

    if (!chosen.length) {
      window.alert("Selecione pelo menos um prospect.");
      return;
    }

    const rows = chosen
      .map((lead) => {
        const number =
          operationalWhatsapp({
            phone: lead.phone,
            whatsapp: lead.whatsapp,
            whatsappOperational: lead.whatsappOperational,
            whatsappSuggested: lead.whatsappSuggested,
            phoneType: lead.phoneType,
          }) ||
          whatsappDigits(lead.whatsapp) ||
          onlyDigits(lead.phone);

        if (!number) return null;

        /*
         * Para celular antigo provável, prioriza o WhatsApp operacional
         * com +9. Para os demais, preserva o melhor número disponível.
         * O DDI 55 é removido para ficar no formato Nome, Número.
         */
        const nationalNumber =
          number.startsWith("55") && number.length >= 12
            ? number.slice(2)
            : number;

        return `${safeText(lead.company_name) || "Contato"}, ${nationalNumber}`;
      })
      .filter((row): row is string => Boolean(row));

    if (!rows.length) {
      window.alert(
        "Nenhum dos contatos selecionados possui telefone para copiar."
      );
      return;
    }

    const content = rows.join("\n");

    try {
      await navigator.clipboard.writeText(content);
      window.alert(
        `${rows.length} contato(s) copiado(s) no formato Nome, Número.`
      );
    } catch {
      window.prompt("Copie os contatos:", content);
    }
  }

  async function applyBulkLeadStatus() {
    const chosen = visibleLeads.filter((lead) =>
      selectedLeadIds.includes(lead.id)
    );

    if (!chosen.length) {
      window.alert("Selecione pelo menos um prospect.");
      return;
    }

    if (!bulkStatus || !STATUS[bulkStatus]) {
      window.alert("Escolha o status para mover os contatos.");
      return;
    }

    const targetLabel = STATUS[bulkStatus].label;

    if (
      !window.confirm(
        `Mover ${chosen.length} contato(s) para "${targetLabel}"?`
      )
    ) {
      return;
    }

    setBulkBusy("status");

    let updated = 0;
    const failedIds: string[] = [];
    const errors: string[] = [];

    try {
      const batchSize = 8;

      for (let index = 0; index < chosen.length; index += batchSize) {
        const batch = chosen.slice(index, index + batchSize);

        const settled = await Promise.allSettled(
          batch.map(async (lead) => {
            const response = await fetch(
              "/api/crm/prospecting/leads",
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  id: lead.id,
                  status: bulkStatus,
                }),
              }
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
              throw new Error(
                payload?.error || "Falha ao atualizar prospect."
              );
            }

            return lead.id;
          })
        );

        settled.forEach((result, resultIndex) => {
          const lead = batch[resultIndex];

          if (result.status === "fulfilled") {
            updated += 1;
            return;
          }

          failedIds.push(lead.id);
          errors.push(
            `${lead.company_name}: ${
              result.reason instanceof Error
                ? result.reason.message
                : "falha ao atualizar"
            }`
          );
        });
      }

      await loadLeads();

      if (!failedIds.length) {
        setSelectedLeadIds([]);
        setBulkStatus("");
        window.alert(
          `✅ ${updated} contato(s) movido(s) para "${targetLabel}".`
        );
        return;
      }

      setSelectedLeadIds(failedIds);

      window.alert(
        [
          `✅ ${updated} contato(s) atualizado(s).`,
          `❌ ${failedIds.length} contato(s) apresentaram erro.`,
          ...errors.slice(0, 5),
        ].join("\n")
      );
    } finally {
      setBulkBusy(null);
    }
  }

  function openWhatsapp(input: {
    phone?: string | null;
    whatsapp?: string | null;
    whatsappOperational?: string | null;
    whatsappSuggested?: string | null;
    phoneType?: "mobile" | "mobile_candidate" | "landline" | "unknown";
  }) {
    const target = operationalWhatsapp(input);

    if (!target) {
      window.alert(
        input.phoneType === "landline"
          ? "Este número foi classificado como telefone fixo e não será enviado ao WhatsApp."
          : "Este telefone precisa ser revisado antes de abrir no WhatsApp."
      );
      return;
    }

    window.open(
      `https://wa.me/${target}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function sendSelectedToMessages() {
    const chosen = leads.filter((lead) =>
      selectedLeadIds.includes(lead.id)
    );

    if (!chosen.length) {
      window.alert("Selecione pelo menos um prospect.");
      return;
    }

    const eligible = chosen.filter((lead) =>
      Boolean(
        operationalWhatsapp({
          phone: lead.phone,
          whatsapp: lead.whatsapp,
          whatsappOperational: lead.whatsappOperational,
          whatsappSuggested: lead.whatsappSuggested,
          phoneType: lead.phoneType,
        })
      )
    );

    const blocked = chosen.length - eligible.length;

    if (!eligible.length) {
      window.alert(
        "Nenhum dos contatos selecionados possui celular utilizável para o disparador."
      );
      return;
    }

    setBulkBusy("messages");

    const createdIds: string[] = [];
    const conflicts: string[] = [];
    const errors: string[] = [];

    try {
      for (const lead of eligible) {
        const phone = operationalWhatsapp({
          phone: lead.phone,
          whatsapp: lead.whatsapp,
          whatsappOperational: lead.whatsappOperational,
          whatsappSuggested: lead.whatsappSuggested,
          phoneType: lead.phoneType,
        });

        try {
          const response = await fetch("/api/crm/leads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              name: lead.company_name,
              phone,
              email: lead.email || null,
              external_id: lead.id,
              status: "novo",
            }),
          });

          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            if (
              response.status === 409 &&
              payload?.code === "LEAD_OWNED_BY_OTHER_SELLER"
            ) {
              conflicts.push(lead.company_name);
              continue;
            }

            throw new Error(
              payload?.error || "Falha ao preparar contato."
            );
          }

          if (payload?.lead?.id) {
            createdIds.push(String(payload.lead.id));
          }
        } catch (error: any) {
          errors.push(
            `${lead.company_name}: ${
              error?.message || "erro ao preparar"
            }`
          );
        }
      }

      if (!createdIds.length) {
        window.alert(
          [
            "Nenhum contato foi levado para Mensagens.",
            blocked
              ? `${blocked} fixo(s) ou número(s) a revisar foram ignorados.`
              : "",
            conflicts.length
              ? `${conflicts.length} pertencem a outro vendedor.`
              : "",
            errors.length
              ? `${errors.length} apresentaram erro.`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        );
        return;
      }

      if (blocked || conflicts.length || errors.length) {
        window.alert(
          [
            `✅ ${createdIds.length} contato(s) preparado(s) para Mensagens.`,
            blocked
              ? `☎ ${blocked} fixo(s) ou número(s) a revisar foram ignorados.`
              : "",
            conflicts.length
              ? `⚠ ${conflicts.length} pertencem a outro vendedor.`
              : "",
            errors.length
              ? `❌ ${errors.length} apresentaram erro.`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        );
      }

      window.sessionStorage.setItem(
        "zentra_contacts_preselect",
        JSON.stringify(createdIds)
      );

      window.location.href =
        "/crm/dashboard/contacts?from=prospecting";
    } finally {
      setBulkBusy(null);
    }
  }

  async function createDialerCampaign() {
    const chosen = leads.filter(
      (lead) =>
        selectedLeadIds.includes(lead.id) &&
        Boolean(lead.phone)
    );

    if (!chosen.length) {
      window.alert("Selecione prospects com telefone.");
      return;
    }

    if (chosen.length > 300) {
      window.alert(
        "O Discador aceita até 300 contatos por campanha."
      );
      return;
    }

    const suggestedName = [
      "Prospecção",
      segment || null,
      region || city || null,
    ]
      .filter(Boolean)
      .join(" • ");

    const name = window.prompt(
      "Nome da campanha do Discador:",
      suggestedName
    );

    if (!name?.trim()) return;

    setBulkBusy("dialer");

    try {
      const response = await fetch(
        "/api/crm/dialer/campaigns",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            name: name.trim(),
            source: "PROSPECTING",
            manualContacts: chosen.map((lead) => ({
              name: lead.company_name,
              phone: lead.phone,
              externalLeadId: lead.id,
              cnpj: lead.cnpj,
            })),
          }),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error || "Erro ao criar campanha."
        );
      }

      clearLeadSelection();
      window.location.href =
        `/crm/dashboard/dialer/${payload.campaign.id}`;
    } catch (error: any) {
      window.alert(
        error?.message || "Erro ao criar campanha."
      );
    } finally {
      setBulkBusy(null);
    }
  }

  const activePipelineCount = useMemo(
    () =>
      KANBAN.reduce(
        (sum, status) => sum + Number(stats?.[status] || 0),
        0
      ),
    [stats]
  );

  const visibleLeads = useMemo(() => {
    const q = queryFilter.trim().toLowerCase();

    return leads.filter((lead) => {
      if (statusFilter && lead.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      return [
        lead.company_name,
        lead.owner_name,
        lead.buyer_name,
        lead.phone,
        lead.whatsapp,
        lead.cnpj,
        lead.city,
        lead.region,
        lead.segment,
        lead.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, queryFilter, statusFilter]);

  const orderedResults = useMemo(() => {
    const list = [...results];

    if (sortMode === "name") {
      return list.sort((a, b) =>
        safeText(a.name).localeCompare(
          safeText(b.name),
          "pt-BR"
        )
      );
    }

    if (sortMode === "newest") {
      return list.sort(
        (a, b) =>
          new Date(b.startDate || 0).getTime() -
          new Date(a.startDate || 0).getTime()
      );
    }

    if (sortMode === "oldest") {
      return list.sort(
        (a, b) =>
          new Date(a.startDate || 0).getTime() -
          new Date(b.startDate || 0).getTime()
      );
    }

    return list.sort(
      (a, b) =>
        Number(b.leadScore || 0) -
        Number(a.leadScore || 0)
    );
  }, [results, sortMode]);

  const selectedVisibleCount = visibleLeads.filter((lead) =>
    selectedLeadIds.includes(lead.id)
  ).length;

  function toggleAllVisible() {
    const visibleIds = visibleLeads.map((lead) => lead.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedLeadIds.includes(id));

    if (allSelected) {
      setSelectedLeadIds((current) =>
        current.filter((id) => !visibleIds.includes(id))
      );
      return;
    }

    setSelectedLeadIds((current) => [
      ...new Set([...current, ...visibleIds]),
    ]);
  }

  return (
    <div className="prospecting-page">
      <section className="hero">
        <div>
          <span className="eyebrow">Aquisição de novos clientes</span>
          <h2>Prospecção</h2>
          <p>
            Encontre empresas novas, reserve o prospect para um único vendedor
            e conduza a oportunidade até a primeira venda.
          </p>
        </div>

        <div className="hero-metrics">
          <div>
            <strong>{total}</strong>
            <span>{scope === "management" ? "na operação" : "meus prospects"}</span>
          </div>
          <div>
            <strong>{activePipelineCount}</strong>
            <span>no funil ativo</span>
          </div>
          <div>
            <strong>{Number(stats?.convertido || 0)}</strong>
            <span>convertidos</span>
          </div>
        </div>
      </section>

      <div className="mobile-tabs">
        <button
          className={activeTab === "buscar" ? "active" : ""}
          onClick={() => setActiveTab("buscar")}
        >
          🔎 Buscar
        </button>
        <button
          className={activeTab === "meus" ? "active" : ""}
          onClick={() => setActiveTab("meus")}
        >
          🎯 Meus leads
        </button>
      </div>

      <section
        className={`search-shell ${activeTab !== "buscar" ? "mobile-hidden" : ""}`}
      >
        <div className="section-head">
          <div>
            <span className="section-kicker">Busca externa</span>
            <h3>Encontrar novos estabelecimentos</h3>
          </div>
          <span className="source-badge">Base CNPJ Zentra</span>
        </div>

        <div className="search-grid">
          <label>
            <span>Segmento</span>
            <input
              list="prospecting-segments"
              value={segment}
              onChange={(event) => setSegment(event.target.value)}
              placeholder="Ex: Pizzaria"
            />
            <datalist id="prospecting-segments">
              {SEGMENTOS.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>

          <label>
            <span>Cidade</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Ex: Santo André"
            />
          </label>

          <label>
            <span>Bairro / região</span>
            <input
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="Opcional"
            />
          </label>

          <button
            className="primary search-button"
            disabled={searchLoading}
            onClick={() => void search(false)}
          >
            {searchLoading ? "Buscando..." : "🔎 Buscar empresas"}
          </button>
        </div>

        <div className="smart-filters">
          <div className="smart-filter-title">
            <div>
              <span className="section-kicker">Filtros inteligentes</span>
              <strong>Refine os melhores contatos para trabalhar agora</strong>
            </div>
            <button
              type="button"
              className="filter-reset"
              onClick={() => {
                setPhoneFilter("all");
                setHasEmail(false);
                setHasTradeName(false);
                setCnaeMain("");
                setCompanyAge("all");
                setSortMode("score");
              }}
            >
              Limpar filtros
            </button>
          </div>

          <div className="smart-filter-grid">
            <label>
              <span>Tipo de telefone</span>
              <select
                value={phoneFilter}
                onChange={(event) =>
                  setPhoneFilter(event.target.value)
                }
              >
                <option value="all">Qualquer telefone</option>
                <option value="mobile">WhatsApp pronto</option>
                <option value="mobile_candidate">
                  Celular antigo provável (+9) • 6–9
                </option>
                <option value="mobile_candidate_6">
                  Antigo começando em 6 (+9)
                </option>
                <option value="mobile_candidate_7">
                  Antigo começando em 7 (+9)
                </option>
                <option value="mobile_candidate_8">
                  Antigo começando em 8 (+9)
                </option>
                <option value="mobile_candidate_9">
                  Antigo começando em 9 (+9)
                </option>
                <option value="mobile_or_candidate">
                  Celular / candidato a WhatsApp
                </option>
                <option value="landline">Telefone fixo</option>
                <option value="unknown">Telefone a revisar</option>
              </select>
            </label>

            <label>
              <span>CNAE principal</span>
              <input
                value={cnaeMain}
                onChange={(event) =>
                  setCnaeMain(
                    event.target.value.replace(/\D/g, "")
                  )
                }
                placeholder="Ex.: 5611201"
                inputMode="numeric"
              />
            </label>

            <label>
              <span>Tempo de empresa</span>
              <select
                value={companyAge}
                onChange={(event) =>
                  setCompanyAge(event.target.value)
                }
              >
                <option value="all">Qualquer tempo</option>
                <option value="up_to_1">Até 1 ano</option>
                <option value="1_3">De 1 a 3 anos</option>
                <option value="3_5">De 3 a 5 anos</option>
                <option value="5_10">De 5 a 10 anos</option>
                <option value="10_plus">10 anos ou mais</option>
              </select>
            </label>

            <label>
              <span>Ordenar resultados</span>
              <select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(
                    event.target.value as
                      | "score"
                      | "name"
                      | "newest"
                      | "oldest"
                  )
                }
              >
                <option value="score">Melhores oportunidades</option>
                <option value="name">Empresa A–Z</option>
                <option value="newest">Empresas mais novas</option>
                <option value="oldest">Empresas mais antigas</option>
              </select>
            </label>

            <label className="check-filter">
              <input
                type="checkbox"
                checked={hasEmail}
                onChange={(event) =>
                  setHasEmail(event.target.checked)
                }
              />
              <span>
                <b>Com e-mail</b>
                <small>Prioriza contatos com segundo canal.</small>
              </span>
            </label>

            <label className="check-filter">
              <input
                type="checkbox"
                checked={hasTradeName}
                onChange={(event) =>
                  setHasTradeName(event.target.checked)
                }
              />
              <span>
                <b>Com nome fantasia</b>
                <small>Evita cards identificados só pelo CNPJ.</small>
              </span>
            </label>
          </div>
        </div>

        {searchError && <div className="alert error">{searchError}</div>}

        {lastQuery && (
          <div className="search-summary">
            <span>
              Busca: <b>{lastQuery}</b>
            </span>
            {hiddenReserved > 0 && (
              <span>
                {hiddenReserved} resultado(s) já pertencem à base Zentra e
                foram ocultados.
              </span>
            )}
            {hiddenCustomers > 0 && (
              <span>
                {hiddenCustomers} empresa(s) já existem na carteira de clientes
                e foram ocultadas.
              </span>
            )}
            {hiddenByFilters > 0 && (
              <span>
                {hiddenByFilters} resultado(s) foram descartados pelos filtros
                inteligentes desta busca.
              </span>
            )}
          </div>
        )}

        {results.length > 0 && (
          <>
            <div
              className={`search-bulk-toolbar ${
                selectedSearchIds.length ? "active" : ""
              }`}
            >
              <label className="search-select-all">
                <input
                  type="checkbox"
                  checked={
                    results.length > 0 &&
                    results.every((item) =>
                      selectedSearchIds.includes(item.id)
                    )
                  }
                  onChange={toggleAllSearchResults}
                  disabled={bulkClaiming}
                />
                <span>
                  {selectedSearchIds.length
                    ? `${selectedSearchIds.length} selecionado(s) de ${results.length} carregados`
                    : `Selecionar os ${results.length} resultados carregados`}
                </span>
              </label>

              <div className="search-bulk-actions">
                <button
                  type="button"
                  className="bulk-claim-button"
                  disabled={
                    !selectedSearchIds.length ||
                    bulkClaiming
                  }
                  onClick={() =>
                    void claimSelectedSearchResults()
                  }
                >
                  {bulkClaiming
                    ? `Assumindo ${bulkClaimProgress.completed}/${bulkClaimProgress.total}...`
                    : `✓ Assumir selecionados (${selectedSearchIds.length})`}
                </button>

                {selectedSearchIds.length > 0 && (
                  <button
                    type="button"
                    className="bulk-clear-search"
                    disabled={bulkClaiming}
                    onClick={() => setSelectedSearchIds([])}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="result-grid">
              {orderedResults.map((place) => (
                <article
                  className={`result-card ${
                    selectedSearchIds.includes(place.id)
                      ? "selected"
                      : ""
                  }`}
                  key={place.id}
                >
                  <div className="result-top">
                    <label
                      className="result-card-check"
                      title="Selecionar para assumir em massa"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSearchIds.includes(place.id)}
                        onChange={() =>
                          toggleSearchSelection(place.id)
                        }
                        disabled={bulkClaiming}
                      />
                    </label>

                    <div className="business-icon">⌖</div>
                    <div>
                      <h4>{place.name || "Estabelecimento"}</h4>
                      <span className="muted">
                        {place.primaryType || segment}
                      </span>
                    </div>
                  </div>

                  <p className="address">
                    {place.address || "Endereço não informado"}
                  </p>

                  <div className="result-intelligence">
                    <span
                      className={`phone-badge ${phoneTypeClass(
                        place.phoneType
                      )}`}
                    >
                      {phoneTypeLabel(place.phoneType)}
                    </span>

                    <span
                      className="score-badge"
                      title={
                        place.scoreReasons?.length
                          ? place.scoreReasons.join(" • ")
                          : "Pontuação baseada na qualidade do cadastro."
                      }
                    >
                      🔥 {Number(place.leadScore || 0)} •{" "}
                      {scoreLabel(place.leadScore)}
                    </span>
                  </div>

                  {place.phoneType === "mobile_candidate" &&
                    place.whatsappSuggested && (
                      <div className="phone-suggestion">
                        <b>WhatsApp operacional:</b>{" "}
                        {place.whatsappSuggestedDisplay ||
                          formatPhoneForDisplay(place.whatsappSuggested)}
                        {" "}• +9 automático para WhatsApp.
                      </div>
                    )}

                  <div className="cnpj-result-meta">
                    {place.cnpj && (
                      <span>
                        <b>CNPJ</b> {place.cnpj}
                      </span>
                    )}
                    {place.phone && (
                      <span>
                        <b>Telefone</b> {place.phone}
                      </span>
                    )}
                    {place.email && (
                      <span className="wide">
                        <b>E-mail</b> {place.email}
                      </span>
                    )}
                    {place.cnae && (
                      <span>
                        <b>CNAE</b> {place.cnae}
                      </span>
                    )}
                  </div>

                  <div className="result-actions">
                    {(place.whatsapp ||
                      place.phoneType === "mobile_candidate") && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => openWhatsapp(place)}
                      >
                        {place.phoneType === "mobile_candidate"
                          ? "WhatsApp +9"
                          : "WhatsApp"}
                      </button>
                    )}

                    {place.phone && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          void copyPhone(
                            place.phoneType === "mobile_candidate"
                              ? place.whatsappOperational ||
                                  place.whatsappSuggested
                              : place.whatsappOperational ||
                                  place.whatsapp ||
                                  place.phone
                          )
                        }
                      >
                        {place.phoneType === "mobile_candidate"
                          ? "Copiar +9"
                          : "Copiar"}
                      </button>
                    )}

                    {place.phone && (
                      <a
                        href={`tel:${onlyDigits(place.phone)}`}
                        className="secondary"
                      >
                        Ligar
                      </a>
                    )}

                    <button
                      className="primary"
                      disabled={
                        claiming === place.id ||
                        bulkClaiming
                      }
                      onClick={() => void claim(place)}
                    >
                      {claiming === place.id
                        ? "Reservando..."
                        : bulkClaiming
                          ? "Processando..."
                          : "Assumir lead"}
                    </button>
                  </div>

                  <small className="claim-note">
                    Empresa ativa em SP, ramo alimentício e com telefone cadastrado.
                    Ao assumir, o contato fica reservado para sua carteira.
                  </small>
                </article>
              ))}
            </div>

            {pageToken && (
              <button
                className="load-more"
                disabled={searchLoading}
                onClick={() => void search(true)}
              >
                {searchLoading ? "Carregando..." : "Buscar mais resultados"}
              </button>
            )}
          </>
        )}

        {!searchLoading && lastQuery && results.length === 0 && (
          <div className="empty">
            <strong>Nenhum prospect novo disponível nesta página.</strong>
            <span>
              Alguns resultados podem já estar reservados na operação. Tente
              outro segmento, região ou carregue mais resultados.
            </span>
          </div>
        )}

        <div className="google-attribution">
          Fonte: <b>Dados Abertos do CNPJ / Receita Federal</b>, indexados na
          Base CNPJ Zentra. A busca mostra somente empresas de SP, ativas,
          do ramo alimentício e com telefone cadastrado.
        </div>
      </section>

      <section
        className={`crm-shell ${activeTab !== "meus" ? "mobile-hidden" : ""}`}
      >
        <div className="section-head crm-head">
          <div>
            <span className="section-kicker">Mini CRM</span>
            <h3>{scope === "management" ? "Prospecção da operação" : "Minha prospecção"}</h3>
          </div>

          <div className="view-switch">
            <button
              className={view === "cards" ? "active" : ""}
              onClick={() => setView("cards")}
            >
              Cards
            </button>
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              Lista
            </button>
            <button
              className={view === "kanban" ? "active" : ""}
              onClick={() => setView("kanban")}
            >
              Kanban
            </button>
          </div>
        </div>

        <div className="quick-stats">
          {KANBAN.map((status) => (
            <button
              key={status}
              className={statusFilter === status ? "selected" : ""}
              onClick={() =>
                setStatusFilter((current) =>
                  current === status ? "" : status
                )
              }
            >
              <span>{STATUS[status].short}</span>
              <strong>{Number(stats?.[status] || 0)}</strong>
            </button>
          ))}
        </div>

        <div className="filters">
          <input
            value={queryFilter}
            onChange={(event) => setQueryFilter(event.target.value)}
            placeholder="Buscar empresa, proprietário, comprador, telefone..."
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </select>

          <button className="secondary" onClick={() => void loadLeads()}>
            Atualizar
          </button>
        </div>

        {scope === "seller" && visibleLeads.length > 0 && (
          <div className={`bulk-toolbar ${
            selectedLeadIds.length ? "active" : ""
          }`}>
            <label className="bulk-select-all">
              <input
                type="checkbox"
                checked={
                  visibleLeads.length > 0 &&
                  selectedVisibleCount === visibleLeads.length
                }
                onChange={toggleAllVisible}
              />
              <span>
                {selectedLeadIds.length
                  ? `${selectedLeadIds.length} selecionado(s)`
                  : "Selecionar contatos"}
              </span>
            </label>

            <div className="bulk-actions">
              <select
                className="bulk-status-select"
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value)
                }
                disabled={
                  !selectedLeadIds.length ||
                  bulkBusy !== null
                }
                aria-label="Mover contatos selecionados para outro status"
              >
                <option value="">Mover para...</option>
                {Object.entries(STATUS).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="bulk-status-button"
                disabled={
                  !selectedLeadIds.length ||
                  !bulkStatus ||
                  bulkBusy !== null
                }
                onClick={() => void applyBulkLeadStatus()}
              >
                {bulkBusy === "status"
                  ? "Movendo..."
                  : "✓ Aplicar status"}
              </button>

              <button
                type="button"
                className="bulk-copy"
                disabled={
                  !selectedLeadIds.length ||
                  bulkBusy !== null
                }
                onClick={() => void copySelectedNameAndPhone()}
              >
                📋 Copiar nome + número
              </button>

              <button
                type="button"
                className="bulk-message"
                disabled={
                  !selectedLeadIds.length ||
                  bulkBusy !== null
                }
                onClick={() => void sendSelectedToMessages()}
              >
                {bulkBusy === "messages"
                  ? "Preparando..."
                  : "💬 Levar para Mensagens"}
              </button>

              <button
                type="button"
                className="bulk-dialer"
                disabled={
                  !selectedLeadIds.length ||
                  bulkBusy !== null
                }
                onClick={() => void createDialerCampaign()}
              >
                {bulkBusy === "dialer"
                  ? "Criando campanha..."
                  : "📞 Criar campanha"}
              </button>

              {selectedLeadIds.length > 0 && (
                <button
                  type="button"
                  className="bulk-clear"
                  disabled={bulkBusy !== null}
                  onClick={clearLeadSelection}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}

        {leadError && <div className="alert error">{leadError}</div>}

        {leadLoading ? (
          <div className="loading">Carregando sua prospecção...</div>
        ) : visibleLeads.length === 0 ? (
          <div className="empty">
            <strong>Nenhum prospect nesta visualização.</strong>
            <span>
              Faça uma busca e assuma os primeiros contatos para iniciar seu
              funil de prospecção.
            </span>
          </div>
        ) : view === "cards" ? (
          <div className="lead-grid">
            {visibleLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selectable={scope === "seller"}
                selected={selectedLeadIds.includes(lead.id)}
                onSelect={() => toggleLeadSelection(lead.id)}
                onCopy={() =>
                  void copyPhone(
                    operationalWhatsapp({
                      phone: lead.phone,
                      whatsapp: lead.whatsapp,
                      whatsappOperational: lead.whatsappOperational,
                      whatsappSuggested: lead.whatsappSuggested,
                      phoneType: lead.phoneType,
                    }) || lead.phone
                  )
                }
                onOpenWhatsapp={() =>
                  openWhatsapp({
                    phone: lead.phone,
                    whatsapp: lead.whatsapp,
                    whatsappOperational: lead.whatsappOperational,
                    whatsappSuggested: lead.whatsappSuggested,
                    phoneType: lead.phoneType,
                  })
                }
                onEdit={() => openEdit(lead)}
                onStatus={(status) =>
                  void patchLead(lead.id, { status })
                }
              />
            ))}
          </div>
        ) : view === "list" ? (
          <div className="lead-table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  <th className="check-col">✓</th>
                  <th>Empresa</th>
                  <th>Status</th>
                  <th>Segmento</th>
                  <th>Telefone original</th>
                  <th>WhatsApp operacional</th>
                  <th>Tipo</th>
                  <th>E-mail</th>
                  <th>Região</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead) => {
                  const whatsappOp = operationalWhatsapp({
                    phone: lead.phone,
                    whatsapp: lead.whatsapp,
                    whatsappOperational: lead.whatsappOperational,
                    whatsappSuggested: lead.whatsappSuggested,
                    phoneType: lead.phoneType,
                  });

                  const phoneForTel = safeText(lead.phone).replace(
                    /[^\d+]/g,
                    ""
                  );

                  return (
                    <tr
                      key={lead.id}
                      className={
                        selectedLeadIds.includes(lead.id)
                          ? "selected-row"
                          : ""
                      }
                    >
                      <td className="check-col">
                        {scope === "seller" && (
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(lead.id)}
                            onChange={() =>
                              toggleLeadSelection(lead.id)
                            }
                          />
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="company-cell"
                          onClick={() => openEdit(lead)}
                        >
                          <strong>{lead.company_name}</strong>
                          <small>{lead.cnpj || "Sem CNPJ"}</small>
                        </button>
                      </td>
                      <td>
                        <select
                          className="table-status"
                          value={lead.status}
                          onChange={(event) =>
                            void patchLead(lead.id, {
                              status: event.target.value,
                            })
                          }
                        >
                          {Object.entries(STATUS).map(
                            ([value, item]) => (
                              <option key={value} value={value}>
                                {item.label}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td>{lead.segment || "—"}</td>
                      <td>
                        <strong className="nowrap">
                          {lead.phone || "—"}
                        </strong>
                      </td>
                      <td>
                        {whatsappOp ? (
                          <span className="whatsapp-op">
                            {formatPhoneForDisplay(whatsappOp)}
                            {lead.phoneType === "mobile_candidate" && (
                              <small>+9 automático</small>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span
                          className={`phone-badge ${phoneTypeClass(
                            lead.phoneType
                          )}`}
                        >
                          {phoneTypeLabel(lead.phoneType)}
                        </span>
                      </td>
                      <td>{lead.email || "—"}</td>
                      <td>
                        {[lead.city, lead.region]
                          .filter(Boolean)
                          .join(" • ") || "—"}
                      </td>
                      <td>
                        <div className="table-actions">
                          {whatsappOp && (
                            <button
                              type="button"
                              onClick={() =>
                                openWhatsapp({
                                  phone: lead.phone,
                                  whatsapp: lead.whatsapp,
                                  whatsappOperational:
                                    lead.whatsappOperational,
                                  whatsappSuggested:
                                    lead.whatsappSuggested,
                                  phoneType: lead.phoneType,
                                })
                              }
                            >
                              WhatsApp
                            </button>
                          )}
                          {whatsappOp && (
                            <button
                              type="button"
                              onClick={() =>
                                void copyPhone(whatsappOp)
                              }
                            >
                              {lead.phoneType === "mobile_candidate"
                                ? "Copiar +9"
                                : "Copiar"}
                            </button>
                          )}
                          {phoneForTel && (
                            <a href={`tel:${phoneForTel}`}>
                              Ligar
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(lead)}
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="kanban">
            {KANBAN.map((status) => {
              const items = visibleLeads.filter(
                (lead) => lead.status === status
              );

              return (
                <div
                  className="kanban-column"
                  key={status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggingId) return;
                    void patchLead(
                      draggingId,
                      { status },
                      false
                    );
                    setDraggingId(null);
                  }}
                >
                  <div className="kanban-head">
                    <span>{STATUS[status].label}</span>
                    <b>{items.length}</b>
                  </div>

                  <div className="kanban-list">
                    {items.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => setDraggingId(lead.id)}
                        onDragEnd={() => setDraggingId(null)}
                      >
                        <LeadCard
                          lead={lead}
                          compact
                          selectable={scope === "seller"}
                          selected={selectedLeadIds.includes(lead.id)}
                          onSelect={() => toggleLeadSelection(lead.id)}
                          onCopy={() =>
                            void copyPhone(
                              operationalWhatsapp({
                                phone: lead.phone,
                                whatsapp: lead.whatsapp,
                                whatsappOperational:
                                  lead.whatsappOperational,
                                whatsappSuggested:
                                  lead.whatsappSuggested,
                                phoneType: lead.phoneType,
                              }) || lead.phone
                            )
                          }
                          onOpenWhatsapp={() =>
                            openWhatsapp({
                              phone: lead.phone,
                              whatsapp: lead.whatsapp,
                              whatsappOperational:
                                lead.whatsappOperational,
                              whatsappSuggested:
                                lead.whatsappSuggested,
                              phoneType: lead.phoneType,
                            })
                          }
                          onEdit={() => openEdit(lead)}
                          onStatus={(nextStatus) =>
                            void patchLead(lead.id, {
                              status: nextStatus,
                            })
                          }
                        />
                      </div>
                    ))}

                    {!items.length && (
                      <span className="kanban-empty">
                        Nenhum lead
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {visibleLeads.some(
          (lead) => !KANBAN.includes(lead.status as any)
        ) && (
          <div className="paused-box">
            <strong>Outros acompanhamentos</strong>
            <span>
              Sem resposta, retornar depois, sem interesse e descartados ficam
              disponíveis pelos filtros de status.
            </span>
          </div>
        )}
      </section>

      {editing && form && (
        <div
          className="modal-backdrop"
          onMouseDown={() => {
            if (!saving) {
              setEditing(null);
              setForm(null);
            }
          }}
        >
          <div
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="section-kicker">Enriquecer prospect</span>
                <h3>{editing.company_name}</h3>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
              >
                ✕
              </button>
            </div>

            <div className="form-grid">
              <label className="wide">
                <span>Nome da empresa</span>
                <input
                  value={form.company_name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      company_name: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Proprietário</span>
                <input
                  value={form.owner_name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      owner_name: event.target.value,
                    })
                  }
                  placeholder="Nome do dono"
                />
              </label>

              <label>
                <span>Responsável por compras</span>
                <input
                  value={form.buyer_name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      buyer_name: event.target.value,
                    })
                  }
                  placeholder="Nome do comprador"
                />
              </label>

              <label>
                <span>Telefone confirmado</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      phone: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>WhatsApp confirmado</span>
                <input
                  value={form.whatsapp}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      whatsapp: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>CNPJ</span>
                <input
                  value={form.cnpj}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      cnpj: event.target.value,
                    })
                  }
                  placeholder="Será enriquecido pelo CNPJ depois"
                />
              </label>

              <label>
                <span>E-mail</span>
                <input
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                <span>Status comercial</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value,
                    })
                  }
                >
                  {Object.entries(STATUS).map(([value, item]) => (
                    <option key={value} value={value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Prioridade</span>
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      priority: event.target.value,
                    })
                  }
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </label>

              <label className="wide">
                <span>Próxima ação</span>
                <input
                  type="datetime-local"
                  value={form.next_action_at}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      next_action_at: event.target.value,
                    })
                  }
                />
              </label>

              <label className="wide">
                <span>Site</span>
                <input
                  value={form.site}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      site: event.target.value,
                    })
                  }
                />
              </label>

              <label className="wide">
                <span>Endereço confirmado</span>
                <input
                  value={form.address}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      address: event.target.value,
                    })
                  }
                />
              </label>

              <label className="wide">
                <span>Anotações comerciais</span>
                <textarea
                  rows={5}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Ex: falar com Marcelo depois das 14h..."
                />
              </label>
            </div>

            <div className="modal-actions">
              <button
                className="secondary"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "Salvando..." : "Salvar prospect"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .prospecting-page {
          display: grid;
          gap: 18px;
          color: #17202e;
        }

        .hero,
        .search-shell,
        .crm-shell {
          border: 1px solid #e6e9ee;
          border-radius: 22px;
          background: #ffffff;
          box-shadow: 0 12px 34px rgba(15, 23, 42, 0.055);
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 22px;
          padding: 24px;
          background:
            radial-gradient(circle at 88% 18%, rgba(37, 99, 235, 0.09), transparent 28%),
            radial-gradient(circle at 5% 100%, rgba(22, 163, 74, 0.08), transparent 25%),
            #fff;
        }

        .eyebrow,
        .section-kicker {
          color: #2563eb;
          font-size: 11px;
          line-height: 1;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .hero h2 {
          margin: 7px 0 6px;
          font-size: 30px;
          line-height: 1;
          letter-spacing: -0.045em;
        }

        .hero p {
          margin: 0;
          max-width: 670px;
          color: #667085;
          font-size: 14px;
          line-height: 1.55;
          font-weight: 600;
        }

        .hero-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(110px, 1fr));
          gap: 8px;
          min-width: 390px;
        }

        .hero-metrics div {
          min-width: 0;
          padding: 15px;
          border: 1px solid #e8edf5;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.88);
        }

        .hero-metrics strong {
          display: block;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.04em;
        }

        .hero-metrics span {
          display: block;
          margin-top: 3px;
          color: #667085;
          font-size: 11px;
          font-weight: 700;
        }

        .mobile-tabs {
          display: none;
          gap: 6px;
          padding: 5px;
          border: 1px solid #e6e9ee;
          border-radius: 16px;
          background: #fff;
        }

        .mobile-tabs button,
        .view-switch button {
          appearance: none;
          border: 0;
          cursor: pointer;
          border-radius: 11px;
          background: transparent;
          color: #667085;
          font-weight: 800;
        }

        .mobile-tabs button {
          flex: 1;
          min-height: 42px;
          padding: 0 12px;
        }

        .mobile-tabs button.active,
        .view-switch button.active {
          color: #fff;
          background: #17202e;
        }

        .search-shell,
        .crm-shell {
          padding: 20px;
        }

        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 16px;
        }

        .section-head h3 {
          margin: 5px 0 0;
          font-size: 19px;
          letter-spacing: -0.035em;
        }

        .source-badge {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0 11px;
          border: 1px solid #dbeafe;
          border-radius: 999px;
          color: #1d4ed8;
          background: #eff6ff;
          font-size: 11px;
          font-weight: 850;
        }

        .search-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 10px;
          align-items: end;
        }

        .smart-filters {
          display: grid;
          gap: 12px;
          margin-top: 14px;
          padding: 14px;
          border: 1px solid #e6e9ee;
          border-radius: 16px;
          background: #fbfcfd;
        }

        .smart-filter-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .smart-filter-title > div {
          display: grid;
          gap: 4px;
        }

        .smart-filter-title strong {
          color: #344054;
          font-size: 12px;
        }

        .filter-reset {
          min-height: 34px;
          padding: 0 10px;
          border: 1px solid #e6e9ee;
          border-radius: 10px;
          color: #475467;
          background: #fff;
          cursor: pointer;
          font-size: 10px;
          font-weight: 850;
        }

        .smart-filter-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          align-items: stretch;
        }

        .check-filter {
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 44px;
          padding: 9px 10px;
          border: 1px solid #e6e9ee;
          border-radius: 12px;
          background: #fff;
          cursor: pointer;
        }

        .check-filter input {
          width: 16px;
          height: 16px;
          min-height: auto;
          padding: 0;
          accent-color: #16a34a;
        }

        .check-filter > span {
          display: grid;
          gap: 2px;
        }

        .check-filter b {
          color: #344054;
          font-size: 10.5px;
        }

        .check-filter small {
          color: #98a2b3;
          font-size: 9px;
          line-height: 1.25;
        }

        label {
          min-width: 0;
          display: grid;
          gap: 6px;
        }

        label > span {
          color: #475467;
          font-size: 11px;
          font-weight: 800;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #dde3ea;
          outline: 0;
          color: #17202e;
          background: #fff;
          font: inherit;
          font-size: 13px;
          font-weight: 650;
          transition: 150ms ease;
        }

        input,
        select {
          min-height: 44px;
          padding: 0 12px;
        }

        textarea {
          resize: vertical;
          padding: 12px;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: #60a5fa;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.09);
        }

        button,
        a {
          font-family: inherit;
        }

        button.primary,
        button.secondary,
        a.secondary,
        a.action {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 12px;
          text-decoration: none;
          cursor: pointer;
          font-size: 12px;
          font-weight: 850;
          transition: 150ms ease;
        }

        button.primary {
          border: 1px solid #2563eb;
          color: #fff;
          background: #2563eb;
        }

        button.primary:hover {
          background: #1d4ed8;
        }

        button.primary:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        button.secondary,
        a.secondary,
        a.action {
          border: 1px solid #dde3ea;
          color: #344054;
          background: #fff;
        }

        button.secondary:hover,
        a.secondary:hover,
        a.action:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .search-button {
          min-width: 160px;
          min-height: 44px !important;
        }

        .search-summary {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 8px;
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 13px;
          color: #475467;
          background: #f8fafc;
          font-size: 11px;
          font-weight: 650;
        }


        .search-bulk-toolbar {
          position: sticky;
          top: 78px;
          z-index: 12;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px solid #dbe3ea;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 10px 26px rgba(15, 23, 42, 0.07);
          backdrop-filter: blur(10px);
        }

        .search-bulk-toolbar.active {
          border-color: #93c5fd;
          background: rgba(239, 246, 255, 0.97);
        }

        .search-select-all {
          display: inline-flex;
          grid-auto-flow: column;
          align-items: center;
          gap: 8px;
          color: #344054;
          cursor: pointer;
          font-size: 11px;
          font-weight: 850;
        }

        .search-select-all input,
        .result-card-check input {
          width: 17px;
          height: 17px;
          min-height: auto;
          padding: 0;
          accent-color: #2563eb;
          cursor: pointer;
        }

        .search-bulk-actions {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }

        .search-bulk-actions button {
          min-height: 36px;
          padding: 0 12px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 900;
        }

        .search-bulk-actions button:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .bulk-claim-button {
          border: 1px solid #2563eb;
          color: #fff;
          background: #2563eb;
        }

        .bulk-claim-button:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .bulk-clear-search {
          border: 1px solid #dbe3ea;
          color: #667085;
          background: #fff;
        }

        .result-grid,
        .lead-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .result-card {
          min-width: 0;
          display: grid;
          align-content: start;
          gap: 12px;
          padding: 15px;
          border: 1px solid #e6e9ee;
          border-radius: 17px;
          background: #fff;
        }


        .result-card.selected {
          border-color: #60a5fa;
          background: #f8fbff;
          box-shadow:
            0 0 0 2px rgba(37, 99, 235, 0.08),
            0 10px 26px rgba(37, 99, 235, 0.08);
        }

        .result-card-check {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 38px;
          cursor: pointer;
        }

        .result-top {
          min-width: 0;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .business-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #2563eb;
          background: #eff6ff;
          font-size: 18px;
          font-weight: 900;
        }

        .result-top h4 {
          margin: 1px 0 3px;
          font-size: 14px;
          line-height: 1.2;
          letter-spacing: -0.02em;
        }

        .muted {
          color: #667085;
          font-size: 11px;
          font-weight: 650;
        }

        .address {
          min-height: 38px;
          margin: 0;
          color: #475467;
          font-size: 12px;
          line-height: 1.45;
          font-weight: 600;
        }

        .result-intelligence {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }

        .phone-badge,
        .score-badge {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 900;
        }

        .phone-badge {
          color: #475467;
          background: #f2f4f7;
        }

        .phone-badge.is-mobile {
          color: #166534;
          background: #dcfce7;
        }

        .phone-badge.is-candidate {
          color: #92400e;
          background: #fef3c7;
        }

        .phone-badge.is-landline {
          color: #075985;
          background: #e0f2fe;
        }

        .score-badge {
          color: #9a3412;
          background: #fff7ed;
        }

        .phone-suggestion {
          padding: 8px 9px;
          border: 1px solid #fde68a;
          border-radius: 10px;
          color: #92400e;
          background: #fffbeb;
          font-size: 10px;
          line-height: 1.35;
        }

        .result-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(95px, 1fr));
          gap: 7px;
        }

        .claim-note {
          color: #98a2b3;
          font-size: 10px;
          line-height: 1.35;
          font-weight: 650;
        }

        .load-more {
          width: 100%;
          min-height: 44px;
          margin-top: 12px;
          border: 1px dashed #bfdbfe;
          border-radius: 13px;
          color: #1d4ed8;
          background: #f8fbff;
          cursor: pointer;
          font-weight: 850;
        }

        .cnpj-result-meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
          margin: 12px 0;
          padding: 10px;
          border-radius: 13px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
        }

        .cnpj-result-meta span {
          min-width: 0;
          color: #475569;
          font-size: 11px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .cnpj-result-meta span.wide {
          grid-column: 1 / -1;
        }

        .cnpj-result-meta b {
          display: block;
          margin-bottom: 2px;
          color: #0f172a;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .google-attribution {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #eef1f4;
          color: #667085;
          font-size: 10.5px;
          line-height: 1.4;
          font-weight: 650;
        }

        .crm-head {
          margin-bottom: 12px;
        }

        .view-switch {
          display: flex;
          gap: 4px;
          padding: 4px;
          border: 1px solid #e6e9ee;
          border-radius: 13px;
          background: #f8fafc;
        }

        .view-switch button {
          min-height: 34px;
          padding: 0 12px;
          font-size: 11px;
        }

        .quick-stats {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 7px;
          margin-bottom: 10px;
        }

        .quick-stats button {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          min-height: 40px;
          padding: 0 10px;
          border: 1px solid #e6e9ee;
          border-radius: 12px;
          color: #475467;
          background: #fff;
          cursor: pointer;
        }

        .quick-stats button.selected {
          border-color: #93c5fd;
          color: #1d4ed8;
          background: #eff6ff;
        }

        .quick-stats span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 10px;
          font-weight: 750;
        }

        .quick-stats strong {
          font-size: 12px;
          font-weight: 900;
        }

        .filters {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 220px auto;
          gap: 8px;
        }

        .filters button {
          min-height: 44px;
        }

        .bulk-toolbar {
          position: sticky;
          top: 78px;
          z-index: 8;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
          padding: 9px 10px;
          border: 1px solid #e6e9ee;
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          backdrop-filter: blur(10px);
        }

        .bulk-toolbar.active {
          border-color: #bbf7d0;
          background: rgba(240, 253, 244, 0.96);
        }

        .bulk-select-all {
          display: inline-flex;
          grid-auto-flow: column;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          color: #344054;
          font-size: 11px;
          font-weight: 850;
        }

        .bulk-select-all input {
          width: 16px;
          height: 16px;
          min-height: auto;
          padding: 0;
          accent-color: #16a34a;
        }

        .bulk-actions {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }

        .bulk-actions button {
          min-height: 36px;
          padding: 0 11px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 900;
        }

        .bulk-actions button:disabled,
        .bulk-actions select:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .bulk-status-select {
          width: auto;
          min-width: 150px;
          min-height: 36px;
          padding: 0 10px;
          border: 1px solid #dbe3ea;
          border-radius: 10px;
          color: #344054;
          background: #fff;
          font-size: 10px;
          font-weight: 850;
        }

        .bulk-status-button {
          border: 1px solid #a7f3d0;
          color: #047857;
          background: #ecfdf5;
        }

        .bulk-copy {
          border: 1px solid #fde68a;
          color: #92400e;
          background: #fffbeb;
        }

        .bulk-message {
          border: 1px solid #86efac;
          color: #166534;
          background: #f0fdf4;
        }

        .bulk-dialer {
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
          background: #eff6ff;
        }

        .bulk-clear {
          border: 1px solid #e6e9ee;
          color: #667085;
          background: #fff;
        }

        .alert {
          margin-top: 12px;
          padding: 11px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 750;
        }

        .alert.error {
          border: 1px solid #fecaca;
          color: #b42318;
          background: #fff1f2;
        }

        .loading,
        .empty {
          min-height: 150px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 5px;
          margin-top: 12px;
          padding: 24px;
          border: 1px dashed #d8dee8;
          border-radius: 16px;
          color: #667085;
          text-align: center;
          background: #fbfcfd;
          font-size: 12px;
          font-weight: 650;
        }

        .empty strong {
          color: #344054;
          font-size: 13px;
        }

        .lead-table-wrap {
          width: 100%;
          margin-top: 14px;
          overflow-x: auto;
          border: 1px solid #e6e9ee;
          border-radius: 15px;
          background: #fff;
        }

        .lead-table {
          width: 100%;
          min-width: 1320px;
          border-collapse: collapse;
          font-size: 10.5px;
        }

        .lead-table th {
          position: sticky;
          top: 0;
          z-index: 2;
          padding: 10px 9px;
          border-bottom: 1px solid #dfe5ec;
          color: #475467;
          background: #f8fafc;
          text-align: left;
          white-space: nowrap;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .lead-table td {
          max-width: 240px;
          padding: 9px;
          border-bottom: 1px solid #eef1f4;
          color: #475467;
          vertical-align: middle;
        }

        .lead-table tbody tr:hover {
          background: #fbfdff;
        }

        .lead-table tbody tr.selected-row {
          background: #f0fdf4;
        }

        .lead-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .check-col {
          width: 38px;
          text-align: center !important;
        }

        .check-col input {
          width: 15px;
          height: 15px;
          min-height: auto;
          accent-color: #16a34a;
        }

        .company-cell {
          display: grid;
          gap: 2px;
          width: 100%;
          padding: 0;
          border: 0;
          color: #17202e;
          background: transparent;
          cursor: pointer;
          text-align: left;
        }

        .company-cell strong {
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
        }

        .company-cell small {
          color: #98a2b3;
          font-size: 8.5px;
        }

        .table-status {
          min-width: 135px;
          min-height: 32px;
          padding: 0 8px;
          border-radius: 8px;
          font-size: 9px;
        }

        .nowrap {
          white-space: nowrap;
        }

        .whatsapp-op {
          display: grid;
          gap: 2px;
          color: #166534;
          font-weight: 850;
          white-space: nowrap;
        }

        .whatsapp-op small {
          color: #b54708;
          font-size: 8px;
          font-weight: 800;
        }

        .table-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 250px;
        }

        .table-actions button,
        .table-actions a {
          min-height: 29px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 7px;
          border: 1px solid #e6e9ee;
          border-radius: 8px;
          color: #344054;
          background: #fff;
          text-decoration: none;
          cursor: pointer;
          white-space: nowrap;
          font-size: 8.5px;
          font-weight: 850;
        }

        .table-actions button:first-child {
          border-color: #bbf7d0;
          color: #166534;
          background: #f0fdf4;
        }

        .kanban {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(245px, 1fr);
          gap: 10px;
          margin-top: 14px;
          padding-bottom: 7px;
          overflow-x: auto;
          overscroll-behavior-inline: contain;
        }

        .kanban-column {
          min-width: 245px;
          border: 1px solid #e6e9ee;
          border-radius: 16px;
          background: #f8fafc;
        }

        .kanban-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 44px;
          padding: 0 11px;
          border-bottom: 1px solid #e6e9ee;
          color: #344054;
          font-size: 11px;
          font-weight: 850;
        }

        .kanban-head b {
          min-width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: #475467;
          background: #e9eef5;
          font-size: 10px;
        }

        .kanban-list {
          display: grid;
          gap: 8px;
          min-height: 170px;
          padding: 8px;
        }

        .kanban-empty {
          display: grid;
          place-items: center;
          min-height: 100px;
          color: #98a2b3;
          font-size: 10px;
          font-weight: 700;
        }

        .paused-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
          padding: 10px 12px;
          border: 1px solid #e6e9ee;
          border-radius: 12px;
          color: #667085;
          background: #f8fafc;
          font-size: 10.5px;
          font-weight: 650;
        }

        .paused-box strong {
          color: #344054;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(15, 23, 42, 0.46);
          backdrop-filter: blur(5px);
        }

        .modal {
          width: min(760px, 100%);
          max-height: min(88vh, 860px);
          overflow: auto;
          border: 1px solid #e6e9ee;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 32px 90px rgba(15, 23, 42, 0.25);
        }

        .modal-head {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px;
          border-bottom: 1px solid #eef1f4;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(12px);
        }

        .modal-head h3 {
          margin: 5px 0 0;
          font-size: 19px;
          letter-spacing: -0.03em;
        }

        .icon-button {
          width: 38px;
          height: 38px;
          border: 1px solid #e6e9ee;
          border-radius: 12px;
          color: #475467;
          background: #fff;
          cursor: pointer;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 18px;
        }

        .form-grid .wide {
          grid-column: 1 / -1;
        }

        .modal-actions {
          position: sticky;
          bottom: 0;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 14px 18px;
          border-top: 1px solid #eef1f4;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(12px);
        }

        .modal-actions button {
          min-width: 130px;
        }

        @media (max-width: 1100px) {
          .hero {
            align-items: flex-start;
            flex-direction: column;
          }

          .hero-metrics {
            width: 100%;
            min-width: 0;
          }

          .search-grid {
            grid-template-columns: 1fr 1fr;
          }

          .smart-filter-grid {
            grid-template-columns: 1fr 1fr;
          }

          .search-button {
            width: 100%;
          }

          .result-grid,
          .lead-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .quick-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .prospecting-page {
            gap: 12px;
          }

          .hero {
            padding: 17px;
            border-radius: 18px;
          }

          .hero h2 {
            font-size: 25px;
          }

          .hero p {
            font-size: 12px;
          }

          .hero-metrics {
            grid-template-columns: repeat(3, 1fr);
          }

          .hero-metrics div {
            padding: 11px 9px;
          }

          .hero-metrics strong {
            font-size: 18px;
          }

          .hero-metrics span {
            font-size: 9px;
          }

          .mobile-tabs {
            display: flex;
            position: sticky;
            top: 82px;
            z-index: 11;
          }

          .mobile-hidden {
            display: none;
          }

          .search-shell,
          .crm-shell {
            padding: 14px;
            border-radius: 18px;
          }

          .section-head {
            align-items: flex-start;
          }

          .section-head h3 {
            font-size: 17px;
          }

          .search-grid,
          .filters,
          .smart-filter-grid,
          .result-grid,
          .lead-grid,
          .form-grid {
            grid-template-columns: 1fr;
          }

          .smart-filter-title,
          .bulk-toolbar,
          .search-bulk-toolbar {
            align-items: stretch;
            flex-direction: column;
          }

          .bulk-toolbar {
            top: 132px;
          }

          .search-bulk-toolbar {
            position: sticky;
            top: auto;
            bottom: 10px;
            z-index: 25;
          }

          .search-bulk-actions {
            display: grid;
            grid-template-columns: 1fr auto;
            width: 100%;
          }

          .bulk-claim-button {
            min-height: 42px !important;
          }

          .bulk-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            width: 100%;
          }

          .bulk-status-select {
            width: 100%;
          }

          .bulk-clear {
            grid-column: 1 / -1;
          }

          .result-actions {
            grid-template-columns: 1fr 1fr;
          }

          .quick-stats {
            display: flex;
            overflow-x: auto;
            padding-bottom: 3px;
          }

          .quick-stats button {
            min-width: 105px;
          }

          .view-switch {
            flex: 0 0 auto;
          }

          .kanban {
            grid-auto-columns: minmax(82vw, 290px);
          }

          .form-grid .wide {
            grid-column: auto;
          }

          .modal-backdrop {
            place-items: end center;
            padding: 0;
          }

          .modal {
            width: 100%;
            max-height: 92dvh;
            border-radius: 22px 22px 0 0;
          }

          .modal-actions {
            padding-bottom: max(14px, env(safe-area-inset-bottom));
          }

          .modal-actions button {
            min-width: 0;
            flex: 1;
          }
        }

        @media (max-width: 420px) {
          .hero-metrics {
            grid-template-columns: 1fr;
          }

          .hero-metrics div {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .result-actions {
            grid-template-columns: 1fr;
          }

          .crm-head {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

function LeadCard({
  lead,
  compact = false,
  selectable = true,
  selected = false,
  onSelect,
  onCopy,
  onOpenWhatsapp,
  onEdit,
  onStatus,
}: {
  lead: Lead;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onOpenWhatsapp: () => void;
  onEdit: () => void;
  onStatus: (status: string) => void;
}) {
  const status = STATUS[lead.status] || STATUS.novo;
  const phoneForTel = safeText(lead.phone).replace(/[^\d+]/g, "");

  return (
    <article
      className={`lead-card ${compact ? "compact" : ""} ${
        selected ? "selected" : ""
      }`}
    >
      <div className="lead-card-top">
        <div className="lead-title">
          {selectable && (
            <label className="lead-select">
              <input
                type="checkbox"
                checked={selected}
                onChange={onSelect}
              />
              <span>Selecionar</span>
            </label>
          )}

          <span className={`status tone-${status.tone}`}>
            {status.label}
          </span>
          <h4>{lead.company_name}</h4>
          <small>
            {[lead.segment, lead.city, lead.region]
              .filter(Boolean)
              .join(" • ") || "Prospect externo"}
          </small>
        </div>

        <button className="edit" onClick={onEdit}>
          Editar
        </button>
      </div>

      {!compact && (
        <div className="people">
          <span>
            👤 {lead.owner_name || "Proprietário não informado"}
          </span>
          <span>
            🛒 {lead.buyer_name || "Comprador não informado"}
          </span>
        </div>
      )}

      <div className="lead-info">
        {lead.phone && (
          <span className="phone-line">
            ☎ {lead.phone}
            <b
              className={`phone-kind ${phoneTypeClass(
                lead.phoneType
              )}`}
            >
              {phoneTypeLabel(lead.phoneType)}
            </b>
          </span>
        )}
        {lead.phoneType === "mobile_candidate" &&
          lead.whatsappSuggested && (
            <span className="candidate-note">
              WhatsApp operacional:{" "}
              {formatPhoneForDisplay(
                lead.whatsappOperational ||
                  lead.whatsappSuggested
              )}{" "}
              • +9 automático.
            </span>
          )}
        {lead.next_action_at && (
          <span>↩ Próxima ação: {formatDate(lead.next_action_at)}</span>
        )}
        {lead.source === "google_places" && !lead.google_live && (
          <span className="warning">
            Dados Google indisponíveis agora
          </span>
        )}
      </div>

      <select
        className="status-select"
        value={lead.status}
        onChange={(event) => onStatus(event.target.value)}
      >
        {Object.entries(STATUS).map(([value, item]) => (
          <option key={value} value={value}>
            {item.label}
          </option>
        ))}
      </select>

      <div className="lead-actions">
        {(lead.whatsapp_link ||
          lead.phoneType === "mobile_candidate") && (
          <button
            type="button"
            className="action whatsapp"
            onClick={onOpenWhatsapp}
          >
            {lead.phoneType === "mobile_candidate"
              ? "WhatsApp +9"
              : "WhatsApp"}
          </button>
        )}

        {lead.phone && (
          <button
            type="button"
            className="action"
            onClick={onCopy}
          >
            {lead.phoneType === "mobile_candidate"
              ? "Copiar +9"
              : "Copiar"}
          </button>
        )}

        {phoneForTel && (
          <a href={`tel:${phoneForTel}`} className="action">
            Ligar
          </a>
        )}

        {lead.google_maps && (
          <a
            href={lead.google_maps}
            target="_blank"
            rel="noreferrer"
            className="action"
          >
            Maps
          </a>
        )}

        <button className="action" onClick={onEdit}>
          Detalhes
        </button>
      </div>

      <style jsx>{`
        .lead-card {
          min-width: 0;
          display: grid;
          align-content: start;
          gap: 10px;
          padding: 14px;
          border: 1px solid #e6e9ee;
          border-radius: 17px;
          background: #fff;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.035);
        }

        .lead-card.selected {
          border-color: #86efac;
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.08);
        }

        .lead-card.compact {
          gap: 8px;
          padding: 11px;
          border-radius: 14px;
        }

        .lead-select {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 5px;
          color: #667085;
          cursor: pointer;
          font-size: 9px;
          font-weight: 800;
        }

        .lead-select input {
          width: 14px;
          height: 14px;
          accent-color: #16a34a;
        }

        .lead-card-top {
          min-width: 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }

        .lead-title {
          min-width: 0;
        }

        .lead-title h4 {
          margin: 6px 0 2px;
          overflow: hidden;
          color: #17202e;
          font-size: 14px;
          line-height: 1.2;
          letter-spacing: -0.025em;
          text-overflow: ellipsis;
        }

        .lead-title small {
          display: block;
          overflow: hidden;
          color: #667085;
          font-size: 10px;
          line-height: 1.3;
          font-weight: 650;
          text-overflow: ellipsis;
        }

        .status {
          display: inline-flex;
          min-height: 23px;
          align-items: center;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .tone-blue {
          color: #1d4ed8;
          background: #dbeafe;
        }

        .tone-indigo {
          color: #4338ca;
          background: #e0e7ff;
        }

        .tone-green,
        .tone-emerald {
          color: #047857;
          background: #d1fae5;
        }

        .tone-amber {
          color: #a16207;
          background: #fef3c7;
        }

        .tone-orange {
          color: #c2410c;
          background: #ffedd5;
        }

        .tone-red {
          color: #b42318;
          background: #fee2e2;
        }

        .tone-gray,
        .tone-slate {
          color: #475467;
          background: #eef2f6;
        }

        .tone-violet {
          color: #6d28d9;
          background: #ede9fe;
        }

        .edit {
          appearance: none;
          min-height: 29px;
          padding: 0 9px;
          border: 1px solid #e6e9ee;
          border-radius: 9px;
          color: #475467;
          background: #fff;
          cursor: pointer;
          font-size: 9px;
          font-weight: 850;
        }

        .people,
        .lead-info {
          display: grid;
          gap: 4px;
          color: #475467;
          font-size: 10.5px;
          line-height: 1.35;
          font-weight: 650;
        }

        .lead-info {
          padding-top: 8px;
          border-top: 1px solid #eef1f4;
        }

        .phone-line {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }

        .phone-kind {
          display: inline-flex;
          padding: 3px 6px;
          border-radius: 999px;
          background: #f2f4f7;
          color: #475467;
          font-size: 8px;
          font-weight: 900;
        }

        .phone-kind.is-mobile {
          background: #dcfce7;
          color: #166534;
        }

        .phone-kind.is-candidate {
          background: #fef3c7;
          color: #92400e;
        }

        .phone-kind.is-landline {
          background: #e0f2fe;
          color: #075985;
        }

        .candidate-note {
          color: #92400e;
        }

        .warning {
          color: #b54708;
        }

        .status-select {
          width: 100%;
          min-height: 36px;
          padding: 0 9px;
          border: 1px solid #e6e9ee;
          border-radius: 10px;
          outline: 0;
          color: #344054;
          background: #f8fafc;
          font-size: 10px;
          font-weight: 800;
        }

        .lead-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .lead-actions :global(.action) {
          min-height: 32px;
          flex: 1 1 65px;
          padding: 0 8px;
          border: 1px solid #e6e9ee;
          border-radius: 10px;
          color: #344054;
          background: #fff;
          text-decoration: none;
          cursor: pointer;
          font-size: 9px;
          font-weight: 850;
        }

        .lead-actions :global(.whatsapp) {
          border-color: #bbf7d0;
          color: #166534;
          background: #f0fdf4;
        }

        .compact .people {
          display: none;
        }
      `}</style>
    </article>
  );
}
