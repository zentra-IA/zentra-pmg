"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type IconName =
  | "kanban"
  | "users"
  | "target"
  | "message"
  | "megaphone"
  | "mail"
  | "spark"
  | "chart"
  | "orders"
  | "quote"
  | "goal"
  | "bot"
  | "phone"
  | "settings"
  | "menu"
  | "close"
  | "external";

type MenuItem = {
  label: string;
  href: string;
  icon: IconName;
  description?: string;
  external?: boolean;
};

const ADMIN_USERS = ["geral"];

const FULL_MENU: MenuItem[] = [
  { label: "Painel Comercial IA", href: "/crm/dashboard/assistant", icon: "bot", description: "Seu dia comercial" },
  { label: "Central Supervisor", href: "/crm/dashboard/supervisor", icon: "chart", description: "Comando da equipe" },
  { label: "Kanban Comercial", href: "/crm/dashboard", icon: "kanban", description: "Pipeline de vendas" },
  { label: "Disparo de Mensagens", href: "/crm/dashboard/contacts", icon: "megaphone", description: "Importação e envios" },
  { label: "Clientes", href: "/crm/dashboard/customers", icon: "users", description: "Carteira comercial" },
  { label: "Radar Comercial", href: "/crm/dashboard/radar", icon: "target", description: "Prospecção inteligente" },
  { label: "Inbox WhatsApp", href: "/crm/dashboard/inbox", icon: "message", description: "Atendimento" },
  { label: "Campanhas", href: "/crm/dashboard/campaigns", icon: "megaphone", description: "Disparos e automações" },
  { label: "Mensagens IA", href: "/crm/dashboard/messages", icon: "mail", description: "Templates comerciais" },
  { label: "Conteúdo IA", href: "/crm/dashboard/creative-generator", icon: "spark", description: "Criativos e textos" },
  { label: "BI Comercial", href: "/crm/dashboard/bi", icon: "chart", description: "Indicadores gerenciais" },
  { label: "Pedidos", href: "/crm/dashboard/orders", icon: "orders", description: "Espelhos e histórico" },
  { label: "Cotações IA", href: "/crm/dashboard/quotes", icon: "quote", description: "Cotador PMG integrado" },
  { label: "Catálogo PMG", href: "/crm/dashboard/quotes/catalog", icon: "settings", description: "Base de produtos e preços" },
  { label: "Metas", href: "/crm/dashboard/goals", icon: "goal", description: "Performance" },
  { label: "WhatsApp QR", href: "/crm/whatsapp", icon: "phone", description: "Conexão" },
];

const SELLER_MENU: MenuItem[] = [
  { label: "Painel Comercial IA", href: "/crm/dashboard/assistant", icon: "bot", description: "Seu dia comercial" },
  { label: "Kanban Comercial", href: "/crm/dashboard", icon: "kanban", description: "Pipeline de vendas" },
  { label: "Disparo de Mensagens", href: "/crm/dashboard/contacts", icon: "megaphone", description: "Importação e envios" },
  { label: "Clientes", href: "/crm/dashboard/customers", icon: "users", description: "Carteira comercial" },
  { label: "Radar Comercial", href: "/crm/dashboard/radar", icon: "target", description: "Prospecção inteligente" },
  { label: "Inbox WhatsApp", href: "/crm/dashboard/inbox", icon: "message", description: "Atendimento" },
  { label: "Campanhas", href: "/crm/dashboard/campaigns", icon: "megaphone", description: "Disparos e automações" },
  { label: "Mensagens IA", href: "/crm/dashboard/messages", icon: "mail", description: "Templates comerciais" },
  { label: "Conteúdo IA", href: "/crm/dashboard/creative-generator", icon: "spark", description: "Criativos e textos" },
  { label: "Pedidos", href: "/crm/dashboard/orders", icon: "orders", description: "Espelhos e histórico" },
  { label: "WhatsApp QR", href: "/crm/whatsapp", icon: "phone", description: "Conexão" },
];

const SUPERVISOR_MENU: MenuItem[] = [
  { label: "Central Supervisor", href: "/crm/dashboard/supervisor", icon: "chart", description: "Comando da equipe" },
];

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getMenuByUser(username?: string | null, role?: string | null) {
  const normalizedUsername = normalizeText(username);
  const normalizedRole = normalizeText(role);

  if (
    ADMIN_USERS.includes(normalizedUsername) ||
    ["geral", "admin", "master", "owner"].includes(normalizedRole)
  ) {
    return FULL_MENU;
  }

  if (
    normalizedRole === "supervisor" ||
    normalizedUsername.includes("supervisor")
  ) {
    return SUPERVISOR_MENU;
  }

  return SELLER_MENU;
}

function getLoggedUsernameFromStorage() {
  if (typeof window === "undefined") return "";

  const directKeys = [
    "username",
    "userName",
    "name",
    "user_name",
    "zentra_username",
    "zentra_user_name",
  ];

  for (const key of directKeys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }

  const jsonKeys = ["user", "profile", "session", "zentra_user"];

  for (const key of jsonKeys) {
    const value = window.localStorage.getItem(key);
    if (!value) continue;

    try {
      const parsed = JSON.parse(value);
      const possibleName =
        parsed?.username ||
        parsed?.userName ||
        parsed?.name ||
        parsed?.login ||
        parsed?.email ||
        parsed?.user?.username ||
        parsed?.user?.name ||
        parsed?.user?.email;

      if (possibleName) return String(possibleName);
    } catch {
      continue;
    }
  }

  return "";
}

function getLoggedRoleFromStorage() {
  if (typeof window === "undefined") return "";

  const directKeys = [
    "role",
    "user_role",
    "userRole",
    "profile_role",
    "zentra_user_role",
    "zentra_role",
  ];

  for (const key of directKeys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }

  const jsonKeys = ["user", "profile", "session", "zentra_user"];

  for (const key of jsonKeys) {
    const value = window.localStorage.getItem(key);
    if (!value) continue;

    try {
      const parsed = JSON.parse(value);
      const possibleRole =
        parsed?.role ||
        parsed?.userRole ||
        parsed?.profile_role ||
        parsed?.user?.role ||
        parsed?.user?.userRole ||
        parsed?.companyUser?.role ||
        parsed?.membership?.role;

      if (possibleRole) return String(possibleRole);
    } catch {
      continue;
    }
  }

  return "";
}

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const icons: Record<IconName, ReactNode> = {
    kanban: (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M8 8v8M16 8v8" />
      </svg>
    ),
    users: (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    target: (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </svg>
    ),
    message: (
      <svg {...common}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    ),
    megaphone: (
      <svg {...common}>
        <path d="M3 11v2a2 2 0 0 0 2 2h2l4 5v-5h3l7 3V6l-7 3H5a2 2 0 0 0-2 2z" />
        <path d="M14 9v6" />
      </svg>
    ),
    mail: (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
    spark: (
      <svg {...common}>
        <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
        <path d="M19 15l.8 2.7L22 18.5l-2.2.8L19 22l-.8-2.7-2.2-.8 2.2-.8z" />
      </svg>
    ),
    chart: (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5" />
        <path d="M12 16V8" />
        <path d="M16 16v-3" />
      </svg>
    ),
    orders: (
      <svg {...common}>
        <path d="M8 2h8l3 3v17H5V5z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
    quote: (
      <svg {...common}>
        <path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
        <path d="M8 7h7M8 11h8M8 15h5" />
      </svg>
    ),
    goal: (
      <svg {...common}>
        <path d="M12 3v18" />
        <path d="M7 6h10l-2 4 2 4H7" />
      </svg>
    ),
    bot: (
      <svg {...common}>
        <rect x="5" y="8" width="14" height="11" rx="3" />
        <path d="M12 8V4" />
        <circle cx="9" cy="13" r="1" />
        <circle cx="15" cy="13" r="1" />
        <path d="M10 17h4" />
      </svg>
    ),
    phone: (
      <svg {...common}>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
    ),
    settings: (
      <svg {...common}>
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.64V21a2 2 0 1 1-4 0v-.09a1.8 1.8 0 0 0-1-1.64 1.8 1.8 0 0 0-2 .36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.64-1H3a2 2 0 1 1 0-4h.09a1.8 1.8 0 0 0 1.64-1 1.8 1.8 0 0 0-.36-2l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 2 .36H9.3a1.8 1.8 0 0 0 1-1.64V3a2 2 0 1 1 4 0v.09a1.8 1.8 0 0 0 1 1.64h.1a1.8 1.8 0 0 0 2-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 2v.1a1.8 1.8 0 0 0 1.64 1H21a2 2 0 1 1 0 4h-.09a1.8 1.8 0 0 0-1.51.7z" />
      </svg>
    ),
    menu: (
      <svg {...common}>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
    close: (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
    external: (
      <svg {...common}>
        <path d="M14 3h7v7" />
        <path d="M10 14 21 3" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </svg>
    ),
  };

  return icons[name];
}

function isActive(pathname: string, href: string) {
  if (href === "/crm/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getPageTitle(pathname: string, menu: MenuItem[]) {
  const current = menu.find((item) => isActive(pathname, item.href));
  return current?.label ?? "Zentra Sales AI";
}

export default function CrmDashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    setUsername(getLoggedUsernameFromStorage());
    setRole(getLoggedRoleFromStorage());
  }, []);

  const menu = useMemo(() => getMenuByUser(username, role), [username, role]);
  const title = useMemo(() => getPageTitle(pathname, menu), [pathname, menu]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("pmg-menu-open", open);
    return () => document.body.classList.remove("pmg-menu-open");
  }, [open]);

  return (
    <div className={`pmg-shell ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="pmg-mobile-menu"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
      >
        <Icon name="menu" />
      </button>

      {open && (
        <button
          type="button"
          className="pmg-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <aside className={`pmg-sidebar ${open ? "open" : ""}`}>
        <div className="pmg-sidebar-head">
          <Link href="/crm/dashboard/assistant" className="pmg-brand">
            <div className="pmg-brand-mark">
              <span>PMG</span>
            </div>
            <div className="pmg-brand-text">
              <strong>Zentra Sales AI</strong>
              <small>PMG Atacadista</small>
            </div>
          </Link>

          <button
            type="button"
            className="pmg-sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="pmg-company-card">
          <span className="pmg-live-dot" />
          <div>
            <strong>Operação comercial ativa</strong>
            <small>CRM, WhatsApp e IA conectados</small>
          </div>
        </div>

        <nav className="pmg-nav" aria-label="Menu principal">
          {menu.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`pmg-nav-item ${active ? "active" : ""}`}
                title={item.description}
              >
                <span className="pmg-nav-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="pmg-nav-label">
                  <b>{item.label}</b>
                  <small>{item.description}</small>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="pmg-sidebar-footer">
          <Link href="/crm/dashboard/quotes" className="pmg-cotador">
            <span className="pmg-cotador-icon">
              <Icon name="quote" />
            </span>
            <span>
              <b>Abrir Cotador IA</b>
              <small>Módulo integrado ao Zentra</small>
            </span>
          </Link>

          <div className="pmg-ai-box">
            <div className="pmg-ai-icon">
              <Icon name="bot" />
            </div>
            <div>
              <strong>IA Comercial</strong>
              <p>Recomendações, alertas e oportunidades para a equipe.</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="pmg-main">
        <header className="pmg-topbar">
          <button
            type="button"
            className="pmg-sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            title={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          >
            <Icon name="menu" />
          </button>

          <div className="pmg-topbar-title">
            <span className="pmg-eyebrow">Zentra Sales AI</span>
            <h1>{title}</h1>
          </div>

          <div className="pmg-topbar-actions">
            <Link href="/crm/dashboard/assistant" className="pmg-btn pmg-btn-light">
              <Icon name="bot" />
              <span>Painel IA</span>
            </Link>

            <Link href="/crm/dashboard/quotes" className="pmg-btn pmg-btn-primary">
              <span>Cotador IA</span>
              <Icon name="quote" />
            </Link>
          </div>
        </header>

        <main className="pmg-page">{children}</main>
      </section>

      <style jsx global>{`
        :root {
          --pmg-bg: #f6f7f9;
          --pmg-surface: #ffffff;
          --pmg-surface-2: #fbfcfd;
          --pmg-border: #e6e9ee;
          --pmg-text: #17202e;
          --pmg-muted: #6b7280;
          --pmg-soft: #f0fdf4;
          --pmg-green: #15803d;
          --pmg-green-2: #16a34a;
          --pmg-green-soft: #dcfce7;
          --pmg-red: #dc2626;
          --pmg-red-soft: #fee2e2;
          --pmg-shadow: 0 18px 55px rgba(15, 23, 42, 0.08);
          --pmg-shadow-sm: 0 8px 24px rgba(15, 23, 42, 0.07);
          --pmg-radius: 18px;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          min-height: 100%;
          background: var(--pmg-bg);
          color: var(--pmg-text);
        }

        body {
          margin: 0;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        a {
          color: inherit;
        }

        .pmg-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 272px minmax(0, 1fr);
          background:
            radial-gradient(circle at 10% 0%, rgba(22, 163, 74, 0.08), transparent 28%),
            radial-gradient(circle at 90% 0%, rgba(220, 38, 38, 0.06), transparent 26%),
            var(--pmg-bg);
          transition: grid-template-columns 220ms ease;
        }

        .pmg-shell.collapsed {
          grid-template-columns: 72px minmax(0, 1fr);
        }

        .pmg-sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: max(18px, env(safe-area-inset-top)) 14px 18px 14px;
          background: rgba(255, 255, 255, 0.92);
          border-right: 1px solid var(--pmg-border);
          box-shadow: 12px 0 38px rgba(15, 23, 42, 0.04);
          backdrop-filter: blur(18px);
          z-index: 40;
        }

        .pmg-sidebar-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pmg-brand {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          color: var(--pmg-text);
          text-decoration: none;
          border-radius: 18px;
        }

        .pmg-brand-mark {
          width: 46px;
          height: 46px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 15px;
          color: white;
          background: linear-gradient(135deg, var(--pmg-green), #0f5132);
          box-shadow: 0 14px 26px rgba(21, 128, 61, 0.22);
          position: relative;
          overflow: hidden;
        }

        .pmg-brand-mark::after {
          content: "";
          position: absolute;
          right: -14px;
          bottom: -14px;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          background: rgba(220, 38, 38, 0.88);
        }

        .pmg-brand-mark span {
          position: relative;
          z-index: 1;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: -0.04em;
        }

        .pmg-brand-text {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .pmg-brand-text strong {
          font-size: 15px;
          line-height: 1.1;
          font-weight: 850;
          letter-spacing: -0.04em;
        }

        .pmg-brand-text small {
          color: var(--pmg-muted);
          font-size: 12px;
          font-weight: 650;
        }

        .pmg-sidebar-close,
        .pmg-mobile-menu {
          appearance: none;
          border: 0;
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          color: var(--pmg-text);
          background: var(--pmg-surface);
          border: 1px solid var(--pmg-border);
          border-radius: 14px;
          width: 42px;
          height: 42px;
          box-shadow: var(--pmg-shadow-sm);
        }

        .pmg-sidebar-toggle {
          appearance: none;
          border: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--pmg-text);
          background: var(--pmg-surface);
          border: 1px solid var(--pmg-border);
          border-radius: 14px;
          width: 42px;
          height: 42px;
          box-shadow: var(--pmg-shadow-sm);
          flex: 0 0 auto;
        }

        .pmg-sidebar-toggle:hover {
          color: var(--pmg-green);
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .pmg-topbar-title {
          min-width: 0;
          margin-right: auto;
        }

        .pmg-shell.collapsed .pmg-sidebar {
          align-items: center;
          padding-left: 10px;
          padding-right: 10px;
        }

        .pmg-shell.collapsed .pmg-sidebar-head {
          justify-content: center;
        }

        .pmg-shell.collapsed .pmg-brand {
          padding: 6px;
        }

        .pmg-shell.collapsed .pmg-brand-text,
        .pmg-shell.collapsed .pmg-company-card,
        .pmg-shell.collapsed .pmg-nav-label,
        .pmg-shell.collapsed .pmg-ai-box,
        .pmg-shell.collapsed .pmg-cotador span:not(.pmg-cotador-icon) {
          display: none;
        }

        .pmg-shell.collapsed .pmg-nav-item {
          width: 52px;
          justify-content: center;
          padding: 8px;
        }

        .pmg-shell.collapsed .pmg-nav-item::before {
          display: none;
        }

        .pmg-shell.collapsed .pmg-cotador {
          width: 52px;
          justify-content: center;
        }

        .pmg-company-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border: 1px solid #dff3e6;
          border-radius: 16px;
          background: linear-gradient(180deg, #ffffff, #f6fff9);
        }

        .pmg-live-dot {
          width: 10px;
          height: 10px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: var(--pmg-green-2);
          box-shadow: 0 0 0 5px rgba(22, 163, 74, 0.12);
        }

        .pmg-company-card strong {
          display: block;
          font-size: 12px;
          font-weight: 850;
          color: #166534;
        }

        .pmg-company-card small {
          display: block;
          margin-top: 1px;
          font-size: 11px;
          color: #4b5563;
          font-weight: 650;
        }

        .pmg-nav {
          display: grid;
          gap: 4px;
          overflow-y: auto;
          padding: 2px 2px 10px;
          scrollbar-width: thin;
          scrollbar-color: #d1d5db transparent;
        }

        .pmg-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 48px;
          padding: 8px 10px;
          color: #374151;
          text-decoration: none;
          border-radius: 15px;
          border: 1px solid transparent;
          transition:
            background 160ms ease,
            color 160ms ease,
            border-color 160ms ease,
            transform 160ms ease,
            box-shadow 160ms ease;
          position: relative;
        }

        .pmg-nav-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 10px;
          bottom: 10px;
          width: 3px;
          border-radius: 999px;
          background: transparent;
        }

        .pmg-nav-item:hover {
          background: #f9fafb;
          border-color: var(--pmg-border);
          transform: translateX(2px);
        }

        .pmg-nav-item.active {
          color: var(--pmg-green);
          background: var(--pmg-green-soft);
          border-color: #bbf7d0;
          box-shadow: 0 10px 22px rgba(21, 128, 61, 0.08);
        }

        .pmg-nav-item.active::before {
          background: var(--pmg-green);
        }

        .pmg-nav-icon {
          width: 36px;
          height: 36px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          color: #667085;
          background: #f4f6f8;
          border-radius: 13px;
          border: 1px solid #edf0f3;
        }

        .pmg-nav-item.active .pmg-nav-icon {
          color: var(--pmg-green);
          background: #ffffff;
          border-color: #bbf7d0;
        }

        .pmg-nav-label {
          min-width: 0;
          display: grid;
          gap: 1px;
        }

        .pmg-nav-label b {
          font-size: 13px;
          font-weight: 780;
          line-height: 1.1;
          letter-spacing: -0.01em;
        }

        .pmg-nav-label small {
          color: var(--pmg-muted);
          font-size: 10.5px;
          font-weight: 620;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pmg-sidebar-footer {
          margin-top: auto;
          display: grid;
          gap: 10px;
        }

        .pmg-cotador {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 54px;
          padding: 10px;
          color: #fff;
          text-decoration: none;
          border-radius: 16px;
          background: var(--pmg-green);
          box-shadow: 0 14px 24px rgba(21, 128, 61, 0.2);
          transition: 160ms ease;
        }

        .pmg-cotador:hover {
          background: #166534;
          transform: translateY(-1px);
        }

        .pmg-cotador-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.16);
        }

        .pmg-cotador b,
        .pmg-cotador small {
          display: block;
        }

        .pmg-cotador b {
          font-size: 13px;
          font-weight: 850;
        }

        .pmg-cotador small {
          font-size: 11px;
          opacity: 0.86;
          font-weight: 650;
        }

        .pmg-ai-box {
          display: flex;
          gap: 10px;
          padding: 12px;
          border-radius: 16px;
          background: #fff;
          border: 1px solid var(--pmg-border);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
        }

        .pmg-ai-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          color: var(--pmg-red);
          border-radius: 12px;
          background: var(--pmg-red-soft);
        }

        .pmg-ai-box strong {
          display: block;
          font-size: 12px;
          font-weight: 850;
        }

        .pmg-ai-box p {
          margin: 3px 0 0;
          color: var(--pmg-muted);
          font-size: 11px;
          line-height: 1.35;
          font-weight: 600;
        }

        .pmg-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .pmg-topbar {
          position: sticky;
          top: 0;
          z-index: 20;
          min-height: 82px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 28px;
          background: rgba(246, 247, 249, 0.86);
          backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(230, 233, 238, 0.84);
        }

        .pmg-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--pmg-green);
          font-size: 11px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .pmg-eyebrow::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: var(--pmg-red);
        }

        .pmg-topbar h1 {
          margin: 3px 0 0;
          font-size: 25px;
          line-height: 1.1;
          font-weight: 850;
          letter-spacing: -0.045em;
          color: var(--pmg-text);
        }

        .pmg-topbar-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pmg-btn {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 0 15px;
          border-radius: 14px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
          transition: 160ms ease;
          white-space: nowrap;
        }

        .pmg-btn:hover {
          transform: translateY(-1px);
        }

        .pmg-btn-light {
          color: #374151;
          background: #ffffff;
          border: 1px solid var(--pmg-border);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
        }

        .pmg-btn-primary {
          color: #ffffff;
          background: var(--pmg-green);
          border: 1px solid var(--pmg-green);
          box-shadow: 0 12px 24px rgba(21, 128, 61, 0.18);
        }

        .pmg-btn-primary:hover {
          background: #166534;
        }

        .pmg-page {
          min-width: 0;
          width: 100%;
          padding: 24px 28px 34px;
        }

        .pmg-page :where(.card, .panel, .box, [data-card="true"]) {
          background: #fff;
          border: 1px solid var(--pmg-border);
          border-radius: var(--pmg-radius);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.045);
        }

        .pmg-page :where(button, .button, [role="button"]) {
          border-radius: 13px;
        }

        .pmg-page :where(input, select, textarea) {
          border-radius: 13px;
        }

        .pmg-mobile-menu {
          position: fixed;
          left: 14px;
          top: 14px;
          z-index: 60;
        }

        .pmg-backdrop {
          position: fixed;
          inset: 0;
          z-index: 45;
          border: 0;
          background: rgba(17, 24, 39, 0.36);
          backdrop-filter: blur(4px);
          cursor: pointer;
        }

        @media (max-width: 1100px) {
          .pmg-shell {
            grid-template-columns: 72px minmax(0, 1fr);
          }

          .pmg-sidebar {
            padding: 14px 10px;
            align-items: center;
          }

          .pmg-brand-text,
          .pmg-company-card,
          .pmg-nav-label,
          .pmg-ai-box,
          .pmg-cotador span:not(.pmg-cotador-icon) {
            display: none;
          }

          .pmg-brand {
            padding: 6px;
          }

          .pmg-nav-item {
            width: 52px;
            justify-content: center;
            padding: 8px;
          }

          .pmg-nav-item::before {
            display: none;
          }

          .pmg-cotador {
            width: 52px;
            justify-content: center;
          }
        }

        @media (max-width: 760px) {
          body.pmg-menu-open {
            overflow: hidden;
          }

          .pmg-shell {
            display: block;
          }

          .pmg-mobile-menu {
            display: inline-flex;
          }

          .pmg-sidebar-toggle {
            display: none;
          }

          .pmg-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            width: min(84vw, 330px);
            height: 100dvh;
            align-items: stretch;
            transform: translateX(-104%);
            transition: transform 220ms ease;
            box-shadow: 20px 0 70px rgba(15, 23, 42, 0.22);
            z-index: 70;
          }

          .pmg-sidebar.open {
            transform: translateX(0);
          }

          .pmg-sidebar-close {
            display: inline-flex;
          }

          .pmg-shell.collapsed .pmg-sidebar {
            align-items: stretch;
            padding: 18px 14px;
          }

          .pmg-shell.collapsed .pmg-sidebar-head {
            justify-content: space-between;
          }

          .pmg-brand-text,
          .pmg-shell.collapsed .pmg-brand-text,
          .pmg-nav-label,
          .pmg-shell.collapsed .pmg-nav-label {
            display: grid;
          }

          .pmg-company-card,
          .pmg-shell.collapsed .pmg-company-card {
            display: flex;
          }

          .pmg-ai-box,
          .pmg-shell.collapsed .pmg-ai-box {
            display: flex;
          }

          .pmg-cotador span:not(.pmg-cotador-icon),
          .pmg-shell.collapsed .pmg-cotador span:not(.pmg-cotador-icon) {
            display: block;
          }

          .pmg-brand,
          .pmg-shell.collapsed .pmg-brand {
            padding: 8px;
          }

          .pmg-nav,
          .pmg-sidebar-footer {
            width: 100%;
          }

          .pmg-nav-item,
          .pmg-cotador,
          .pmg-shell.collapsed .pmg-nav-item,
          .pmg-shell.collapsed .pmg-cotador {
            width: 100%;
            justify-content: flex-start;
          }

          .pmg-nav-item::before,
          .pmg-shell.collapsed .pmg-nav-item::before {
            display: block;
          }

          .pmg-topbar {
            min-height: 78px;
            padding: 16px 14px 14px 66px;
            align-items: flex-start;
          }

          .pmg-topbar h1 {
            font-size: 20px;
          }

          .pmg-topbar-actions {
            display: none;
          }

          .pmg-page {
            padding: 16px 12px 28px;
          }

          .pmg-page :where(table, .table, [role="table"]) {
            min-width: 760px;
          }
        }

        @media (max-width: 420px) {
          .pmg-topbar {
            padding-left: 62px;
          }

          .pmg-topbar h1 {
            font-size: 18px;
          }

          .pmg-page {
            padding-left: 10px;
            padding-right: 10px;
          }
        }
      `}</style>
    </div>
  );
}
