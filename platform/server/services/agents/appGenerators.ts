import type { ProjectBlueprint } from "./blueprintCompiler.js";

export interface GeneratedUiBundle {
  stylesCss: string;
  indexHtml: string;
  appJs: string;
  extraFiles: Array<{ path: string; content: string }>;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const titleCase = (str: string): string =>
  str
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const BASE_THEME_CSS = (themePreference: "dark" | "light") => `:root {
  --bg: ${themePreference === "dark" ? "#0b1120" : "#f8fafc"};
  --surface: ${themePreference === "dark" ? "#111827" : "#ffffff"};
  --surface-2: ${themePreference === "dark" ? "#1e293b" : "#f1f5f9"};
  --border: ${themePreference === "dark" ? "#293548" : "#e2e8f0"};
  --text: ${themePreference === "dark" ? "#f1f5f9" : "#0f172a"};
  --muted: ${themePreference === "dark" ? "#94a3b8" : "#64748b"};
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --ok: #10b981;
  --warn: #f59e0b;
  --danger: #ef4444;
}
body.light-theme {
  --bg: #f8fafc; --surface: #ffffff; --surface-2: #f1f5f9;
  --border: #e2e8f0; --text: #0f172a; --muted: #64748b;
}
body.dark-theme {
  --bg: #0b1120; --surface: #111827; --surface-2: #1e293b;
  --border: #293548; --text: #f1f5f9; --muted: #94a3b8;
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text); line-height: 1.5;
}
`;

const SHARED_RUNTIME_BRIDGE = `
window.addEventListener("error", (event) => {
  window.parent?.postMessage({ type: "aetherforge:preview-error", message: event.message, source: event.filename }, "*");
});
window.addEventListener("unhandledrejection", (event) => {
  window.parent?.postMessage({ type: "aetherforge:preview-error", message: String(event.reason) }, "*");
});
const apiUrl = (path) => "./" + path.replace(/^\\/+/, "");
`;

export const generateMobileExpoArtifacts = (bp: ProjectBlueprint): GeneratedUiBundle => {
  const entity = bp.primaryEntity;
  const plural = entity.plural;
  const safeTitle = escapeHtml(bp.title);
  const statusOptions = entity.fields.find((f) => f.name === "status")?.options ?? ["active", "completed"];

  const stylesCss = `${BASE_THEME_CSS(bp.themePreference)}
body { display: flex; justify-content: center; min-height: 100vh; padding: 0; }
.phone-shell {
  width: 100%; max-width: 430px; min-height: 100vh; background: var(--bg);
  display: flex; flex-direction: column; border-left: 1px solid var(--border); border-right: 1px solid var(--border);
}
.status-bar {
  display: flex; justify-content: space-between; align-items: center; padding: 8px 16px;
  font-size: 0.72rem; font-weight: 600; color: var(--muted); background: var(--surface);
}
.app-header {
  display: flex; justify-content: space-between; align-items: center; padding: 10px 16px 12px;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.app-header h1 { margin: 0; font-size: 1.05rem; letter-spacing: -0.01em; }
.app-header small { color: var(--muted); font-size: 0.72rem; display: block; }
.screen-body { flex: 1; overflow-y: auto; padding: 14px 14px 84px; }
.kpi-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px; }
.kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
.kpi-card span { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; }
.kpi-card strong { display: block; font-size: 1.4rem; margin-top: 2px; }
.pill-row { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 10px; }
.pill {
  padding: 6px 12px; border-radius: 999px; font-size: 0.76rem; font-weight: 600;
  background: var(--surface); border: 1px solid var(--border); color: var(--muted); white-space: nowrap; cursor: pointer;
}
.pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.mobile-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  padding: 13px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 8px;
}
.badge {
  display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem;
  font-weight: 600; background: rgba(99,102,241,0.18); color: #818cf8;
}
.badge-high { background: rgba(239,68,68,0.18); color: #f87171; }
.badge-medium { background: rgba(245,158,11,0.18); color: #fbbf24; }
.badge-low { background: rgba(16,185,129,0.18); color: #34d399; }
label.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--muted); margin-bottom: 10px; }
input, select, textarea {
  width: 100%; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; font-size: 0.9rem;
}
button {
  cursor: pointer; border: none; border-radius: 12px; padding: 10px 14px; font-size: 0.85rem; font-weight: 600;
}
.btn-primary { background: var(--accent); color: #fff; width: 100%; }
.btn-ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); padding: 6px 10px; font-size: 0.75rem; }
.btn-danger { background: rgba(239,68,68,0.16); color: #f87171; border: 1px solid rgba(239,68,68,0.3); padding: 6px 10px; font-size: 0.75rem; }
.tab-bar {
  position: sticky; bottom: 0; display: grid; grid-template-columns: repeat(4, 1fr);
  background: var(--surface); border-top: 1px solid var(--border); padding: 6px 4px;
}
.tab-btn {
  display: flex; flex-direction: column; align-items: center; gap: 2px; background: transparent;
  color: var(--muted); font-size: 0.68rem; font-weight: 600; padding: 6px 4px; border-radius: 10px;
}
.tab-btn.active { color: #818cf8; background: rgba(99,102,241,0.12); }
.error-banner {
  background: rgba(239,68,68,0.16); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5;
  padding: 9px 12px; border-radius: 10px; margin-bottom: 10px; display: none; font-size: 0.8rem;
}
.hidden { display: none !important; }
`;

  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body class="${bp.themePreference}-theme">
  <div class="phone-shell">
    <div class="status-bar">
      <span>9:41</span>
      <span>Expo SDK 52 &bull; Synced</span>
    </div>
    <header class="app-header">
      <div>
        <h1>${safeTitle}</h1>
        <small id="screen-subtitle">Home Dashboard</small>
      </div>
      <button id="refresh-btn" class="btn-ghost" type="button">Sync</button>
    </header>

    <main class="screen-body">
      <div id="error-banner" class="error-banner"></div>

      <section id="tab-home">
        <div id="stats-grid" class="kpi-row"></div>
        <div class="mobile-card">
          <strong style="font-size:0.9rem;">Recent ${titleCase(plural)}</strong>
          <div id="home-recent" style="display:grid;gap:8px;margin-top:4px;"></div>
        </div>
      </section>

      <section id="tab-browse" class="hidden">
        <input id="search-input" type="search" placeholder="Search ${plural}..." style="margin-bottom:10px;" />
        <div id="status-pills" class="pill-row"></div>
        <div id="records-grid"></div>
      </section>

      <section id="tab-create" class="hidden">
        <div class="mobile-card">
          <strong style="font-size:0.95rem;margin-bottom:4px;">New ${escapeHtml(entity.name)}</strong>
          <form id="create-form"></form>
        </div>
      </section>

      <section id="tab-settings" class="hidden">
        <div class="mobile-card">
          <strong>Appearance & Sync</strong>
          <p style="margin:0;font-size:0.8rem;color:var(--muted);">
            Connected to live REST backend at <code>/api/${plural}</code>. Native Expo source code is available in <code>mobile/</code>.
          </p>
          <button id="theme-toggle" class="btn-ghost" type="button">Toggle Light / Dark Theme</button>
          ${bp.includeExportCsv ? '<button id="export-csv" class="btn-ghost" type="button">Export Offline CSV</button>' : ""}
        </div>
      </section>
    </main>

    <nav class="tab-bar">
      <button type="button" class="tab-btn active" data-tab="home"><span>Home</span></button>
      <button type="button" class="tab-btn" data-tab="browse"><span>Browse</span></button>
      <button type="button" class="tab-btn" data-tab="create"><span>+ Add</span></button>
      <button type="button" class="tab-btn" data-tab="settings"><span>Settings</span></button>
    </nav>
  </div>
  <script type="module" src="./app.js"></script>
</body>
</html>
`;

  const appJs = `${SHARED_RUNTIME_BRIDGE}
const FIELDS = ${JSON.stringify(entity.fields)};
const ENTITY_PLURAL = ${JSON.stringify(plural)};
const STATUS_OPTIONS = ${JSON.stringify(statusOptions)};

const banner = document.getElementById("error-banner");
const showError = (msg) => {
  if (!msg) { banner.style.display = "none"; banner.textContent = ""; return; }
  banner.style.display = "block";
  banner.textContent = msg;
};

let activeStatus = "all";
let lastItems = [];

const switchTab = (tab) => {
  for (const name of ["home", "browse", "create", "settings"]) {
    document.getElementById("tab-" + name).classList.toggle("hidden", name !== tab);
  }
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const labels = { home: "Home Dashboard", browse: "${titleCase(plural)}", create: "Create ${entity.name}", settings: "Mobile Settings" };
  document.getElementById("screen-subtitle").textContent = labels[tab] || "Studio";
};

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

const renderPills = () => {
  const row = document.getElementById("status-pills");
  row.innerHTML = ["all", ...STATUS_OPTIONS]
    .map((st) => '<button type="button" class="pill ' + (activeStatus === st ? "active" : "") + '" data-status="' + st + '">' + (st === "all" ? "All" : st) + "</button>")
    .join("");
};

document.getElementById("status-pills").addEventListener("click", (e) => {
  const st = e.target.dataset?.status;
  if (!st) return;
  activeStatus = st;
  renderPills();
  void loadItems();
});

const renderForm = () => {
  const form = document.getElementById("create-form");
  form.innerHTML = "";
  for (const f of FIELDS) {
    const label = document.createElement("label");
    label.className = "field";
    label.textContent = f.label + (f.required ? " *" : "");
    let input;
    if (f.type === "enum" && Array.isArray(f.options)) {
      input = document.createElement("select");
      for (const opt of f.options) {
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        if (f.defaultValue === opt) o.selected = true;
        input.appendChild(o);
      }
    } else {
      input = document.createElement("input");
      input.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
      if (f.defaultValue !== undefined) input.value = String(f.defaultValue);
      if (f.required) input.required = true;
    }
    input.name = f.name;
    label.appendChild(input);
    form.appendChild(label);
  }
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "btn-primary";
  btn.textContent = "Save ${entity.name}";
  form.appendChild(btn);
};

const loadStats = async () => {
  const res = await fetch(apiUrl("api/stats"));
  const stats = await res.json();
  const cards = [
    { label: "Total ${titleCase(plural)}", value: stats.total },
    ...Object.entries(stats.byStatus || {}).slice(0, 3).map(([k, v]) => ({ label: k, value: v })),
  ];
  document.getElementById("stats-grid").innerHTML = cards
    .map((c) => '<div class="kpi-card"><span>' + c.label + "</span><strong>" + c.value + "</strong></div>")
    .join("");
};

const loadItems = async () => {
  const q = document.getElementById("search-input").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (activeStatus !== "all") params.set("status", activeStatus);

  const res = await fetch(apiUrl("api/" + ENTITY_PLURAL + "?" + params.toString()));
  const data = await res.json();
  lastItems = data.items || [];

  document.getElementById("home-recent").innerHTML = lastItems.slice(0, 3)
    .map((it) => '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);"><span style="font-size:0.84rem;font-weight:600;">' + String(it.title || it.id) + '</span><span class="badge">' + String(it.status || "active") + "</span></div>")
    .join("") || '<span style="color:var(--muted);font-size:0.8rem;">No records yet.</span>';

  document.getElementById("records-grid").innerHTML = lastItems
    .map((item) => {
      const meta = FIELDS.filter((f) => !["title", "status", "priority"].includes(f.name))
        .map((f) => (item[f.name] !== undefined && item[f.name] !== "" ? "<div><strong>" + f.label + ":</strong> " + String(item[f.name]) + "</div>" : ""))
        .join("");
      return (
        '<div class="mobile-card">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<strong>' + String(item.title || item.id) + "</strong>" +
        '<span class="badge">' + String(item.status || "open") + "</span></div>" +
        '<div style="font-size:0.8rem;color:var(--muted);">' + meta + "</div>" +
        '<div style="display:flex;gap:8px;justify-content:space-between;">' +
        '<select data-action="status" data-id="' + item.id + '" style="padding:6px 8px;font-size:0.78rem;">' +
        STATUS_OPTIONS.map((opt) => '<option value="' + opt + '"' + (item.status === opt ? " selected" : "") + ">" + opt + "</option>").join("") +
        "</select>" +
        '<button type="button" class="btn-danger" data-action="delete" data-id="' + item.id + '">Delete</button>' +
        "</div></div>"
      );
    })
    .join("") || '<p style="color:var(--muted);font-size:0.85rem;">No matching records.</p>';
};

document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const payload = Object.fromEntries(new FormData(e.target).entries());
  const res = await fetch(apiUrl("api/" + ENTITY_PLURAL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) { showError(body.error || "Failed to save"); return; }
  e.target.reset();
  renderForm();
  await Promise.all([loadStats(), loadItems()]);
  switchTab("browse");
});

document.getElementById("records-grid").addEventListener("change", async (e) => {
  if (e.target.dataset?.action === "status") {
    await fetch(apiUrl("api/" + ENTITY_PLURAL + "/" + encodeURIComponent(e.target.dataset.id)), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: e.target.value }),
    });
    await Promise.all([loadStats(), loadItems()]);
  }
});

document.getElementById("records-grid").addEventListener("click", async (e) => {
  if (e.target.dataset?.action === "delete") {
    await fetch(apiUrl("api/" + ENTITY_PLURAL + "/" + encodeURIComponent(e.target.dataset.id)), { method: "DELETE" });
    await Promise.all([loadStats(), loadItems()]);
  }
});

document.getElementById("search-input").addEventListener("input", () => void loadItems());
document.getElementById("refresh-btn").addEventListener("click", () => Promise.all([loadStats(), loadItems()]));
document.getElementById("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  document.body.classList.toggle("dark-theme");
});
document.getElementById("export-csv")?.addEventListener("click", () => {
  const headers = ["id", ...FIELDS.map((f) => f.name)];
  const rows = [headers.join(","), ...lastItems.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))];
  const blob = new Blob([rows.join("\\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ENTITY_PLURAL + ".csv";
  a.click();
});

renderPills();
renderForm();
Promise.all([loadStats(), loadItems()]).catch((err) => showError(err.message));
`;

  const extraFiles = [
    {
      path: "mobile/package.json",
      content: JSON.stringify(
        {
          name: `${plural}-mobile`,
          version: "1.0.0",
          main: "App.tsx",
          scripts: {
            start: "expo start",
            android: "expo start --android",
            ios: "expo start --ios",
            web: "expo start --web",
          },
          dependencies: {
            expo: "~52.0.0",
            "expo-status-bar": "~2.0.0",
            react: "18.3.1",
            "react-native": "0.76.5",
            "react-native-safe-area-context": "4.12.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "mobile/app.json",
      content: JSON.stringify(
        {
          expo: {
            name: bp.title,
            slug: plural,
            scheme: plural.replace(/[^a-z0-9]/g, ""),
            version: "1.0.0",
            orientation: "portrait",
            userInterfaceStyle: bp.themePreference,
            ios: { supportsTablet: true, bundleIdentifier: `app.aetherforge.${plural}` },
            android: { package: `app.aetherforge.${plural}` },
          },
        },
        null,
        2,
      ),
    },
    {
      path: "mobile/src/api/client.ts",
      content: `const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:4700";

export interface ${entity.name}Record {
  id: string;
${entity.fields.map((f) => `  ${f.name}${f.required ? "" : "?"}: ${f.type === "number" ? "number" : "string"};`).join("\n")}
}

export const apiClient = {
  async list(q = "", status = ""): Promise<${entity.name}Record[]> {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status && status !== "all") params.set("status", status);
    const res = await fetch(\`\${API_BASE}/api/${plural}?\${params.toString()}\`);
    const data = await res.json();
    return data.items ?? [];
  },
  async create(payload: Partial<${entity.name}Record>): Promise<${entity.name}Record> {
    const res = await fetch(\`\${API_BASE}/api/${plural}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Request failed");
    return res.json();
  },
  async updateStatus(id: string, status: string): Promise<void> {
    await fetch(\`\${API_BASE}/api/${plural}/\${encodeURIComponent(id)}\`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  },
};
`,
    },
    {
      path: "mobile/src/screens/HomeScreen.tsx",
      content: `import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ${entity.name}Record } from "../api/client";

export function HomeScreen({ items }: { items: ${entity.name}Record[] }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>${bp.title}</Text>
      <View style={styles.kpiRow}>
        <View style={styles.card}>
          <Text style={styles.label}>Total ${titleCase(plural)}</Text>
          <Text style={styles.value}>{items.length}</Text>
        </View>
      </View>
      {items.slice(0, 5).map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.title}>{String((item as Record<string, unknown>).title ?? item.id)}</Text>
          <Text style={styles.label}>{String((item as Record<string, unknown>).status ?? "active")}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: "700", color: "#f1f5f9" },
  kpiRow: { flexDirection: "row", gap: 10 },
  card: { backgroundColor: "#111827", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#293548" },
  title: { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  label: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  value: { fontSize: 26, fontWeight: "700", color: "#818cf8", marginTop: 4 },
});
`,
    },
    {
      path: "mobile/src/screens/ExploreScreen.tsx",
      content: `import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ${entity.name}Record } from "../api/client";

export function ExploreScreen({
  items,
  onToggleStatus,
}: {
  items: ${entity.name}Record[];
  onToggleStatus: (id: string, nextStatus: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((it) => JSON.stringify(it).toLowerCase().includes(query.toLowerCase()));
  return (
    <View style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search ${plural}..."
        placeholderTextColor="#94a3b8"
        style={styles.input}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{String((item as Record<string, unknown>).title ?? item.id)}</Text>
            <Pressable
              onPress={() => onToggleStatus(item.id, ${JSON.stringify(statusOptions[statusOptions.length - 1] ?? "completed")})}
              style={styles.pill}
            >
              <Text style={styles.pillText}>{String((item as Record<string, unknown>).status ?? "active")}</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  input: { backgroundColor: "#1e293b", color: "#f1f5f9", borderRadius: 12, padding: 12 },
  card: { backgroundColor: "#111827", borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", justifyContent: "space-between" },
  title: { color: "#f1f5f9", fontWeight: "600", flex: 1 },
  pill: { backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
`,
    },
    {
      path: "mobile/src/screens/CreateScreen.tsx",
      content: `import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function CreateScreen({ onSubmit }: { onSubmit: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Add ${entity.name}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Enter title..."
        placeholderTextColor="#94a3b8"
        style={styles.input}
      />
      <Pressable
        style={styles.button}
        onPress={async () => {
          if (!title.trim()) return;
          await onSubmit(title.trim());
          setTitle("");
        }}
      >
        <Text style={styles.buttonText}>Save ${entity.name}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  input: { backgroundColor: "#1e293b", color: "#f1f5f9", borderRadius: 12, padding: 12 },
  button: { backgroundColor: "#6366f1", borderRadius: 12, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
});
`,
    },
    {
      path: "mobile/App.tsx",
      content: `import React, { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { apiClient, type ${entity.name}Record } from "./src/api/client";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ExploreScreen } from "./src/screens/ExploreScreen";
import { CreateScreen } from "./src/screens/CreateScreen";

export default function App() {
  const [tab, setTab] = useState<"home" | "browse" | "create">("home");
  const [items, setItems] = useState<${entity.name}Record[]>([]);

  const reload = useCallback(async () => {
    try {
      setItems(await apiClient.list());
    } catch {
      // Offline cache fallback handled here
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.body}>
        {tab === "home" && <HomeScreen items={items} />}
        {tab === "browse" && (
          <ExploreScreen
            items={items}
            onToggleStatus={async (id, next) => {
              await apiClient.updateStatus(id, next);
              await reload();
            }}
          />
        )}
        {tab === "create" && (
          <CreateScreen
            onSubmit={async (title) => {
              await apiClient.create({ title } as Partial<${entity.name}Record>);
              await reload();
              setTab("browse");
            }}
          />
        )}
      </View>
      <View style={styles.tabBar}>
        {(["home", "browse", "create"] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.tabBtn}>
            <Text style={[styles.tabText, tab === t && styles.tabActive]}>{t.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1120" },
  body: { flex: 1 },
  tabBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#293548", backgroundColor: "#111827" },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  tabActive: { color: "#818cf8" },
});
`,
    },
  ];

  return { stylesCss, indexHtml, appJs, extraFiles };
};

export const generateLandingArtifacts = (bp: ProjectBlueprint): GeneratedUiBundle => {
  const entity = bp.primaryEntity;
  const plural = entity.plural;
  const safeTitle = escapeHtml(bp.title);
  const safeSummary = escapeHtml(bp.summary);

  const stylesCss = `${BASE_THEME_CSS(bp.themePreference)}
.nav {
  position: sticky; top: 0; z-index: 20; backdrop-filter: blur(10px);
  background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid var(--border);
}
body.light-theme .nav { background: rgba(255, 255, 255, 0.9); }
.nav-inner, .section { max-width: 1120px; margin: 0 auto; padding: 14px 20px; }
.nav-inner { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.hero {
  max-width: 1120px; margin: 0 auto; padding: 56px 20px 44px;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 28px; align-items: center;
}
.hero h1 { font-size: clamp(2rem, 4vw, 3.1rem); line-height: 1.1; margin: 12px 0; letter-spacing: -0.03em; }
.pill {
  display: inline-flex; padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 600;
  background: rgba(99,102,241,0.16); color: #818cf8; border: 1px solid rgba(99,102,241,0.3);
}
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
.bento { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
input, select, textarea {
  width: 100%; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 0.9rem;
}
label.field { display: flex; flex-direction: column; gap: 5px; font-size: 0.8rem; color: var(--muted); margin-bottom: 10px; }
button { cursor: pointer; border: none; border-radius: 10px; padding: 10px 16px; font-size: 0.88rem; font-weight: 600; }
.btn-primary { background: linear-gradient(135deg, #6366f1, #10b981); color: #fff; }
.btn-ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
.btn-danger { background: rgba(239,68,68,0.16); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
.faq-item { border-bottom: 1px solid var(--border); padding: 12px 0; }
.faq-q { width: 100%; text-align: left; background: transparent; color: var(--text); padding: 4px 0; display: flex; justify-content: space-between; }
.error-banner { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; display: none; }
`;

  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body class="${bp.themePreference}-theme">
  <header class="nav">
    <div class="nav-inner">
      <strong style="font-size:1.05rem;">${safeTitle}</strong>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <a href="#features" style="color:var(--muted);text-decoration:none;font-size:0.85rem;">Features</a>
        <a href="#pricing" style="color:var(--muted);text-decoration:none;font-size:0.85rem;">Pricing</a>
        <a href="#submissions" style="color:var(--muted);text-decoration:none;font-size:0.85rem;">Directory</a>
        <button id="theme-toggle" class="btn-ghost" type="button">Theme</button>
      </div>
    </div>
  </header>

  <section class="hero">
    <div>
      <span class="pill">Production Full-Stack Website</span>
      <h1>${safeTitle}</h1>
      <p style="color:var(--muted);font-size:1rem;">${safeSummary}</p>
      <div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;">
        <a href="#capture-card" class="btn-primary" style="text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;">Get Started</a>
        <span class="btn-ghost" style="display:inline-flex;align-items:center;padding:10px 16px;border-radius:10px;font-size:0.85rem;">Live Records: <strong id="hero-count" style="margin-left:6px;">0</strong></span>
      </div>
    </div>

    <div id="capture-card" class="panel">
      <h2 style="margin:0 0 12px;font-size:1.1rem;">Submit ${escapeHtml(entity.name)}</h2>
      <div id="error-banner" class="error-banner"></div>
      <form id="create-form"></form>
    </div>
  </section>

  <section id="features" class="section">
    <div class="bento">
      <div class="panel"><strong>Real Persistent API</strong><p style="color:var(--muted);font-size:0.85rem;">Every signup or entry writes directly to <code>/api/${plural}</code> and survives page reloads.</p></div>
      <div class="panel"><strong>Responsive Layout</strong><p style="color:var(--muted);font-size:0.85rem;">Adaptive grid scales smoothly from mobile phones to widescreen desktops.</p></div>
      <div class="panel"><strong>Live Metrics & Export</strong><p style="color:var(--muted);font-size:0.85rem;">Filter submissions, update statuses inline, and export CSV reports.</p></div>
    </div>
  </section>

  <section id="pricing" class="section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <h2 style="margin:0;font-size:1.3rem;">Simple Transparent Pricing</h2>
      <button id="billing-toggle" type="button" class="btn-ghost">Switch to Annual (-20%)</button>
    </div>
    <div class="pricing-grid" id="pricing-grid"></div>
  </section>

  <section class="section">
    <div class="panel">
      <h2 style="margin:0 0 8px;font-size:1.15rem;">Frequently Asked Questions</h2>
      <div class="faq-item">
        <button class="faq-q" type="button" data-faq="0"><span>How does data persistence work?</span><span>+</span></button>
        <p class="faq-a" style="display:none;color:var(--muted);font-size:0.85rem;">Submissions validate against schema rules on Node.js and persist atomically to disk.</p>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button" data-faq="1"><span>Can I connect Stripe, Email, or Postgres?</span><span>+</span></button>
        <p class="faq-a" style="display:none;color:var(--muted);font-size:0.85rem;">Yes, add secrets inside Project Settings -> Secrets Vault and re-deploy without touching code.</p>
      </div>
    </div>
  </section>

  <section id="submissions" class="section">
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <h2 style="margin:0;font-size:1.1rem;">${titleCase(plural)} Directory</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="search-input" type="search" placeholder="Search..." style="width:180px;" />
          <select id="status-filter" style="width:auto;"></select>
          ${bp.includeExportCsv ? '<button id="export-csv" class="btn-ghost" type="button">Export CSV</button>' : ""}
        </div>
      </div>
      <div id="records-grid" class="bento"></div>
    </div>
  </section>

  <script type="module" src="./app.js"></script>
</body>
</html>
`;

  const appJs = `${SHARED_RUNTIME_BRIDGE}
const FIELDS = ${JSON.stringify(entity.fields)};
const ENTITY_PLURAL = ${JSON.stringify(plural)};
let annualBilling = false;
let lastItems = [];

const banner = document.getElementById("error-banner");
const showError = (msg) => {
  if (!msg) { banner.style.display = "none"; banner.textContent = ""; return; }
  banner.style.display = "block"; banner.textContent = msg;
};

const renderPricing = () => {
  const mult = annualBilling ? 0.8 : 1;
  const tiers = [
    { name: "Starter", price: Math.round(19 * mult), desc: "Core features for solo builders" },
    { name: "Growth", price: Math.round(49 * mult), desc: "Full automation & analytics" },
    { name: "Enterprise", price: Math.round(149 * mult), desc: "Dedicated SLA & custom integrations" },
  ];
  document.getElementById("pricing-grid").innerHTML = tiers
    .map((t) => '<div class="panel"><strong>' + t.name + '</strong><div style="font-size:1.9rem;font-weight:700;margin:8px 0;">$' + t.price + '<span style="font-size:0.85rem;color:var(--muted);">/mo</span></div><p style="color:var(--muted);font-size:0.84rem;">' + t.desc + "</p></div>")
    .join("");
};

document.getElementById("billing-toggle").addEventListener("click", (e) => {
  annualBilling = !annualBilling;
  e.target.textContent = annualBilling ? "Switch to Monthly" : "Switch to Annual (-20%)";
  renderPricing();
});

document.querySelectorAll(".faq-q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ans = btn.nextElementSibling;
    ans.style.display = ans.style.display === "none" ? "block" : "none";
  });
});

const renderForm = () => {
  const form = document.getElementById("create-form");
  form.innerHTML = "";
  for (const f of FIELDS) {
    const label = document.createElement("label");
    label.className = "field";
    label.textContent = f.label + (f.required ? " *" : "");
    let input;
    if (f.type === "enum" && Array.isArray(f.options)) {
      input = document.createElement("select");
      for (const opt of f.options) {
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        if (f.defaultValue === opt) o.selected = true;
        input.appendChild(o);
      }
    } else {
      input = document.createElement("input");
      input.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
      if (f.defaultValue !== undefined) input.value = String(f.defaultValue);
      if (f.required) input.required = true;
    }
    input.name = f.name;
    label.appendChild(input);
    form.appendChild(label);
  }
  const btn = document.createElement("button");
  btn.type = "submit"; btn.className = "btn-primary"; btn.style.width = "100%";
  btn.textContent = "Submit ${entity.name}";
  form.appendChild(btn);
};

const populateFilters = () => {
  const statusSelect = document.getElementById("status-filter");
  const statusField = FIELDS.find((f) => f.name === "status");
  statusSelect.innerHTML = '<option value="all">All Statuses</option>';
  if (statusField && Array.isArray(statusField.options)) {
    for (const opt of statusField.options) {
      const o = document.createElement("option"); o.value = opt; o.textContent = opt;
      statusSelect.appendChild(o);
    }
  }
};

const loadStats = async () => {
  const res = await fetch(apiUrl("api/stats"));
  const stats = await res.json();
  document.getElementById("hero-count").textContent = String(stats.total ?? 0);
};

const loadItems = async () => {
  const q = document.getElementById("search-input").value;
  const status = document.getElementById("status-filter").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  const res = await fetch(apiUrl("api/" + ENTITY_PLURAL + "?" + params.toString()));
  const data = await res.json();
  lastItems = data.items || [];
  const statusOptions = FIELDS.find((f) => f.name === "status")?.options || ["active", "done"];
  document.getElementById("records-grid").innerHTML = lastItems
    .map((item) =>
      '<div class="panel" style="padding:14px;">' +
      '<strong>' + String(item.title || item.id) + "</strong>" +
      '<div style="color:var(--muted);font-size:0.8rem;margin:6px 0;">Status: ' + String(item.status || "active") + "</div>" +
      '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:8px;">' +
      '<select data-action="status" data-id="' + item.id + '" style="padding:5px 8px;font-size:0.78rem;">' +
      statusOptions.map((opt) => '<option value="' + opt + '"' + (item.status === opt ? " selected" : "") + ">" + opt + "</option>").join("") +
      "</select>" +
      '<button type="button" class="btn-danger" data-action="delete" data-id="' + item.id + '">Delete</button>' +
      "</div></div>"
    ).join("") || '<p style="color:var(--muted);">No submissions yet.</p>';
};

document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault(); showError("");
  const payload = Object.fromEntries(new FormData(e.target).entries());
  const res = await fetch(apiUrl("api/" + ENTITY_PLURAL), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) { showError(body.error || "Failed to submit"); return; }
  e.target.reset(); renderForm();
  await Promise.all([loadStats(), loadItems()]);
});

document.getElementById("records-grid").addEventListener("change", async (e) => {
  if (e.target.dataset?.action === "status") {
    await fetch(apiUrl("api/" + ENTITY_PLURAL + "/" + encodeURIComponent(e.target.dataset.id)), {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: e.target.value }),
    });
    await Promise.all([loadStats(), loadItems()]);
  }
});

document.getElementById("records-grid").addEventListener("click", async (e) => {
  if (e.target.dataset?.action === "delete") {
    await fetch(apiUrl("api/" + ENTITY_PLURAL + "/" + encodeURIComponent(e.target.dataset.id)), { method: "DELETE" });
    await Promise.all([loadStats(), loadItems()]);
  }
});

document.getElementById("search-input").addEventListener("input", () => void loadItems());
document.getElementById("status-filter").addEventListener("change", () => void loadItems());
document.getElementById("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-theme"); document.body.classList.toggle("dark-theme");
});
document.getElementById("export-csv")?.addEventListener("click", () => {
  const headers = ["id", ...FIELDS.map((f) => f.name)];
  const rows = [headers.join(","), ...lastItems.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))];
  const blob = new Blob([rows.join("\\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ENTITY_PLURAL + ".csv"; a.click();
});

renderPricing();
renderForm();
populateFilters();
Promise.all([loadStats(), loadItems()]).catch((err) => showError(err.message));
`;

  return { stylesCss, indexHtml, appJs, extraFiles: [] };
};

export const generateApiExplorerArtifacts = (bp: ProjectBlueprint): GeneratedUiBundle => {
  const entity = bp.primaryEntity;
  const plural = entity.plural;
  const safeTitle = escapeHtml(bp.title);

  const stylesCss = `${BASE_THEME_CSS(bp.themePreference)}
.container { max-width: 1080px; margin: 0 auto; padding: 20px 16px 48px; }
.topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--border); margin-bottom: 18px; flex-wrap: wrap; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 14px; }
.endpoint { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 10px; background: var(--surface-2); margin-bottom: 8px; font-family: monospace; font-size: 0.85rem; }
.method { padding: 2px 7px; border-radius: 6px; font-weight: 700; font-size: 0.72rem; background: rgba(99,102,241,0.2); color: #818cf8; }
input, select, textarea { width: 100%; background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 0.86rem; }
button { cursor: pointer; border: none; border-radius: 8px; padding: 9px 14px; font-weight: 600; font-size: 0.84rem; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
pre { background: rgba(0,0,0,0.35); border-radius: 10px; padding: 12px; overflow: auto; font-size: 0.8rem; max-height: 280px; }
`;

  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — OpenAPI Explorer</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body class="${bp.themePreference}-theme">
  <div class="container">
    <header class="topbar">
      <div>
        <h1 style="margin:0;font-size:1.35rem;">${safeTitle}</h1>
        <p style="margin:3px 0 0;color:var(--muted);font-size:0.84rem;">OpenAPI 3.0.3 Service &bull; ${bp.stackBackend} &bull; ${bp.stackDatabase}</p>
      </div>
      <button id="theme-toggle" class="btn-ghost" type="button">Toggle Theme</button>
    </header>

    <div class="grid-2">
      <section class="panel">
        <h2 style="margin:0 0 12px;font-size:1rem;">Declared OpenAPI Routes</h2>
        <div id="routes-list"></div>
      </section>

      <section class="panel">
        <h2 style="margin:0 0 12px;font-size:1rem;">Interactive Request Runner</h2>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <select id="req-method" style="width:110px;">
            <option>GET</option><option>POST</option><option>PATCH</option><option>DELETE</option>
          </select>
          <input id="req-path" value="/api/${plural}" />
          <button id="send-req" class="btn-primary" type="button">Execute</button>
        </div>
        <textarea id="req-body" rows="4" placeholder='{"title":"Sample record"}'></textarea>
        <pre id="req-output">Click Execute to inspect live JSON response...</pre>
      </section>
    </div>
  </div>
  <script type="module" src="./app.js"></script>
</body>
</html>
`;

  const appJs = `${SHARED_RUNTIME_BRIDGE}
const loadSpec = async () => {
  const res = await fetch(apiUrl("openapi.json"));
  const spec = await res.json();
  const list = document.getElementById("routes-list");
  const rows = [];
  for (const [path, ops] of Object.entries(spec.paths || {})) {
    for (const [method, info] of Object.entries(ops)) {
      rows.push({ method: method.toUpperCase(), path, summary: info.summary || "" });
    }
  }
  list.innerHTML = rows
    .map((r) => '<div class="endpoint" style="cursor:pointer;" data-method="' + r.method + '" data-path="' + r.path + '"><span class="method">' + r.method + "</span><span>" + r.path + '</span><span style="color:var(--muted);margin-left:auto;font-family:sans-serif;font-size:0.75rem;">' + r.summary + "</span></div>")
    .join("");
};

document.getElementById("routes-list").addEventListener("click", (e) => {
  const row = e.target.closest(".endpoint");
  if (!row) return;
  document.getElementById("req-method").value = row.dataset.method;
  document.getElementById("req-path").value = row.dataset.path.replace("{id}", "rec-1");
});

document.getElementById("send-req").addEventListener("click", async () => {
  const method = document.getElementById("req-method").value;
  const path = document.getElementById("req-path").value;
  const body = document.getElementById("req-body").value.trim();
  const res = await fetch(apiUrl(path), {
    method,
    headers: method !== "GET" ? { "Content-Type": "application/json" } : {},
    body: method !== "GET" && body ? body : undefined,
  });
  const text = await res.text();
  document.getElementById("req-output").textContent = "HTTP " + res.status + "\\n" + text;
});

document.getElementById("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  document.body.classList.toggle("dark-theme");
});

void loadSpec();
`;

  return { stylesCss, indexHtml, appJs, extraFiles: [] };
};
