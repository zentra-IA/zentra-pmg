"use client";

import { useEffect, useMemo, useState } from "react";

const ROLES = ["geral", "supervisor", "vendedor"];
const PAYMENT_METHODS = ["PIX", "CREDITO", "DEBITO", "BOLETO", "DINHEIRO"];
const PLAN_STATUSES = ["ATIVO", "SUSPENSO", "CANCELADO"];

const FEATURE_LABELS: Record<string, string> = {
  produtos: "Produtos",
  clientes: "Clientes",
  radar: "Radar de Clientes",
  campanhas_comerciais: "Campanhas de Produtos",
  inbox: "Inbox Comercial",
  chatbot_ia: "Mensagens / IA Comercial",
  whatsapp: "WhatsApp",
  visitas: "Visitas",
  contratacoes: "Pedidos",
  bi_comercial: "BI Comercial",
  importacao_clientes: "Importação de Clientes",
  score_comercial_ia: "Score Comercial IA",
};

function money(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function currentCompetence() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year =
    parts.find((item) => item.type === "year")?.value || "";

  const month =
    parts.find((item) => item.type === "month")?.value || "";

  return `${year}-${month}`;
}

function todayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year =
    parts.find((item) => item.type === "year")?.value || "";

  const month =
    parts.find((item) => item.type === "month")?.value || "";

  const day =
    parts.find((item) => item.type === "day")?.value || "";

  return `${year}-${month}-${day}`;
}

function alertLabel(alert: string) {
  const labels: Record<string, string> = {
    PAGO: "Pago",
    VENCE_AMANHA: "Vence amanhã",
    VENCE_HOJE: "Vence hoje",
    VENCE_EM_ATE_3_DIAS: "Vence em até 3 dias",
    ATRASADO: "Atrasado",
    A_VENCER: "A vencer",
    SUSPENSO: "Suspenso",
    CANCELADO: "Cancelado",
  };

  return labels[alert] || alert || "Pendente";
}

function alertStyle(alert: string): React.CSSProperties {
  if (alert === "PAGO") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (alert === "ATRASADO" || alert === "CANCELADO") {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    };
  }

  if (
    alert === "VENCE_HOJE" ||
    alert === "VENCE_AMANHA" ||
    alert === "VENCE_EM_ATE_3_DIAS"
  ) {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };
  }

  if (alert === "SUSPENSO") {
    return {
      background: "#e2e8f0",
      color: "#475569",
      border: "1px solid #cbd5e1",
    };
  }

  return {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  };
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function buildReminderMessage(row: any) {
  const name = row?.name || "Olá";
  const amount = money(row?.monthly_value || 139);

  if (row?.alert === "ATRASADO") {
    return `Olá, ${name}! Passando para avisar que a renovação do Zentra Sales AI, no valor de ${amount}, está pendente. Se já realizou o pagamento, pode desconsiderar esta mensagem. Qualquer dúvida estou à disposição.`;
  }

  if (row?.alert === "VENCE_HOJE") {
    return `Olá, ${name}! Sua renovação do Zentra Sales AI vence hoje. O valor é ${amount}. Se já realizou o pagamento, pode desconsiderar esta mensagem. Qualquer dúvida estou à disposição.`;
  }

  return `Olá, ${name}! Passando para lembrar que sua renovação do Zentra Sales AI, no valor de ${amount}, vence amanhã. Qualquer dúvida estou à disposição.`;
}

type BillingDraft = {
  monthlyValue: string;
  signupFee: string;
  dueDay: string;
  paymentMethod: string;
  planStatus: string;
  joinedAt: string;
  document: string;
  address: string;
  notes: string;
};

function draftFromUser(user: any): BillingDraft {
  const billing = user?.billing;

  return {
    monthlyValue: String(billing?.monthly_value ?? 139),
    signupFee: String(billing?.signup_fee ?? 89),
    dueDay: String(billing?.due_day ?? 10),
    paymentMethod: String(billing?.payment_method || "PIX"),
    planStatus: String(billing?.plan_status || "ATIVO"),
    joinedAt: billing?.joined_at
      ? String(billing.joined_at).slice(0, 10)
      : todayInputValue(),
    document: String(billing?.document || ""),
    address: String(billing?.address || ""),
    notes: String(billing?.notes || ""),
  };
}

export default function MasterCompaniesPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [usersData, setUsersData] = useState<any>(null);
  const [grantsData, setGrantsData] = useState<any>(null);
  const [radarGrants, setRadarGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"management" | "billing">(
    "management"
  );

  const [billingAllowed, setBillingAllowed] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingDashboard, setBillingDashboard] = useState<any>(null);
  const [companyBilling, setCompanyBilling] = useState<any>(null);
  const [billingDrafts, setBillingDrafts] = useState<
    Record<string, BillingDraft>
  >({});
  const [billingFilter, setBillingFilter] = useState("ALL");
  const [billingSearch, setBillingSearch] = useState("");
  const [billingDashboardCompanyFilter, setBillingDashboardCompanyFilter] =
    useState("ALL");
  const [billingPaymentMethodFilter, setBillingPaymentMethodFilter] =
    useState("ALL");
  const [billingSort, setBillingSort] = useState("DUE_ASC");
  const [billingCompanyId, setBillingCompanyId] = useState("");
  const [emailTestLoading, setEmailTestLoading] = useState(false);

  const [form, setForm] = useState({
    restaurantName: "",
    document: "",
    ownerName: "",
    email: "",
    password: "",
    phone: "",
    whatsapp: "",
    extraContact: "",
    planId: "",
  });

  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "vendedor",
  });

  const [newUserBilling, setNewUserBilling] = useState({
    enabled: true,
    monthlyValue: "139",
    signupFee: "89",
    dueDay: "10",
    paymentMethod: "PIX",
    planStatus: "ATIVO",
    joinedAt: todayInputValue(),
  });

  const [grantForm, setGrantForm] = useState({
    feature: "bi_comercial",
    days: "7",
    notes: "",
  });

  const [radarForm, setRadarForm] = useState({
    contactsExtra: "200",
    days: "30",
  });

  async function loadPlans() {
    const fallbackPlans = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "MASTER",
      },
    ];

    try {
      const res = await fetch("/api/admin/companies/create", {
        cache: "no-store",
      });
      const data = await readJsonSafe(res);

      if (!res.ok) {
        console.warn("Erro ao carregar planos pela API:", data?.error);
        setPlans(fallbackPlans);
        setForm((prev) => ({
          ...prev,
          planId: prev.planId || fallbackPlans[0].id,
        }));
        return;
      }

      const loadedPlans = Array.isArray(data)
        ? data
        : Array.isArray(data?.plans)
          ? data.plans
          : [];

      const finalPlans = loadedPlans.length ? loadedPlans : fallbackPlans;

      setPlans(finalPlans);
      setForm((prev) => ({
        ...prev,
        planId: prev.planId || finalPlans[0]?.id || "",
      }));
    } catch (error) {
      console.warn("Falha ao carregar planos:", error);
      setPlans(fallbackPlans);
      setForm((prev) => ({
        ...prev,
        planId: prev.planId || fallbackPlans[0].id,
      }));
    }
  }

  async function loadCompanies() {
    const res = await fetch("/api/admin/companies", {
      cache: "no-store",
    });
    const data = await readJsonSafe(res);
    setCompanies(Array.isArray(data) ? data : []);
  }

  async function loadUsers(companyId: string) {
    const res = await fetch(`/api/admin/users?companyId=${companyId}`, {
      cache: "no-store",
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      alert(data.error || "Erro ao buscar usuários");
      return;
    }

    setUsersData({
      ...data,
      users: (data.users || []).map((user: any) => ({
        ...user,
        password: "",
      })),
    });
  }

  async function loadGrants(companyId: string) {
    const res = await fetch(
      `/api/admin/feature-grants?companyId=${companyId}`,
      {
        cache: "no-store",
      }
    );

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      setGrantsData({ grants: [] });
      return;
    }

    setGrantsData(data);
  }

  async function loadRadarGrants(companyId: string) {
    const res = await fetch(
      `/api/admin/radar-grants?companyId=${companyId}`,
      {
        cache: "no-store",
      }
    );

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      setRadarGrants([]);
      return;
    }

    setRadarGrants(data.grants || []);
  }

  async function loadBillingAccess() {
    try {
      const res = await fetch("/api/admin/billing?scope=access", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await readJsonSafe(res);
      const allowed = Boolean(res.ok && data?.allowed);

      setBillingAllowed(allowed);

      if (allowed) {
        await loadBillingDashboard();
      }
    } catch {
      setBillingAllowed(false);
    }
  }

  async function loadBillingDashboard() {
    setBillingLoading(true);

    try {
      const res = await fetch("/api/admin/billing", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        setBillingDashboard(null);
        return;
      }

      setBillingDashboard(data);
    } finally {
      setBillingLoading(false);
    }
  }

  async function loadCompanyBilling(companyId: string) {
    if (!companyId || !billingAllowed) return;

    setBillingLoading(true);

    try {
      const res = await fetch(
        `/api/admin/billing?companyId=${encodeURIComponent(companyId)}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await readJsonSafe(res);

      if (!res.ok) {
        alert(data?.error || "Erro ao carregar cobranças da empresa.");
        return;
      }

      setCompanyBilling(data);

      const nextDrafts: Record<string, BillingDraft> = {};

      for (const user of data.users || []) {
        nextDrafts[user.id] = draftFromUser(user);
      }

      setBillingDrafts(nextDrafts);
    } finally {
      setBillingLoading(false);
    }
  }

  useEffect(() => {
    void loadPlans();
    void loadCompanies();
    void loadBillingAccess();
  }, []);

  useEffect(() => {
    if (!billingAllowed) return;

    const companyId =
      billingCompanyId ||
      selectedCompany?.id ||
      companies[0]?.id ||
      "";

    if (!companyId) return;

    if (companyId !== billingCompanyId) {
      setBillingCompanyId(companyId);
    }

    void loadCompanyBilling(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingAllowed, companies.length]);

  async function createCompany() {
    if (
      !form.restaurantName ||
      !form.ownerName ||
      !form.email ||
      !form.password ||
      !form.planId
    ) {
      alert("Preencha empresa, responsável, e-mail, senha e plano.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/companies/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data: any = await readJsonSafe(res);

      if (!res.ok) {
        alert(data.error || "Erro ao criar empresa");
        return;
      }

      alert("Empresa criada com sucesso.");

      setForm({
        restaurantName: "",
        document: "",
        ownerName: "",
        email: "",
        password: "",
        phone: "",
        whatsapp: "",
        extraContact: "",
        planId: "",
      });

      await loadCompanies();
    } finally {
      setLoading(false);
    }
  }

  async function updateCompany(companyId: string, payload: any) {
    const res = await fetch("/api/admin/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: companyId, ...payload }),
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      alert(data.error || "Erro ao atualizar empresa");
      return;
    }

    await loadCompanies();

    if (selectedCompany?.id === companyId) {
      setSelectedCompany((prev: any) => ({
        ...prev,
        ...payload,
        ...data.company,
      }));
    }
  }

  async function deleteCompany(companyId: string) {
    if (
      !confirm(
        "Excluir empresa definitivamente? Essa ação não pode ser desfeita."
      )
    ) {
      return;
    }

    const res = await fetch(`/api/admin/companies?id=${companyId}`, {
      method: "DELETE",
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      alert(data.error || "Erro ao excluir empresa");
      return;
    }

    setSelectedCompany(null);
    setUsersData(null);
    setGrantsData(null);
    setRadarGrants([]);
    await loadCompanies();
  }

  async function createBillingProfile(
    companyId: string,
    companyUserId: string,
    draft: BillingDraft
  ) {
    const res = await fetch("/api/admin/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        companyId,
        companyUserId,
        monthlyValue: Number(draft.monthlyValue || 0),
        signupFee: Number(draft.signupFee || 0),
        dueDay: Number(draft.dueDay || 10),
        paymentMethod: draft.paymentMethod,
        planStatus: draft.planStatus,
        joinedAt: draft.joinedAt || null,
        document: draft.document,
        address: draft.address,
        notes: draft.notes,
      }),
    });

    return {
      res,
      data: await readJsonSafe(res),
    };
  }

  async function createUser() {
    if (!selectedCompany?.id) {
      alert("Selecione uma empresa.");
      return;
    }

    if (!userForm.name || !userForm.email || !userForm.password) {
      alert("Preencha nome, e-mail e senha.");
      return;
    }

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedCompany.id,
        ...userForm,
      }),
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      alert(data.error || "Erro ao criar usuário");
      return;
    }

    let billingWarning = "";

    if (
      billingAllowed &&
      newUserBilling.enabled &&
      data?.user?.id
    ) {
      const draft: BillingDraft = {
        monthlyValue: newUserBilling.monthlyValue,
        signupFee: newUserBilling.signupFee,
        dueDay: newUserBilling.dueDay,
        paymentMethod: newUserBilling.paymentMethod,
        planStatus: newUserBilling.planStatus,
        joinedAt: newUserBilling.joinedAt,
        document: "",
        address: "",
        notes: "",
      };

      const billingResult = await createBillingProfile(
        selectedCompany.id,
        data.user.id,
        draft
      );

      if (!billingResult.res.ok) {
        billingWarning =
          `\n\nUsuário criado, mas o cadastro financeiro não foi salvo: ${
            billingResult.data?.error || "erro desconhecido"
          }`;
      }
    }

    setUserForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      role: "vendedor",
    });

    await loadUsers(selectedCompany.id);

    if (billingAllowed) {
      await loadBillingDashboard();
      await loadCompanyBilling(selectedCompany.id);
    }

    alert(
      `Usuário criado com sucesso.${billingWarning}\n\nA senha digitada foi usada apenas na criação do acesso e não é armazenada neste painel.`
    );
  }

  async function updateUser(userId: string, payload: any) {
    const cleanPayload = { ...payload };

    if (!cleanPayload.password) {
      delete cleanPayload.password;
    }

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: userId,
        ...cleanPayload,
      }),
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      alert(data.error || "Erro ao atualizar usuário");
      return;
    }

    alert("Usuário atualizado com sucesso.");

    if (selectedCompany?.id) {
      await loadUsers(selectedCompany.id);
    }

    if (billingAllowed) {
      await loadBillingDashboard();
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm("Excluir usuário definitivamente?")) return;

    const res = await fetch(`/api/admin/users?id=${userId}`, {
      method: "DELETE",
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      alert(data.error || "Erro ao excluir usuário");
      return;
    }

    if (selectedCompany?.id) {
      await loadUsers(selectedCompany.id);
    }

    if (billingAllowed) {
      await loadBillingDashboard();
      if (billingCompanyId) {
        await loadCompanyBilling(billingCompanyId);
      }
    }
  }

  async function createGrant() {
    if (!selectedCompany?.id) {
      alert("Selecione uma empresa.");
      return;
    }

    const res = await fetch("/api/admin/feature-grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedCompany.id,
        feature: grantForm.feature,
        days: Number(grantForm.days || 0),
        notes: grantForm.notes,
      }),
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      alert(data.error || "Erro ao liberar funcionalidade");
      return;
    }

    setGrantForm({
      feature: "bi_comercial",
      days: "7",
      notes: "",
    });

    await loadGrants(selectedCompany.id);
    alert("Funcionalidade liberada com sucesso.");
  }

  async function selectCompany(company: any) {
    setSelectedCompany(company);
    await loadUsers(company.id);
    await loadGrants(company.id);
    await loadRadarGrants(company.id);

    if (billingAllowed) {
      setBillingCompanyId(company.id);
      await loadCompanyBilling(company.id);
    }
  }

  function updateBillingDraft(
    userId: string,
    key: keyof BillingDraft,
    value: string
  ) {
    setBillingDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] || ({} as BillingDraft)),
        [key]: value,
      },
    }));
  }

  async function saveUserBilling(user: any) {
    if (!billingCompanyId) return;

    const draft =
      billingDrafts[user.id] || draftFromUser(user);

    const { res, data } = await createBillingProfile(
      billingCompanyId,
      user.id,
      draft
    );

    if (!res.ok) {
      alert(data?.error || "Erro ao salvar cobrança.");
      return;
    }

    alert("Cadastro financeiro salvo com sucesso.");
    await Promise.all([
      loadBillingDashboard(),
      loadCompanyBilling(billingCompanyId),
    ]);
  }

  async function registerPayment(row: any) {
    if (!row?.id) {
      alert("Salve o cadastro financeiro antes de registrar pagamento.");
      return;
    }

    const competence =
      billingDashboard?.competence || currentCompetence();

    const amountInput = window.prompt(
      `Valor recebido em ${competence}:`,
      String(row.monthly_value || 139)
    );

    if (amountInput === null) return;

    const amount = Number(
      String(amountInput).replace(",", ".")
    );

    if (!Number.isFinite(amount) || amount < 0) {
      alert("Valor inválido.");
      return;
    }

    const notes =
      window.prompt("Observação / comprovante (opcional):", "") || "";

    const res = await fetch("/api/admin/billing/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        profileId: row.id,
        competence,
        amount,
        paymentMethod: row.payment_method || "PIX",
        notes,
      }),
    });

    const data = await readJsonSafe(res);

    if (!res.ok) {
      alert(data?.error || "Erro ao registrar pagamento.");
      return;
    }

    alert("Pagamento registrado.");
    await loadBillingDashboard();

    if (billingCompanyId) {
      await loadCompanyBilling(billingCompanyId);
    }
  }

  async function removePayment(paymentId: string) {
    if (!confirm("Remover este registro de pagamento?")) return;

    const res = await fetch(
      `/api/admin/billing/payments?id=${encodeURIComponent(paymentId)}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    const data = await readJsonSafe(res);

    if (!res.ok) {
      alert(data?.error || "Erro ao remover pagamento.");
      return;
    }

    await loadBillingDashboard();

    if (billingCompanyId) {
      await loadCompanyBilling(billingCompanyId);
    }
  }

  async function sendBillingTestEmail() {
    setEmailTestLoading(true);

    try {
      const res = await fetch("/api/admin/billing/reminders", {
        method: "POST",
        credentials: "include",
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        alert(
          data?.error ||
            "Não foi possível enviar o e-mail de teste."
        );
        return;
      }

      alert(
        `E-mail de teste enviado com sucesso para ${
          data?.to || "o e-mail configurado"
        }.`
      );
    } catch {
      alert("Erro inesperado ao enviar o e-mail de teste.");
    } finally {
      setEmailTestLoading(false);
    }
  }

  async function copyReminder(row: any) {
    const message = buildReminderMessage(row);

    try {
      await navigator.clipboard.writeText(message);
      alert("Mensagem de cobrança copiada.");
    } catch {
      alert(message);
    }
  }

  function openReminderWhatsApp(row: any) {
    const phone = normalizePhone(row?.phone);

    if (!phone) {
      alert("Este usuário não possui WhatsApp cadastrado.");
      return;
    }

    const message = encodeURIComponent(buildReminderMessage(row));
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener,noreferrer");
  }

  const billingRows = useMemo(() => {
    const rows = Array.isArray(billingDashboard?.rows)
      ? [...billingDashboard.rows]
      : [];

    const search = billingSearch.trim().toLowerCase();

    const filtered = rows.filter((row: any) => {
      if (billingFilter !== "ALL" && row.alert !== billingFilter) {
        return false;
      }

      if (
        billingDashboardCompanyFilter !== "ALL" &&
        row.company_id !== billingDashboardCompanyFilter
      ) {
        return false;
      }

      if (
        billingPaymentMethodFilter !== "ALL" &&
        String(row.payment_method || "").toUpperCase() !==
          billingPaymentMethodFilter
      ) {
        return false;
      }

      if (!search) return true;

      return [
        row.name,
        row.email,
        row.phone,
        row.company_name,
        row.company_user_id,
      ].some((value) =>
        String(value || "").toLowerCase().includes(search)
      );
    });

    filtered.sort((a: any, b: any) => {
      if (billingSort === "NAME_ASC") {
        return String(a.name || "").localeCompare(
          String(b.name || ""),
          "pt-BR"
        );
      }

      if (billingSort === "COMPANY_ASC") {
        return String(a.company_name || "").localeCompare(
          String(b.company_name || ""),
          "pt-BR"
        );
      }

      if (billingSort === "VALUE_DESC") {
        return Number(b.monthly_value || 0) - Number(a.monthly_value || 0);
      }

      if (billingSort === "VALUE_ASC") {
        return Number(a.monthly_value || 0) - Number(b.monthly_value || 0);
      }

      return Number(a.due_day || 31) - Number(b.due_day || 31);
    });

    return filtered;
  }, [
    billingDashboard,
    billingFilter,
    billingSearch,
    billingDashboardCompanyFilter,
    billingPaymentMethodFilter,
    billingSort,
  ]);

  const selectedBillingRow = (companyUserId: string) =>
    (billingDashboard?.rows || []).find(
      (row: any) => row.company_user_id === companyUserId
    );

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <section style={styles.hero}>
          <p style={styles.kicker}>Zentra Sales AI Master</p>
          <h1 style={styles.heroTitle}>Empresas e Usuários</h1>
          <p style={styles.heroText}>
            Crie empresas, gerencie usuários, controle planos, permissões e
            recursos do Zentra Sales AI.
          </p>
        </section>

        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => setActiveTab("management")}
            style={
              activeTab === "management"
                ? styles.tabActive
                : styles.tab
            }
          >
            Empresas e usuários
          </button>

          {billingAllowed ? (
            <button
              type="button"
              onClick={() => {
                setActiveTab("billing");
                void loadBillingDashboard();
              }}
              style={
                activeTab === "billing"
                  ? styles.tabBillingActive
                  : styles.tab
              }
            >
              💰 Cobranças privadas
            </button>
          ) : null}
        </div>

        {activeTab === "management" ? (
          <>
            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Criar nova empresa</h2>

              <div style={styles.grid2}>
                <input
                  style={styles.input}
                  placeholder="Nome da empresa"
                  value={form.restaurantName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      restaurantName: e.target.value,
                    })
                  }
                />
                <input
                  style={styles.input}
                  placeholder="CNPJ"
                  value={form.document}
                  onChange={(e) =>
                    setForm({ ...form, document: e.target.value })
                  }
                />
                <input
                  style={styles.input}
                  placeholder="Nome do responsável"
                  value={form.ownerName}
                  onChange={(e) =>
                    setForm({ ...form, ownerName: e.target.value })
                  }
                />
                <input
                  style={styles.input}
                  placeholder="E-mail do administrador"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                />
                <input
                  style={styles.input}
                  placeholder="Senha inicial"
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />

                <select
                  style={styles.input}
                  value={form.planId}
                  onChange={(e) =>
                    setForm({ ...form, planId: e.target.value })
                  }
                >
                  <option value="">Selecione o plano</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>

                <input
                  style={styles.input}
                  placeholder="Celular"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                />
                <input
                  style={styles.input}
                  placeholder="WhatsApp da empresa"
                  value={form.whatsapp}
                  onChange={(e) =>
                    setForm({ ...form, whatsapp: e.target.value })
                  }
                />
                <input
                  style={{
                    ...styles.input,
                    gridColumn: "1 / -1",
                  }}
                  placeholder="Contato extra"
                  value={form.extraContact}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extraContact: e.target.value,
                    })
                  }
                />
              </div>

              <button
                onClick={createCompany}
                disabled={loading}
                style={styles.primaryButton}
              >
                {loading ? "Criando..." : "Criar empresa"}
              </button>
            </section>

            <section style={styles.mainGrid}>
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Empresas cadastradas</h2>

                <div style={styles.companyList}>
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => selectCompany(company)}
                      style={{
                        ...styles.companyButton,
                        borderColor:
                          selectedCompany?.id === company.id
                            ? "#2563eb"
                            : "#dbeafe",
                        background:
                          selectedCompany?.id === company.id
                            ? "#eff6ff"
                            : "#ffffff",
                      }}
                    >
                      <div>
                        <strong>{company.name}</strong>
                        <p style={styles.muted}>{company.id}</p>
                        <p style={styles.muted}>
                          Plano: {company.plans?.name || "Sem plano"}
                        </p>
                        <p style={styles.muted}>
                          Valor: {money(company.monthly_value)}
                        </p>
                      </div>

                      <span
                        style={
                          company.active
                            ? styles.activeBadge
                            : styles.pausedBadge
                        }
                      >
                        {company.active ? "Ativa" : "Pausada"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.card}>
                {!selectedCompany ? (
                  <div style={styles.empty}>
                    Selecione uma empresa para gerenciar.
                  </div>
                ) : (
                  <>
                    <div style={styles.headerRow}>
                      <div>
                        <h2 style={styles.sectionTitle}>
                          {selectedCompany.name}
                        </h2>
                        <p style={styles.muted}>{selectedCompany.id}</p>
                      </div>

                      <div style={styles.actions}>
                        <button
                          onClick={() =>
                            updateCompany(selectedCompany.id, {
                              active: !selectedCompany.active,
                              blocked_reason: selectedCompany.active
                                ? "Empresa pausada pelo admin"
                                : null,
                            })
                          }
                          style={
                            selectedCompany.active
                              ? styles.dangerButton
                              : styles.primaryButtonSmall
                          }
                        >
                          {selectedCompany.active ? "Pausar" : "Reativar"}
                        </button>

                        <button
                          onClick={() => deleteCompany(selectedCompany.id)}
                          style={styles.dangerButton}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    <div style={styles.subCard}>
                      <h3 style={styles.subTitle}>Editar empresa</h3>

                      <div style={styles.grid2}>
                        <input
                          style={styles.input}
                          placeholder="Nome da empresa"
                          value={selectedCompany.name || ""}
                          onChange={(e) =>
                            setSelectedCompany({
                              ...selectedCompany,
                              name: e.target.value,
                            })
                          }
                        />

                        <select
                          style={styles.input}
                          value={selectedCompany.plan_id || ""}
                          onChange={(e) =>
                            setSelectedCompany({
                              ...selectedCompany,
                              plan_id: e.target.value,
                            })
                          }
                        >
                          <option value="">Sem plano</option>
                          {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </select>

                        <input
                          style={styles.input}
                          placeholder="Valor mensal"
                          type="number"
                          value={selectedCompany.monthly_value || ""}
                          onChange={(e) =>
                            setSelectedCompany({
                              ...selectedCompany,
                              monthly_value: e.target.value,
                            })
                          }
                        />
                        <input
                          style={styles.input}
                          placeholder="Dia do vencimento"
                          type="number"
                          min={1}
                          max={31}
                          value={selectedCompany.due_day || ""}
                          onChange={(e) =>
                            setSelectedCompany({
                              ...selectedCompany,
                              due_day: e.target.value,
                            })
                          }
                        />

                        <select
                          style={styles.input}
                          value={
                            selectedCompany.payment_method || "PIX"
                          }
                          onChange={(e) =>
                            setSelectedCompany({
                              ...selectedCompany,
                              payment_method: e.target.value,
                            })
                          }
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>

                        <input
                          style={styles.input}
                          placeholder="Observação de cobrança"
                          value={selectedCompany.billing_notes || ""}
                          onChange={(e) =>
                            setSelectedCompany({
                              ...selectedCompany,
                              billing_notes: e.target.value,
                            })
                          }
                        />
                      </div>

                      <button
                        onClick={() =>
                          updateCompany(selectedCompany.id, {
                            name: selectedCompany.name,
                            plan_id: selectedCompany.plan_id,
                            monthly_value:
                              selectedCompany.monthly_value,
                            due_day: selectedCompany.due_day,
                            payment_method:
                              selectedCompany.payment_method,
                            billing_notes:
                              selectedCompany.billing_notes,
                          })
                        }
                        style={styles.primaryButtonSmall}
                      >
                        Salvar empresa
                      </button>
                    </div>

                    <div style={styles.subCard}>
                      <h3 style={styles.subTitle}>Usuários</h3>
                      <p style={styles.muted}>
                        {usersData?.used || 0} de {usersData?.limit || 0}{" "}
                        usuário(s) ativos
                      </p>

                      <div style={styles.grid2}>
                        <input
                          style={styles.input}
                          placeholder="Nome do usuário"
                          value={userForm.name}
                          onChange={(e) =>
                            setUserForm({
                              ...userForm,
                              name: e.target.value,
                            })
                          }
                        />
                        <input
                          style={styles.input}
                          placeholder="E-mail"
                          value={userForm.email}
                          onChange={(e) =>
                            setUserForm({
                              ...userForm,
                              email: e.target.value,
                            })
                          }
                        />
                        <input
                          style={styles.input}
                          placeholder="Telefone"
                          value={userForm.phone}
                          onChange={(e) =>
                            setUserForm({
                              ...userForm,
                              phone: e.target.value,
                            })
                          }
                        />
                        <input
                          style={styles.input}
                          placeholder="Senha inicial"
                          type="password"
                          value={userForm.password}
                          onChange={(e) =>
                            setUserForm({
                              ...userForm,
                              password: e.target.value,
                            })
                          }
                        />

                        <select
                          style={{
                            ...styles.input,
                            gridColumn: "1 / -1",
                          }}
                          value={userForm.role}
                          onChange={(e) =>
                            setUserForm({
                              ...userForm,
                              role: e.target.value,
                            })
                          }
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </div>

                      {billingAllowed ? (
                        <div style={styles.billingInlineBox}>
                          <div style={styles.headerRow}>
                            <div>
                              <strong>Controle financeiro deste usuário</strong>
                              <p style={styles.muted}>
                                Opcional. É privado e não aparece para o usuário.
                              </p>
                            </div>

                            <label style={styles.checkLabel}>
                              <input
                                type="checkbox"
                                checked={newUserBilling.enabled}
                                onChange={(e) =>
                                  setNewUserBilling({
                                    ...newUserBilling,
                                    enabled: e.target.checked,
                                  })
                                }
                              />
                              Criar cobrança
                            </label>
                          </div>

                          {newUserBilling.enabled ? (
                            <div style={styles.grid3}>
                              <input
                                style={styles.input}
                                type="number"
                                step="0.01"
                                placeholder="Mensalidade"
                                value={newUserBilling.monthlyValue}
                                onChange={(e) =>
                                  setNewUserBilling({
                                    ...newUserBilling,
                                    monthlyValue: e.target.value,
                                  })
                                }
                              />
                              <input
                                style={styles.input}
                                type="number"
                                step="0.01"
                                placeholder="Taxa de adesão"
                                value={newUserBilling.signupFee}
                                onChange={(e) =>
                                  setNewUserBilling({
                                    ...newUserBilling,
                                    signupFee: e.target.value,
                                  })
                                }
                              />
                              <input
                                style={styles.input}
                                type="number"
                                min={1}
                                max={31}
                                placeholder="Dia vencimento"
                                value={newUserBilling.dueDay}
                                onChange={(e) =>
                                  setNewUserBilling({
                                    ...newUserBilling,
                                    dueDay: e.target.value,
                                  })
                                }
                              />
                              <select
                                style={styles.input}
                                value={newUserBilling.paymentMethod}
                                onChange={(e) =>
                                  setNewUserBilling({
                                    ...newUserBilling,
                                    paymentMethod: e.target.value,
                                  })
                                }
                              >
                                {PAYMENT_METHODS.map((method) => (
                                  <option key={method} value={method}>
                                    {method}
                                  </option>
                                ))}
                              </select>
                              <select
                                style={styles.input}
                                value={newUserBilling.planStatus}
                                onChange={(e) =>
                                  setNewUserBilling({
                                    ...newUserBilling,
                                    planStatus: e.target.value,
                                  })
                                }
                              >
                                {PLAN_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                              <input
                                style={styles.input}
                                type="date"
                                value={newUserBilling.joinedAt}
                                onChange={(e) =>
                                  setNewUserBilling({
                                    ...newUserBilling,
                                    joinedAt: e.target.value,
                                  })
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <button
                        onClick={createUser}
                        style={styles.primaryButtonSmall}
                      >
                        Criar usuário
                      </button>

                      <div style={styles.userList}>
                        {(usersData?.users || []).map((user: any) => (
                          <div key={user.id} style={styles.userCard}>
                            <div style={styles.headerRow}>
                              <div>
                                <strong>{user.name || "Sem nome"}</strong>
                                <p style={styles.muted}>
                                  {user.email || "Sem e-mail"}
                                </p>
                              </div>

                              <span
                                style={
                                  user.active !== false
                                    ? styles.activeBadge
                                    : styles.pausedBadge
                                }
                              >
                                {user.active !== false ? "Ativo" : "Pausado"}
                              </span>
                            </div>

                            <div style={styles.grid2}>
                              <input
                                style={styles.input}
                                value={user.name || ""}
                                placeholder="Nome"
                                onChange={(e) =>
                                  setUsersData((prev: any) => ({
                                    ...prev,
                                    users: prev.users.map((u: any) =>
                                      u.id === user.id
                                        ? { ...u, name: e.target.value }
                                        : u
                                    ),
                                  }))
                                }
                              />
                              <input
                                style={styles.input}
                                value={user.email || ""}
                                placeholder="E-mail"
                                onChange={(e) =>
                                  setUsersData((prev: any) => ({
                                    ...prev,
                                    users: prev.users.map((u: any) =>
                                      u.id === user.id
                                        ? { ...u, email: e.target.value }
                                        : u
                                    ),
                                  }))
                                }
                              />
                              <input
                                style={styles.input}
                                value={user.phone || ""}
                                placeholder="Telefone"
                                onChange={(e) =>
                                  setUsersData((prev: any) => ({
                                    ...prev,
                                    users: prev.users.map((u: any) =>
                                      u.id === user.id
                                        ? { ...u, phone: e.target.value }
                                        : u
                                    ),
                                  }))
                                }
                              />
                              <input
                                style={styles.input}
                                type="password"
                                value={user.password || ""}
                                placeholder="Nova senha opcional"
                                onChange={(e) =>
                                  setUsersData((prev: any) => ({
                                    ...prev,
                                    users: prev.users.map((u: any) =>
                                      u.id === user.id
                                        ? {
                                            ...u,
                                            password: e.target.value,
                                          }
                                        : u
                                    ),
                                  }))
                                }
                              />

                              <select
                                style={{
                                  ...styles.input,
                                  gridColumn: "1 / -1",
                                }}
                                value={user.role || "representante"}
                                onChange={(e) =>
                                  setUsersData((prev: any) => ({
                                    ...prev,
                                    users: prev.users.map((u: any) =>
                                      u.id === user.id
                                        ? { ...u, role: e.target.value }
                                        : u
                                    ),
                                  }))
                                }
                              >
                                {ROLES.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div style={styles.actions}>
                              <button
                                onClick={() =>
                                  updateUser(user.id, {
                                    name: user.name,
                                    email: user.email,
                                    phone: user.phone,
                                    role: user.role,
                                    password: user.password,
                                  })
                                }
                                style={styles.secondaryButton}
                              >
                                Salvar
                              </button>

                              <button
                                onClick={() =>
                                  updateUser(user.id, {
                                    active:
                                      user.active === false ? true : false,
                                  })
                                }
                                style={
                                  user.active !== false
                                    ? styles.dangerButton
                                    : styles.primaryButtonSmall
                                }
                              >
                                {user.active !== false
                                  ? "Pausar"
                                  : "Reativar"}
                              </button>

                              {billingAllowed ? (
                                <button
                                  onClick={() => {
                                    setBillingCompanyId(selectedCompany.id);
                                    void loadCompanyBilling(
                                      selectedCompany.id
                                    );
                                    setActiveTab("billing");
                                  }}
                                  style={styles.billingButton}
                                >
                                  Cobrança
                                </button>
                              ) : null}

                              <button
                                onClick={() => deleteUser(user.id)}
                                style={styles.dangerButton}
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={styles.subCard}>
                      <h3 style={styles.subTitle}>Liberações temporárias</h3>

                      <div style={styles.grid3}>
                        <select
                          style={styles.input}
                          value={grantForm.feature}
                          onChange={(e) =>
                            setGrantForm({
                              ...grantForm,
                              feature: e.target.value,
                            })
                          }
                        >
                          {Object.keys(FEATURE_LABELS).map((feature) => (
                            <option key={feature} value={feature}>
                              {FEATURE_LABELS[feature]}
                            </option>
                          ))}
                        </select>

                        <input
                          style={styles.input}
                          type="number"
                          min={0}
                          placeholder="Dias"
                          value={grantForm.days}
                          onChange={(e) =>
                            setGrantForm({
                              ...grantForm,
                              days: e.target.value,
                            })
                          }
                        />
                        <input
                          style={styles.input}
                          placeholder="Observação"
                          value={grantForm.notes}
                          onChange={(e) =>
                            setGrantForm({
                              ...grantForm,
                              notes: e.target.value,
                            })
                          }
                        />
                      </div>

                      <button
                        onClick={createGrant}
                        style={styles.primaryButtonSmall}
                      >
                        Liberar funcionalidade
                      </button>

                      {(grantsData?.grants || []).map((grant: any) => (
                        <div key={grant.id} style={styles.userCard}>
                          <strong>
                            {FEATURE_LABELS[grant.feature] || grant.feature}
                          </strong>
                          <p style={styles.muted}>
                            Vencimento: {formatDate(grant.expires_at)}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div style={styles.subCard}>
                      <h3 style={styles.subTitle}>
                        Créditos extras do Radar
                      </h3>

                      <div style={styles.grid2}>
                        <input
                          style={styles.input}
                          type="number"
                          min={1}
                          placeholder="Quantidade de créditos"
                          value={radarForm.contactsExtra}
                          onChange={(e) =>
                            setRadarForm({
                              ...radarForm,
                              contactsExtra: e.target.value,
                            })
                          }
                        />
                        <input
                          style={styles.input}
                          type="number"
                          min={0}
                          placeholder="Dias de validade"
                          value={radarForm.days}
                          onChange={(e) =>
                            setRadarForm({
                              ...radarForm,
                              days: e.target.value,
                            })
                          }
                        />
                      </div>

                      {radarGrants.map((grant: any) => (
                        <div key={grant.id} style={styles.userCard}>
                          <strong>
                            +{grant.contacts_extra} visualizações
                          </strong>
                          <p style={styles.muted}>
                            Vencimento: {formatDate(grant.expires_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "billing" && billingAllowed ? (
          <>
            <section style={styles.billingHero}>
              <div>
                <p style={styles.billingKicker}>Privado • somente master</p>
                <h2 style={styles.billingTitle}>
                  Centro de assinaturas e cobranças
                </h2>
                <p style={styles.heroText}>
                  Controle mensalidade, vencimentos, pagamentos, usuários e
                  quantidade de clientes sem expor esses dados para os usuários.
                </p>
              </div>

              <div style={styles.actionsCompact}>
                <button
                  type="button"
                  onClick={() => void sendBillingTestEmail()}
                  disabled={emailTestLoading}
                  style={styles.billingButton}
                >
                  {emailTestLoading
                    ? "Enviando teste..."
                    : "Enviar e-mail de teste"}
                </button>

                <button
                  type="button"
                  onClick={() => void loadBillingDashboard()}
                  style={styles.secondaryButton}
                >
                  {billingLoading ? "Atualizando..." : "Atualizar"}
                </button>
              </div>
            </section>

            <section style={styles.metricsGrid}>
              <MetricCard
                label="Assinaturas ativas"
                value={String(
                  billingDashboard?.summary?.active_subscriptions || 0
                )}
              />
              <MetricCard
                label="Receita prevista"
                value={money(
                  billingDashboard?.summary?.expected_revenue
                )}
              />
              <MetricCard
                label="Recebido no mês"
                value={money(
                  billingDashboard?.summary?.received_revenue
                )}
                tone="green"
              />
              <MetricCard
                label="Pendente"
                value={money(
                  billingDashboard?.summary?.pending_revenue
                )}
                tone="amber"
              />
              <MetricCard
                label="Vencem amanhã"
                value={String(
                  billingDashboard?.summary?.due_tomorrow || 0
                )}
                tone="amber"
              />
              <MetricCard
                label="Atrasados"
                value={String(
                  billingDashboard?.summary?.overdue || 0
                )}
                tone="red"
              />
            </section>

            <section style={styles.card}>
              <div style={styles.headerRow}>
                <div>
                  <h2 style={styles.sectionTitle}>
                    Controle do mês {billingDashboard?.competence || ""}
                  </h2>
                  <p style={styles.muted}>
                    A mensalidade é recorrente. Você registra apenas quando o
                    pagamento entrar.
                  </p>
                </div>

                <div style={styles.billingFilters}>
                  <input
                    style={{ ...styles.inputCompact, minWidth: 230 }}
                    placeholder="Buscar nome, empresa, e-mail ou WhatsApp..."
                    value={billingSearch}
                    onChange={(e) => setBillingSearch(e.target.value)}
                  />

                  <select
                    style={styles.inputCompact}
                    value={billingDashboardCompanyFilter}
                    onChange={(e) =>
                      setBillingDashboardCompanyFilter(e.target.value)
                    }
                  >
                    <option value="ALL">Todas as empresas</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>

                  <select
                    style={styles.inputCompact}
                    value={billingFilter}
                    onChange={(e) => setBillingFilter(e.target.value)}
                  >
                    <option value="ALL">Todas as situações</option>
                    <option value="PAGO">Pagos</option>
                    <option value="VENCE_AMANHA">Vencem amanhã</option>
                    <option value="VENCE_HOJE">Vencem hoje</option>
                    <option value="ATRASADO">Atrasados</option>
                    <option value="A_VENCER">A vencer</option>
                    <option value="VENCE_EM_ATE_3_DIAS">
                      Vencem em até 3 dias
                    </option>
                    <option value="SUSPENSO">Suspensos</option>
                    <option value="CANCELADO">Cancelados</option>
                  </select>

                  <select
                    style={styles.inputCompact}
                    value={billingPaymentMethodFilter}
                    onChange={(e) =>
                      setBillingPaymentMethodFilter(e.target.value)
                    }
                  >
                    <option value="ALL">Todas as formas</option>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>

                  <select
                    style={styles.inputCompact}
                    value={billingSort}
                    onChange={(e) => setBillingSort(e.target.value)}
                  >
                    <option value="DUE_ASC">Vencimento mais próximo</option>
                    <option value="NAME_ASC">Nome A-Z</option>
                    <option value="COMPANY_ASC">Empresa A-Z</option>
                    <option value="VALUE_DESC">Maior mensalidade</option>
                    <option value="VALUE_ASC">Menor mensalidade</option>
                  </select>

                  <button
                    type="button"
                    style={styles.secondaryButtonTiny}
                    onClick={() => {
                      setBillingSearch("");
                      setBillingDashboardCompanyFilter("ALL");
                      setBillingFilter("ALL");
                      setBillingPaymentMethodFilter("ALL");
                      setBillingSort("DUE_ASC");
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>

              <div style={styles.billingTableWrap}>
                <table style={styles.billingTable}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Usuário</th>
                      <th style={styles.th}>Empresa</th>
                      <th style={styles.th}>Clientes</th>
                      <th style={styles.th}>Mensalidade</th>
                      <th style={styles.th}>Vencimento</th>
                      <th style={styles.th}>Situação</th>
                      <th style={styles.th}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingRows.map((row: any) => (
                      <tr key={row.id}>
                        <td style={styles.td}>
                          <strong>{row.name || "Sem nome"}</strong>
                          <div style={styles.smallMuted}>{row.email}</div>
                          <div style={styles.smallMuted}>{row.phone || "-"}</div>
                        </td>
                        <td style={styles.td}>
                          <strong>{row.company_name}</strong>
                          <div style={styles.smallMuted}>
                            {row.company_users_count} usuário(s)
                          </div>
                        </td>
                        <td style={styles.td}>
                          <strong>{row.clients_count || 0}</strong>
                        </td>
                        <td style={styles.td}>
                          <strong>{money(row.monthly_value)}</strong>
                        </td>
                        <td style={styles.td}>
                          Dia {row.due_day}
                          <div style={styles.smallMuted}>
                            {formatDate(row.due_date)}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.statusBadge,
                              ...alertStyle(row.alert),
                            }}
                          >
                            {alertLabel(row.alert)}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionsCompact}>
                            {row.alert !== "PAGO" &&
                            row.plan_status === "ATIVO" ? (
                              <button
                                type="button"
                                onClick={() => void registerPayment(row)}
                                style={styles.primaryButtonTiny}
                              >
                                Registrar pagamento
                              </button>
                            ) : null}

                            {["VENCE_AMANHA", "VENCE_HOJE", "ATRASADO"].includes(
                              row.alert
                            ) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void copyReminder(row)}
                                  style={styles.secondaryButtonTiny}
                                >
                                  Copiar aviso
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openReminderWhatsApp(row)}
                                  style={styles.whatsappButtonTiny}
                                >
                                  WhatsApp
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!billingRows.length ? (
                      <tr>
                        <td colSpan={7} style={styles.emptyTable}>
                          Nenhuma cobrança encontrada com os filtros atuais.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={styles.notificationBox}>
              <div>
                <strong style={{ fontSize: 15 }}>
                  🔔 Aviso financeiro automático por e-mail
                </strong>
                <p style={styles.muted}>
                  Em produção, o sistema verifica diariamente quem vence amanhã,
                  quem vence hoje e quem está atrasado. O resumo é enviado apenas
                  para o e-mail master configurado.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void sendBillingTestEmail()}
                disabled={emailTestLoading}
                style={styles.billingButton}
              >
                {emailTestLoading
                  ? "Enviando..."
                  : "Testar notificação agora"}
              </button>
            </section>

            <section style={styles.card}>
              <div style={styles.headerRow}>
                <div>
                  <h2 style={styles.sectionTitle}>
                    Cadastro financeiro por usuário
                  </h2>
                  <p style={styles.muted}>
                    Use esta área para cadastrar ou alterar mensalidade,
                    vencimento e histórico de cada usuário.
                  </p>
                </div>

                <select
                  style={styles.inputCompact}
                  value={billingCompanyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setBillingCompanyId(id);
                    void loadCompanyBilling(id);
                  }}
                >
                  <option value="">Selecione a empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.userList}>
                {(companyBilling?.users || []).map((user: any) => {
                  const draft =
                    billingDrafts[user.id] || draftFromUser(user);

                  const liveRow = selectedBillingRow(user.id);

                  return (
                    <div key={user.id} style={styles.billingUserCard}>
                      <div style={styles.headerRow}>
                        <div>
                          <strong style={{ fontSize: 16 }}>
                            {user.name || "Sem nome"}
                          </strong>
                          <p style={styles.muted}>
                            {user.email || "Sem e-mail"} •{" "}
                            {user.phone || "Sem WhatsApp"}
                          </p>
                          <p style={styles.muted}>
                            Clientes no CRM:{" "}
                            <strong>{user.clients_count || 0}</strong>
                          </p>
                        </div>

                        <div style={styles.actions}>
                          <span
                            style={
                              user.active !== false
                                ? styles.activeBadge
                                : styles.pausedBadge
                            }
                          >
                            {user.active !== false
                              ? "Acesso ativo"
                              : "Acesso pausado"}
                          </span>

                          {liveRow ? (
                            <span
                              style={{
                                ...styles.statusBadge,
                                ...alertStyle(liveRow.alert),
                              }}
                            >
                              {alertLabel(liveRow.alert)}
                            </span>
                          ) : (
                            <span style={styles.notConfiguredBadge}>
                              Financeiro não configurado
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={styles.grid3}>
                        <label style={styles.fieldLabel}>
                          Mensalidade
                          <input
                            style={styles.input}
                            type="number"
                            step="0.01"
                            value={draft.monthlyValue}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "monthlyValue",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <label style={styles.fieldLabel}>
                          Taxa de adesão
                          <input
                            style={styles.input}
                            type="number"
                            step="0.01"
                            value={draft.signupFee}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "signupFee",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <label style={styles.fieldLabel}>
                          Dia vencimento
                          <input
                            style={styles.input}
                            type="number"
                            min={1}
                            max={31}
                            value={draft.dueDay}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "dueDay",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <label style={styles.fieldLabel}>
                          Forma de pagamento
                          <select
                            style={styles.input}
                            value={draft.paymentMethod}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "paymentMethod",
                                e.target.value
                              )
                            }
                          >
                            {PAYMENT_METHODS.map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={styles.fieldLabel}>
                          Status do plano
                          <select
                            style={styles.input}
                            value={draft.planStatus}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "planStatus",
                                e.target.value
                              )
                            }
                          >
                            {PLAN_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={styles.fieldLabel}>
                          Data de adesão
                          <input
                            style={styles.input}
                            type="date"
                            value={draft.joinedAt}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "joinedAt",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <label style={styles.fieldLabel}>
                          CPF / CNPJ
                          <input
                            style={styles.input}
                            value={draft.document}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "document",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <label style={styles.fieldLabel}>
                          Endereço
                          <input
                            style={styles.input}
                            value={draft.address}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "address",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <label style={styles.fieldLabel}>
                          Observações
                          <input
                            style={styles.input}
                            value={draft.notes}
                            onChange={(e) =>
                              updateBillingDraft(
                                user.id,
                                "notes",
                                e.target.value
                              )
                            }
                          />
                        </label>
                      </div>

                      <div style={styles.actions}>
                        <button
                          type="button"
                          onClick={() => void saveUserBilling(user)}
                          style={styles.primaryButtonSmall}
                        >
                          Salvar financeiro
                        </button>

                        {liveRow?.alert !== "PAGO" && liveRow?.id ? (
                          <button
                            type="button"
                            onClick={() => void registerPayment(liveRow)}
                            style={styles.billingButton}
                          >
                            Registrar pagamento
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            updateUser(user.id, {
                              active:
                                user.active === false ? true : false,
                            })
                          }
                          style={
                            user.active !== false
                              ? styles.dangerButton
                              : styles.primaryButtonSmall
                          }
                        >
                          {user.active !== false
                            ? "Pausar acesso"
                            : "Reativar acesso"}
                        </button>
                      </div>

                      {user.billing?.payments?.length ? (
                        <div style={styles.historyBox}>
                          <strong>Histórico de pagamentos</strong>

                          <div style={styles.historyList}>
                            {user.billing.payments
                              .slice(0, 10)
                              .map((payment: any) => (
                                <div
                                  key={payment.id}
                                  style={styles.historyRow}
                                >
                                  <div>
                                    <strong>{payment.competence}</strong>
                                    <span style={styles.smallMuted}>
                                      {" "}
                                      • {money(payment.amount)}
                                    </span>
                                  </div>

                                  <div style={styles.actionsCompact}>
                                    <span
                                      style={{
                                        ...styles.statusBadge,
                                        ...(payment.status === "PAGO"
                                          ? alertStyle("PAGO")
                                          : alertStyle("A_VENCER")),
                                      }}
                                    >
                                      {payment.status}
                                    </span>

                                    <span style={styles.smallMuted}>
                                      {formatDateTime(payment.paid_at)}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void removePayment(payment.id)
                                      }
                                      style={styles.linkDangerButton}
                                    >
                                      Remover
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {!companyBilling?.users?.length ? (
                  <div style={styles.empty}>
                    Selecione uma empresa para gerenciar as cobranças.
                  </div>
                ) : null}
              </div>
            </section>

            <section style={styles.securityNote}>
              <strong>Segurança</strong>
              <p style={styles.muted}>
                Senhas definitivas não são armazenadas neste centro financeiro.
                A senha digitada no cadastro continua sendo enviada apenas ao
                Supabase Auth para criação do acesso.
              </p>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const background =
    tone === "green"
      ? "#ecfdf5"
      : tone === "amber"
        ? "#fffbeb"
        : tone === "red"
          ? "#fef2f2"
          : "#eff6ff";

  const color =
    tone === "green"
      ? "#047857"
      : tone === "amber"
        ? "#b45309"
        : tone === "red"
          ? "#b91c1c"
          : "#1d4ed8";

  return (
    <div
      style={{
        ...styles.metricCard,
        background,
      }}
    >
      <span style={styles.metricLabel}>{label}</span>
      <strong style={{ ...styles.metricValue, color }}>{value}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #dbeafe 100%)",
    color: "#0f172a",
    padding: 24,
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: 1280,
    margin: "0 auto",
  },
  hero: {
    background: "linear-gradient(135deg, #ffffff, #dbeafe)",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 28,
    boxShadow: "0 24px 70px rgba(37,99,235,.12)",
  },
  kicker: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: ".22em",
    textTransform: "uppercase",
    margin: 0,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: 900,
    margin: "8px 0",
  },
  heroText: {
    color: "#64748b",
    margin: 0,
    lineHeight: 1.6,
  },
  tabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
    padding: 6,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #dbeafe",
  },
  tab: {
    border: 0,
    borderRadius: 12,
    padding: "11px 16px",
    background: "transparent",
    color: "#64748b",
    fontWeight: 900,
    cursor: "pointer",
  },
  tabActive: {
    border: 0,
    borderRadius: 12,
    padding: "11px 16px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  tabBillingActive: {
    border: 0,
    borderRadius: 12,
    padding: "11px 16px",
    background: "#0f766e",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  card: {
    marginTop: 20,
    background: "#ffffff",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 24,
    boxShadow: "0 18px 50px rgba(37,99,235,.10)",
  },
  subCard: {
    marginTop: 22,
    background: "#f8fafc",
    border: "1px solid #dbeafe",
    borderRadius: 24,
    padding: 20,
  },
  billingInlineBox: {
    margin: "16px 0",
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: 20,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    margin: 0,
  },
  subTitle: {
    fontSize: 18,
    fontWeight: 900,
    margin: "0 0 14px",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, .42fr) minmax(0, .58fr)",
    gap: 20,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "14px 15px",
    color: "#0f172a",
    outline: "none",
    fontSize: 14,
  },
  inputCompact: {
    minWidth: 180,
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "11px 13px",
    color: "#0f172a",
    outline: "none",
    fontSize: 13,
  },
  fieldLabel: {
    display: "grid",
    gap: 6,
    color: "#475569",
    fontSize: 11,
    fontWeight: 900,
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#166534",
    fontSize: 12,
    fontWeight: 900,
  },
  primaryButton: {
    marginTop: 18,
    border: 0,
    borderRadius: 16,
    padding: "15px 22px",
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  primaryButtonSmall: {
    border: 0,
    borderRadius: 14,
    padding: "11px 16px",
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  primaryButtonTiny: {
    border: 0,
    borderRadius: 10,
    padding: "8px 10px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 900,
    fontSize: 11,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #bfdbfe",
    borderRadius: 14,
    padding: "11px 16px",
    background: "#ffffff",
    color: "#2563eb",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButtonTiny: {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 10px",
    background: "#ffffff",
    color: "#475569",
    fontWeight: 900,
    fontSize: 11,
    cursor: "pointer",
  },
  billingButton: {
    border: "1px solid #99f6e4",
    borderRadius: 14,
    padding: "11px 16px",
    background: "#f0fdfa",
    color: "#0f766e",
    fontWeight: 900,
    cursor: "pointer",
  },
  whatsappButtonTiny: {
    border: 0,
    borderRadius: 10,
    padding: "8px 10px",
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: 900,
    fontSize: 11,
    cursor: "pointer",
  },
  dangerButton: {
    border: 0,
    borderRadius: 14,
    padding: "11px 16px",
    background: "#ef4444",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  companyList: {
    display: "grid",
    gap: 12,
    marginTop: 16,
  },
  companyButton: {
    width: "100%",
    border: "1px solid #dbeafe",
    borderRadius: 20,
    padding: 16,
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  muted: {
    color: "#64748b",
    fontSize: 12,
    margin: "4px 0",
  },
  smallMuted: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 3,
  },
  activeBadge: {
    background: "#22c55e",
    color: "#ffffff",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  pausedBadge: {
    background: "#ef4444",
    color: "#ffffff",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  notConfiguredBadge: {
    background: "#f1f5f9",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 900,
  },
  empty: {
    border: "1px dashed #bfdbfe",
    borderRadius: 24,
    padding: 32,
    textAlign: "center",
    color: "#64748b",
  },
  emptyTable: {
    padding: 30,
    textAlign: "center",
    color: "#64748b",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  actionsCompact: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  userList: {
    display: "grid",
    gap: 12,
    marginTop: 18,
  },
  userCard: {
    background: "#ffffff",
    border: "1px solid #dbeafe",
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
  },
  billingHero: {
    marginTop: 20,
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    flexWrap: "wrap",
    background:
      "linear-gradient(135deg, #ecfdf5 0%, #ffffff 55%, #eff6ff 100%)",
    border: "1px solid #a7f3d0",
    borderRadius: 28,
    padding: 24,
    boxShadow: "0 18px 50px rgba(5,150,105,.10)",
  },
  billingKicker: {
    color: "#047857",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: ".18em",
    textTransform: "uppercase",
    margin: 0,
  },
  billingTitle: {
    fontSize: 28,
    fontWeight: 900,
    margin: "6px 0 8px",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
    marginTop: 18,
  },
  metricCard: {
    minHeight: 104,
    border: "1px solid rgba(148,163,184,.25)",
    borderRadius: 22,
    padding: 18,
    display: "grid",
    alignContent: "space-between",
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: ".05em",
  },
  metricValue: {
    fontSize: 26,
    fontWeight: 950,
    letterSpacing: "-.03em",
  },
  billingFilters: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  billingTableWrap: {
    marginTop: 18,
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: 18,
  },
  billingTable: {
    width: "100%",
    minWidth: 980,
    borderCollapse: "collapse",
    background: "#ffffff",
  },
  th: {
    textAlign: "left",
    padding: 12,
    fontSize: 10,
    textTransform: "uppercase",
    color: "#64748b",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },
  td: {
    padding: 12,
    verticalAlign: "top",
    fontSize: 12,
    borderBottom: "1px solid #f1f5f9",
  },
  statusBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "6px 9px",
    fontSize: 10,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  billingUserCard: {
    background: "#ffffff",
    border: "1px solid #dbeafe",
    borderRadius: 24,
    padding: 18,
  },
  historyBox: {
    marginTop: 16,
    borderTop: "1px solid #e2e8f0",
    paddingTop: 14,
  },
  historyList: {
    display: "grid",
    gap: 7,
    marginTop: 10,
  },
  historyRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    background: "#f8fafc",
    borderRadius: 12,
    padding: "9px 11px",
  },
  linkDangerButton: {
    border: 0,
    background: "transparent",
    color: "#dc2626",
    fontSize: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  notificationBox: {
    marginTop: 18,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    border: "1px solid #a7f3d0",
    borderRadius: 20,
    background: "#f0fdf4",
    padding: 18,
  },
  securityNote: {
    marginTop: 18,
    border: "1px solid #cbd5e1",
    borderRadius: 18,
    background: "#f8fafc",
    padding: 16,
  },
};

