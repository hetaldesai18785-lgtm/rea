import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { UserDto, WorkspaceRole } from "@shared/types";
import { api, setStoredToken } from "../lib/api";

interface AuthContextValue {
  user: UserDto | null;
  workspaceId: string | null;
  workspaceRole: WorkspaceRole | null;
  loading: boolean;
  theme: "dark" | "light";
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const applyThemeToDom = (theme: "dark" | "light") => {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("af_theme", theme);
  } catch {
    // ignore
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("af_theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const refreshMe = useCallback(async () => {
    try {
      const res = await api.get<{
        user: UserDto;
        workspaceId: string;
        workspaceRole: WorkspaceRole;
      }>("/api/auth/me");
      setUser(res.user);
      setWorkspaceId(res.workspaceId);
      setWorkspaceRole(res.workspaceRole);
      setTheme(res.user.theme);
    } catch {
      setUser(null);
      setWorkspaceId(null);
      setWorkspaceRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{
      token: string;
      user: UserDto;
      workspaceId: string | null;
    }>("/api/auth/login", { email, password });
    setStoredToken(res.token);
    setUser(res.user);
    setWorkspaceId(res.workspaceId);
    setTheme(res.user.theme);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post<{
      token: string;
      user: UserDto;
      workspaceId: string;
    }>("/api/auth/register", { name, email, password });
    setStoredToken(res.token);
    setUser(res.user);
    setWorkspaceId(res.workspaceId);
    setTheme(res.user.theme);
  };

  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setWorkspaceId(null);
    setWorkspaceRole(null);
  };

  const toggleTheme = async () => {
    const next: "dark" | "light" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (user) {
      try {
        const res = await api.patch<{ user: UserDto }>("/api/auth/me", { theme: next });
        setUser(res.user);
      } catch {
        // local state already toggled
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workspaceId,
        workspaceRole,
        loading,
        theme,
        login,
        register,
        logout,
        refreshMe,
        toggleTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
