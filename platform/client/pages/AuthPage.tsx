import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Lock, Mail, User, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export const AuthPage: React.FC<{ mode: "login" | "register" }> = ({ mode }) => {
  const { login, register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        notify("Signed in to AetherForge Studio", "success");
      } else {
        await register(name, email, password);
        notify("Workspace created and encrypted vault initialized", "success");
      }
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl af-panel border p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-white font-bold">
            AF
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">AetherForge Studio</h1>
            <p className="text-xs af-muted">
              {mode === "login"
                ? "Sign in to your autonomous engineering studio"
                : "Create your isolated workspace & encrypted vault"}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium af-muted">Full Name</label>
              <div className="flex items-center gap-2 rounded-xl border af-border af-panel-2 px-3 py-2">
                <User className="h-4 w-4 af-muted" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium af-muted">Email</label>
            <div className="flex items-center gap-2 rounded-xl border af-border af-panel-2 px-3 py-2">
              <Mail className="h-4 w-4 af-muted" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="builder@example.com"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium af-muted">Password</label>
            <div className="flex items-center gap-2 rounded-xl border af-border af-panel-2 px-3 py-2">
              <Lock className="h-4 w-4 af-muted" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            <Sparkles className="h-4 w-4" />
            <span>
              {submitting
                ? "Please wait..."
                : mode === "login"
                  ? "Sign In to Studio"
                  : "Create Workspace"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between border-t af-border pt-4 text-xs af-muted">
          <span>
            {mode === "login" ? "New to AetherForge?" : "Already have a workspace?"}
          </span>
          <Link
            to={mode === "login" ? "/register" : "/login"}
            className="font-semibold text-indigo-400 hover:underline"
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </Link>
        </div>

        <div className="mt-4 flex justify-center gap-4 text-[11px] af-muted">
          <Link to="/docs" className="hover:underline">
            Documentation
          </Link>
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
};
