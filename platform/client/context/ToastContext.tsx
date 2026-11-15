import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

interface ToastItem {
  id: string;
  kind: "success" | "error" | "info";
  message: string;
}

const ToastContext = createContext<{
  notify: (message: string, kind?: "success" | "error" | "info") => void;
} | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = useCallback((message: string, kind: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-xl backdrop-blur ${
              item.kind === "success"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
                : item.kind === "error"
                  ? "border-rose-500/40 bg-rose-950/90 text-rose-100"
                  : "af-panel border text-slate-100"
            }`}
          >
            {item.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : item.kind === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
            )}
            <span className="flex-1 leading-snug">{item.message}</span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
              className="opacity-70 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
};
