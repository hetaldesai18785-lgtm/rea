import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Sparkles,
  FolderGit2,
  LayoutGrid,
  PlugZap,
  Cpu,
  Binary,
  Rocket,
  CreditCard,
  Settings,
  ShieldCheck,
  BookOpen,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Studio Home", icon: Sparkles },
  { to: "/projects", label: "Projects", icon: FolderGit2 },
  { to: "/templates", label: "Templates", icon: LayoutGrid },
  { to: "/integrations", label: "Integrations", icon: PlugZap },
  { to: "/mcp", label: "MCP Servers", icon: Cpu },
  { to: "/rea", label: "REA Workbench", icon: Binary },
  { to: "/deployments", label: "Deployments", icon: Rocket },
  { to: "/billing", label: "Credits & Usage", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/docs", label: "Docs", icon: BookOpen },
];

export const AppShell: React.FC<{ children: React.ReactNode; title?: string }> = ({
  children,
  title,
}) => {
  const { user, logout, theme, toggleTheme } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between p-3">
      <div className="space-y-4">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 text-white font-bold text-sm shadow">
            AF
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">AetherForge Studio</div>
            <div className="text-[11px] af-muted">AI Software Engineering</div>
          </div>
        </Link>

        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                    isActive
                      ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                      : "af-muted hover:bg-slate-500/10 hover:text-inherit"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isActive
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    : "af-muted hover:bg-slate-500/10"
                }`
              }
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Admin Plane</span>
            </NavLink>
          )}
        </nav>
      </div>

      <div className="space-y-2 border-t af-border pt-3">
        {user && (
          <div className="rounded-lg af-panel-2 border p-2.5 text-xs">
            <div className="font-medium truncate">{user.name}</div>
            <div className="af-muted truncate text-[11px]">{user.email}</div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-400 uppercase font-semibold">
                {user.role}
              </span>
              <span className="font-semibold text-emerald-400">{user.creditsBalance} cr</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toggleTheme()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border af-border px-2.5 py-1.5 text-xs hover:bg-slate-500/10"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          {user && (
            <button
              type="button"
              onClick={() => void handleLogout()}
              title="Sign out"
              className="flex items-center justify-center rounded-lg border af-border p-1.5 text-xs af-muted hover:text-rose-400 hover:border-rose-500/40"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-1 text-[10px] af-muted">
          <Link to="/terms" className="hover:underline">
            Terms
          </Link>
          <Link to="/privacy" className="hover:underline">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <aside className="hidden md:block w-56 shrink-0 border-r af-panel overflow-y-auto">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-64 max-w-[85vw] af-panel border-r h-full overflow-y-auto">
            {navContent}
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between border-b af-panel px-3 sm:px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              aria-label="Toggle navigation"
              className="md:hidden rounded-lg p-1.5 hover:bg-slate-500/10"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <h1 className="text-sm font-semibold truncate">{title ?? "AetherForge Studio"}</h1>
          </div>
          <div className="flex items-center gap-2 text-xs af-muted">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border af-border px-2.5 py-0.5 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              REA Runtime Ready
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
};
