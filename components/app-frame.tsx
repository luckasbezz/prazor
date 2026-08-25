import Link from "next/link";
import type { ReactNode } from "react";

type AppFrameProps = {
  active: "dashboard" | "expiry" | "notifications" | "products" | "receive" | "movements" | "losses" | "suppliers" | "exchanges" | "reports";
  companyName: string;
  userLabel: string;
  notificationCount?: number;
  expiryCount?: number;
  children: ReactNode;
};

const navItems = [
  { id: "dashboard", href: "/app", icon: "⌂", label: "Visão geral" },
  { id: "expiry", href: "/app/validades", icon: "◷", label: "Validades" },
  { id: "notifications", href: "/app/notificacoes", icon: "◇", label: "Notificações" },
  { id: "products", href: "/app/estoque/produtos", icon: "□", label: "Produtos" },
  { id: "receive", href: "/app/estoque/receber", icon: "＋", label: "Receber estoque" },
  { id: "movements", href: "/app/estoque/movimentar", icon: "↔", label: "Movimentações" },
  { id: "losses", href: "/app/estoque/perdas", icon: "!", label: "Perdas e avarias" },
  { id: "suppliers", href: "/app/fornecedores", icon: "↔", label: "Fornecedores" },
  { id: "exchanges", href: "/app/fornecedores/trocas", icon: "⇄", label: "Trocas" },
  { id: "reports", href: "/app/relatorios", icon: "▦", label: "Relatórios" },
] as const;

export function AppFrame({
  active,
  companyName,
  userLabel,
  notificationCount = 0,
  expiryCount = 0,
  children,
}: AppFrameProps) {
  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <Link className="brand app-brand" href="/app">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Prazor</span>
        </Link>
        <nav aria-label="Navegação do aplicativo">
          {navItems.map((item) => (
            <Link className={active === item.id ? "active" : ""} href={item.href} key={item.id}>
              <span>{item.icon}</span>{item.label}
              {item.id === "expiry" && expiryCount > 0 ? <b>{expiryCount}</b> : null}
              {item.id === "notifications" && notificationCount > 0 ? <b>{notificationCount}</b> : null}
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-bottom">
          <Link href="/app/notificacoes/entregas"><span>↗</span>Entregas</Link>
          <Link href="/app/notificacoes/preferencias"><span>⚙</span>Preferências</Link>
          <form action="/api/auth/sign-out" method="post">
            <button type="submit"><span>↪</span>Sair</button>
          </form>
        </div>
      </aside>

      <section className="app-content">
        <header className="app-topbar">
          <div className="company-switcher"><small>Empresa</small><strong>{companyName}</strong></div>
          <div className="app-top-actions">
            <Link className="notification-shortcut" href="/app/notificacoes" aria-label="Abrir notificações">◇{notificationCount > 0 ? <b>{notificationCount}</b> : null}</Link>
            <span className="user-avatar">{initials(userLabel)}</span>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

function initials(value: string) {
  return value
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
