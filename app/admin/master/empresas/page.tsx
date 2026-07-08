"use client";

import { useEffect, useState } from "react";

const ROLES = ["geral", "supervisor", "vendedor"];

const PAYMENT_METHODS = ["PIX", "CREDITO", "DEBITO", "BOLETO"];

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
  if (!value) return "Sem vencimento";
  return new Date(value).toLocaleDateString("pt-BR");
}

export default function MasterCompaniesPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [usersData, setUsersData] = useState<any>(null);
  const [grantsData, setGrantsData] = useState<any>(null);
  const [radarGrants, setRadarGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      const res = await fetch("/api/admin/companies/create", { cache: "no-store" });
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
    const res = await fetch("/api/admin/companies", { cache: "no-store" });
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
    const res = await fetch(`/api/admin/feature-grants?companyId=${companyId}`, {
      cache: "no-store",
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      setGrantsData({ grants: [] });
      return;
    }

    setGrantsData(data);
  }

  async function loadRadarGrants(companyId: string) {
    const res = await fetch(`/api/admin/radar-grants?companyId=${companyId}`, {
      cache: "no-store",
    });

    const data: any = await readJsonSafe(res);

    if (!res.ok) {
      setRadarGrants([]);
      return;
    }

    setRadarGrants(data.grants || []);
  }

  useEffect(() => {
    loadPlans();
    loadCompanies();
  }, []);

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
    if (!confirm("Excluir empresa definitivamente? Essa ação não pode ser desfeita.")) {
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

    setUserForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      role: "vendedor",
    });

    await loadUsers(selectedCompany.id);
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
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <section style={styles.hero}>
          <p style={styles.kicker}>Zentra Sales AI Master</p>
          <h1 style={styles.heroTitle}>Empresas e Usuários</h1>
          <p style={styles.heroText}>
            Crie empresas, gerencie usuários, controle planos, permissões e recursos do Zentra Sales AI.
          </p>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Criar nova empresa</h2>

          <div style={styles.grid2}>
            <input style={styles.input} placeholder="Nome da empresa" value={form.restaurantName} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} />
            <input style={styles.input} placeholder="CNPJ" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
            <input style={styles.input} placeholder="Nome do responsável" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            <input style={styles.input} placeholder="E-mail do administrador" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input style={styles.input} placeholder="Senha inicial" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

            <select style={styles.input} value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              <option value="">Selecione o plano</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>

            <input style={styles.input} placeholder="Celular" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input style={styles.input} placeholder="WhatsApp da empresa" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            <input style={{ ...styles.input, gridColumn: "1 / -1" }} placeholder="Contato extra" value={form.extraContact} onChange={(e) => setForm({ ...form, extraContact: e.target.value })} />
          </div>

          <button onClick={createCompany} disabled={loading} style={styles.primaryButton}>
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
                    borderColor: selectedCompany?.id === company.id ? "#2563eb" : "#dbeafe",
                    background: selectedCompany?.id === company.id ? "#eff6ff" : "#ffffff",
                  }}
                >
                  <div>
                    <strong>{company.name}</strong>
                    <p style={styles.muted}>{company.id}</p>
                    <p style={styles.muted}>Plano: {company.plans?.name || "Sem plano"}</p>
                    <p style={styles.muted}>Valor: {money(company.monthly_value)}</p>
                  </div>

                  <span style={company.active ? styles.activeBadge : styles.pausedBadge}>
                    {company.active ? "Ativa" : "Pausada"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={styles.card}>
            {!selectedCompany ? (
              <div style={styles.empty}>Selecione uma empresa para gerenciar.</div>
            ) : (
              <>
                <div style={styles.headerRow}>
                  <div>
                    <h2 style={styles.sectionTitle}>{selectedCompany.name}</h2>
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
                      style={selectedCompany.active ? styles.dangerButton : styles.primaryButtonSmall}
                    >
                      {selectedCompany.active ? "Pausar" : "Reativar"}
                    </button>

                    <button onClick={() => deleteCompany(selectedCompany.id)} style={styles.dangerButton}>
                      Excluir
                    </button>
                  </div>
                </div>

                <div style={styles.subCard}>
                  <h3 style={styles.subTitle}>Editar empresa</h3>

                  <div style={styles.grid2}>
                    <input style={styles.input} placeholder="Nome da empresa" value={selectedCompany.name || ""} onChange={(e) => setSelectedCompany({ ...selectedCompany, name: e.target.value })} />

                    <select style={styles.input} value={selectedCompany.plan_id || ""} onChange={(e) => setSelectedCompany({ ...selectedCompany, plan_id: e.target.value })}>
                      <option value="">Sem plano</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name}</option>
                      ))}
                    </select>

                    <input style={styles.input} placeholder="Valor mensal" type="number" value={selectedCompany.monthly_value || ""} onChange={(e) => setSelectedCompany({ ...selectedCompany, monthly_value: e.target.value })} />
                    <input style={styles.input} placeholder="Dia do vencimento" type="number" min={1} max={31} value={selectedCompany.due_day || ""} onChange={(e) => setSelectedCompany({ ...selectedCompany, due_day: e.target.value })} />

                    <select style={styles.input} value={selectedCompany.payment_method || "PIX"} onChange={(e) => setSelectedCompany({ ...selectedCompany, payment_method: e.target.value })}>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>

                    <input style={styles.input} placeholder="Observação de cobrança" value={selectedCompany.billing_notes || ""} onChange={(e) => setSelectedCompany({ ...selectedCompany, billing_notes: e.target.value })} />
                  </div>

                  <button
                    onClick={() =>
                      updateCompany(selectedCompany.id, {
                        name: selectedCompany.name,
                        plan_id: selectedCompany.plan_id,
                        monthly_value: selectedCompany.monthly_value,
                        due_day: selectedCompany.due_day,
                        payment_method: selectedCompany.payment_method,
                        billing_notes: selectedCompany.billing_notes,
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
                    {usersData?.used || 0} de {usersData?.limit || 0} usuário(s) ativos
                  </p>

                  <div style={styles.grid2}>
                    <input style={styles.input} placeholder="Nome do usuário" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                    <input style={styles.input} placeholder="E-mail" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                    <input style={styles.input} placeholder="Telefone" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
                    <input style={styles.input} placeholder="Senha inicial" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />

                    <select style={{ ...styles.input, gridColumn: "1 / -1" }} value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>

                  <button onClick={createUser} style={styles.primaryButtonSmall}>
                    Criar usuário
                  </button>

                  <div style={styles.userList}>
                    {(usersData?.users || []).map((user: any) => (
                      <div key={user.id} style={styles.userCard}>
                        <div style={styles.headerRow}>
                          <div>
                            <strong>{user.name || "Sem nome"}</strong>
                            <p style={styles.muted}>{user.email || "Sem e-mail"}</p>
                          </div>

                          <span style={user.active !== false ? styles.activeBadge : styles.pausedBadge}>
                            {user.active !== false ? "Ativo" : "Pausado"}
                          </span>
                        </div>

                        <div style={styles.grid2}>
                          <input style={styles.input} value={user.name || ""} placeholder="Nome" onChange={(e) => setUsersData((prev: any) => ({ ...prev, users: prev.users.map((u: any) => u.id === user.id ? { ...u, name: e.target.value } : u) }))} />
                          <input style={styles.input} value={user.email || ""} placeholder="E-mail" onChange={(e) => setUsersData((prev: any) => ({ ...prev, users: prev.users.map((u: any) => u.id === user.id ? { ...u, email: e.target.value } : u) }))} />
                          <input style={styles.input} value={user.phone || ""} placeholder="Telefone" onChange={(e) => setUsersData((prev: any) => ({ ...prev, users: prev.users.map((u: any) => u.id === user.id ? { ...u, phone: e.target.value } : u) }))} />
                          <input style={styles.input} type="password" value={user.password || ""} placeholder="Nova senha opcional" onChange={(e) => setUsersData((prev: any) => ({ ...prev, users: prev.users.map((u: any) => u.id === user.id ? { ...u, password: e.target.value } : u) }))} />

                          <select style={{ ...styles.input, gridColumn: "1 / -1" }} value={user.role || "representante"} onChange={(e) => setUsersData((prev: any) => ({ ...prev, users: prev.users.map((u: any) => u.id === user.id ? { ...u, role: e.target.value } : u) }))}>
                            {ROLES.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </div>

                        <div style={styles.actions}>
                          <button onClick={() => updateUser(user.id, { name: user.name, email: user.email, phone: user.phone, role: user.role, password: user.password })} style={styles.secondaryButton}>
                            Salvar
                          </button>

                          <button onClick={() => updateUser(user.id, { active: user.active === false ? true : false })} style={user.active !== false ? styles.dangerButton : styles.primaryButtonSmall}>
                            {user.active !== false ? "Pausar" : "Reativar"}
                          </button>

                          <button onClick={() => deleteUser(user.id)} style={styles.dangerButton}>
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
                    <select style={styles.input} value={grantForm.feature} onChange={(e) => setGrantForm({ ...grantForm, feature: e.target.value })}>
                      {Object.keys(FEATURE_LABELS).map((feature) => (
                        <option key={feature} value={feature}>{FEATURE_LABELS[feature]}</option>
                      ))}
                    </select>

                    <input style={styles.input} type="number" min={0} placeholder="Dias" value={grantForm.days} onChange={(e) => setGrantForm({ ...grantForm, days: e.target.value })} />
                    <input style={styles.input} placeholder="Observação" value={grantForm.notes} onChange={(e) => setGrantForm({ ...grantForm, notes: e.target.value })} />
                  </div>

                  <button onClick={createGrant} style={styles.primaryButtonSmall}>
                    Liberar funcionalidade
                  </button>

                  {(grantsData?.grants || []).map((grant: any) => (
                    <div key={grant.id} style={styles.userCard}>
                      <strong>{FEATURE_LABELS[grant.feature] || grant.feature}</strong>
                      <p style={styles.muted}>Vencimento: {formatDate(grant.expires_at)}</p>
                    </div>
                  ))}
                </div>

                <div style={styles.subCard}>
                  <h3 style={styles.subTitle}>Créditos extras do Radar</h3>

                  <div style={styles.grid2}>
                    <input style={styles.input} type="number" min={1} placeholder="Quantidade de créditos" value={radarForm.contactsExtra} onChange={(e) => setRadarForm({ ...radarForm, contactsExtra: e.target.value })} />
                    <input style={styles.input} type="number" min={0} placeholder="Dias de validade" value={radarForm.days} onChange={(e) => setRadarForm({ ...radarForm, days: e.target.value })} />
                  </div>

                  {radarGrants.map((grant: any) => (
                    <div key={grant.id} style={styles.userCard}>
                      <strong>+{grant.contacts_extra} visualizações</strong>
                      <p style={styles.muted}>Vencimento: {formatDate(grant.expires_at)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #dbeafe 100%)",
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
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "0.42fr 0.58fr",
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
  secondaryButton: {
    border: "1px solid #bfdbfe",
    borderRadius: 14,
    padding: "11px 16px",
    background: "#ffffff",
    color: "#2563eb",
    fontWeight: 900,
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
  activeBadge: {
    background: "#22c55e",
    color: "#ffffff",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
  },
  pausedBadge: {
    background: "#ef4444",
    color: "#ffffff",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
  },
  empty: {
    border: "1px dashed #bfdbfe",
    borderRadius: 24,
    padding: 32,
    textAlign: "center",
    color: "#64748b",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
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
};