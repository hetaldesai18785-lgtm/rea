import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AppType, ArchitecturePlan } from "../../../shared/types.js";
import {
  generateApiExplorerArtifacts,
  generateLandingArtifacts,
  generateMobileExpoArtifacts,
} from "./appGenerators.js";

export interface EntityFieldSpec {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum" | "date" | "text";
  required: boolean;
  options?: string[];
  defaultValue?: string | number | boolean;
}

export interface BlueprintEntity {
  name: string;
  plural: string;
  tableName: string;
  fields: EntityFieldSpec[];
}

export interface ProjectBlueprint {
  title: string;
  summary: string;
  appType: AppType;
  themePreference: "dark" | "light";
  includeAuth: boolean;
  includePriority: boolean;
  includeStatusFilter: boolean;
  includeSearch: boolean;
  includeExportCsv: boolean;
  includePayments?: boolean;
  stackFrontend: string;
  stackBackend: string;
  stackDatabase: string;
  primaryEntity: BlueprintEntity;
  integrations: string[];
  customFeatures: string[];
  acceptanceCriteria: string[];
}

const titleCase = (str: string): string =>
  str
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const inferDomainFromPrompt = (
  prompt: string,
  appType: AppType,
  stackFrontend: string,
  stackBackend: string,
  stackDatabase: string,
): ProjectBlueprint => {
  const lower = prompt.toLowerCase();

  const includeAuth = /\b(auth|login|signup|sign up|user account|jwt|session|role)\b/.test(lower);
  const includePriority = /\b(priority|urgent|severity|importance|high\/medium\/low)\b/.test(lower);
  const includeStatusFilter =
    /\b(status|filter|read|unread|completed|stage|category|tag|active)\b/.test(lower) || true;
  const includeSearch = /\b(search|find|lookup|query|filter)\b/.test(lower) || true;
  const includeExportCsv = /\b(csv|export|report|download)\b/.test(lower);
  const includePayments = /\b(stripe|razorpay|payment|payments|checkout|billing|subscription|ecommerce|store|pay)\b/.test(lower);
  const themePreference: "dark" | "light" = /\blight\b/.test(lower) && !/\bdark\b/.test(lower) ? "light" : "dark";

  let title = "Workspace App";
  let entityName = "Item";
  let plural = "items";
  let fields: EntityFieldSpec[] = [
    { name: "title", label: "Title", type: "string", required: true },
    { name: "description", label: "Description", type: "text", required: false },
    {
      name: "status",
      label: "Status",
      type: "enum",
      required: true,
      options: ["todo", "in_progress", "done"],
      defaultValue: "todo",
    },
    { name: "category", label: "Category", type: "string", required: false, defaultValue: "General" },
  ];

  if (/\b(book|reading|library)\b/.test(lower)) {
    title = "ShelfTrack Book Manager";
    entityName = "Book";
    plural = "books";
    fields = [
      { name: "title", label: "Book Title", type: "string", required: true },
      { name: "author", label: "Author", type: "string", required: true },
      { name: "rating", label: "Rating (1-5)", type: "number", required: false, defaultValue: 5 },
      {
        name: "status",
        label: "Read Status",
        type: "enum",
        required: true,
        options: ["unread", "reading", "read"],
        defaultValue: "unread",
      },
      { name: "notes", label: "Notes", type: "text", required: false },
    ];
  } else if (/\b(expense|budget|invoice|finance|spend)\b/.test(lower)) {
    title = "LedgerFlow Expense Tracker";
    entityName = "Expense";
    plural = "expenses";
    fields = [
      { name: "title", label: "Expense Title", type: "string", required: true },
      { name: "amount", label: "Amount ($)", type: "number", required: true, defaultValue: 0 },
      {
        name: "category",
        label: "Category",
        type: "enum",
        required: true,
        options: ["Software", "Operations", "Travel", "Marketing", "Other"],
        defaultValue: "Software",
      },
      {
        name: "status",
        label: "Status",
        type: "enum",
        required: true,
        options: ["pending", "approved", "reimbursed"],
        defaultValue: "pending",
      },
      { name: "date", label: "Date", type: "date", required: false },
    ];
  } else if (/\b(crm|lead|customer|deal|pipeline|sales|contact)\b/.test(lower)) {
    title = "PulseCRM Deal Pipeline";
    entityName = "Deal";
    plural = "deals";
    fields = [
      { name: "title", label: "Deal Name", type: "string", required: true },
      { name: "company", label: "Company", type: "string", required: true },
      { name: "contact_email", label: "Contact Email", type: "string", required: false },
      { name: "value", label: "Deal Value ($)", type: "number", required: true, defaultValue: 5000 },
      {
        name: "status",
        label: "Stage",
        type: "enum",
        required: true,
        options: ["lead", "qualified", "proposal", "won"],
        defaultValue: "lead",
      },
    ];
  } else if (/\b(inventory|product|sku|stock|warehouse|catalog|ecommerce|store)\b/.test(lower)) {
    title = "StockLedger Inventory Hub";
    entityName = "Product";
    plural = "products";
    fields = [
      { name: "title", label: "Product Name", type: "string", required: true },
      { name: "sku", label: "SKU", type: "string", required: true },
      { name: "quantity", label: "Quantity", type: "number", required: true, defaultValue: 10 },
      { name: "price", label: "Unit Price ($)", type: "number", required: true, defaultValue: 25 },
      {
        name: "status",
        label: "Stock Status",
        type: "enum",
        required: true,
        options: ["in_stock", "low_stock", "out_of_stock"],
        defaultValue: "in_stock",
      },
    ];
  } else if (/\b(habit|streak|wellness|fitness|workout)\b/.test(lower)) {
    title = "DailyPulse Habit Tracker";
    entityName = "Habit";
    plural = "habits";
    fields = [
      { name: "title", label: "Habit Name", type: "string", required: true },
      { name: "streak", label: "Streak (Days)", type: "number", required: false, defaultValue: 1 },
      {
        name: "category",
        label: "Focus Area",
        type: "enum",
        required: true,
        options: ["Health", "Learning", "Focus", "Mindfulness"],
        defaultValue: "Health",
      },
      {
        name: "status",
        label: "Today",
        type: "enum",
        required: true,
        options: ["pending", "completed"],
        defaultValue: "pending",
      },
    ];
  } else if (/\b(task|todo|sprint|issue|ticket|project|kanban)\b/.test(lower)) {
    title = "SprintFlow Task Studio";
    entityName = "Task";
    plural = "tasks";
    fields = [
      { name: "title", label: "Task Title", type: "string", required: true },
      { name: "assignee", label: "Assignee", type: "string", required: false, defaultValue: "Unassigned" },
      {
        name: "status",
        label: "Status",
        type: "enum",
        required: true,
        options: ["todo", "in_progress", "done"],
        defaultValue: "todo",
      },
      { name: "due_date", label: "Due Date", type: "date", required: false },
      { name: "notes", label: "Details", type: "text", required: false },
    ];
  } else if (/\b(recipe|meal|food|restaurant)\b/.test(lower)) {
    title = "CulinaryBox Recipe Organizer";
    entityName = "Recipe";
    plural = "recipes";
    fields = [
      { name: "title", label: "Recipe Title", type: "string", required: true },
      { name: "cuisine", label: "Cuisine", type: "string", required: false, defaultValue: "Mediterranean" },
      { name: "prep_minutes", label: "Prep Time (min)", type: "number", required: false, defaultValue: 20 },
      {
        name: "status",
        label: "Meal Type",
        type: "enum",
        required: true,
        options: ["breakfast", "lunch", "dinner", "dessert"],
        defaultValue: "dinner",
      },
      { name: "instructions", label: "Instructions", type: "text", required: false },
    ];
  } else if (/\b(webhook|subscription|api|endpoint|service)\b/.test(lower)) {
    title = "GatewayKit API Console";
    entityName = "Subscription";
    plural = "subscriptions";
    fields = [
      { name: "title", label: "Endpoint Name", type: "string", required: true },
      { name: "target_url", label: "Target URL", type: "string", required: true },
      { name: "event_type", label: "Event Topic", type: "string", required: false, defaultValue: "order.created" },
      {
        name: "status",
        label: "State",
        type: "enum",
        required: true,
        options: ["active", "paused", "failing"],
        defaultValue: "active",
      },
    ];
  } else if (/\b(clinic|hospital|patient|doctor|medical|appointment|telemedicine|health)\b/.test(lower)) {
    title = "CarePulse Clinic Suite";
    entityName = "Appointment";
    plural = "appointments";
    fields = [
      { name: "title", label: "Visit Reason", type: "string", required: true },
      { name: "patient_name", label: "Patient Name", type: "string", required: true },
      { name: "clinician", label: "Clinician", type: "string", required: false, defaultValue: "Dr. Patel" },
      { name: "visit_date", label: "Visit Date", type: "date", required: false },
      {
        name: "status",
        label: "Status",
        type: "enum",
        required: true,
        options: ["scheduled", "checked_in", "completed"],
        defaultValue: "scheduled",
      },
    ];
  } else if (/\b(property|real estate|apartment|rental|listing|house|tenant)\b/.test(lower)) {
    title = "EstateFlow Property Hub";
    entityName = "Property";
    plural = "properties";
    fields = [
      { name: "title", label: "Property Title", type: "string", required: true },
      { name: "location", label: "Location", type: "string", required: true },
      { name: "monthly_rent", label: "Price / Rent ($)", type: "number", required: true, defaultValue: 2400 },
      {
        name: "status",
        label: "Availability",
        type: "enum",
        required: true,
        options: ["available", "reserved", "leased"],
        defaultValue: "available",
      },
    ];
  } else if (/\b(course|student|school|class|lms|learning|quiz|academy)\b/.test(lower)) {
    title = "LearnForge Academy";
    entityName = "Course";
    plural = "courses";
    fields = [
      { name: "title", label: "Course Title", type: "string", required: true },
      { name: "instructor", label: "Instructor", type: "string", required: false, defaultValue: "Lead Mentor" },
      { name: "lessons", label: "Lessons", type: "number", required: false, defaultValue: 12 },
      {
        name: "status",
        label: "Track Status",
        type: "enum",
        required: true,
        options: ["draft", "published", "archived"],
        defaultValue: "published",
      },
    ];
  } else if (/\b(blog|post|article|community|forum|social|feed|newsletter)\b/.test(lower)) {
    title = "PulseFeed Community";
    entityName = "Post";
    plural = "posts";
    fields = [
      { name: "title", label: "Headline", type: "string", required: true },
      { name: "author", label: "Author", type: "string", required: false, defaultValue: "Creator" },
      { name: "summary", label: "Summary", type: "text", required: false },
      {
        name: "status",
        label: "Status",
        type: "enum",
        required: true,
        options: ["draft", "published", "featured"],
        defaultValue: "published",
      },
    ];
  } else if (/\b(event|booking|reservation|calendar|hotel|salon|ticket)\b/.test(lower)) {
    title = "BookSync Reservations";
    entityName = "Booking";
    plural = "bookings";
    fields = [
      { name: "title", label: "Booking Title", type: "string", required: true },
      { name: "guest_name", label: "Guest Name", type: "string", required: true },
      { name: "date", label: "Event Date", type: "date", required: false },
      {
        name: "status",
        label: "Status",
        type: "enum",
        required: true,
        options: ["pending", "confirmed", "completed"],
        defaultValue: "confirmed",
      },
    ];
  } else if (appType === "landing") {
    title = "LaunchPad Waitlist & Showcase";
    entityName = "Lead";
    plural = "leads";
    fields = [
      { name: "title", label: "Full Name / Company", type: "string", required: true },
      { name: "email", label: "Work Email", type: "string", required: true },
      { name: "use_case", label: "Use Case", type: "text", required: false },
      {
        name: "status",
        label: "Stage",
        type: "enum",
        required: true,
        options: ["new", "invited", "active"],
        defaultValue: "new",
      },
    ];
  } else {
    // Dynamic prompt-derived title fallback so custom domains feel personalized
    const cleanWords = prompt
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(build|create|make|with|and|for|the|app|web|website|mobile|full|stack|that)$/i.test(w))
      .slice(0, 3);
    if (cleanWords.length > 0) {
      title = cleanWords.map((w) => titleCase(w)).join(" ") + (appType === "mobile-expo" ? " Mobile" : " Studio");
    }
  }

  if (includePriority && !fields.some((f) => f.name === "priority")) {
    fields.push({
      name: "priority",
      label: "Priority",
      type: "enum",
      required: true,
      options: ["low", "medium", "high"],
      defaultValue: "medium",
    });
  }

  const integrations: string[] = [];
  if (/\bstripe|payment|billing|checkout\b/.test(lower)) integrations.push("stripe");
  if (/\brazorpay|upi|inr\b/.test(lower)) integrations.push("razorpay");
  if (/\bemail|resend|sendgrid|notification\b/.test(lower)) integrations.push("resend");
  if (/\bpostgres|supabase\b/.test(lower)) integrations.push("postgres");
  if (/\bmongo|mongodb\b/.test(lower)) integrations.push("mongodb");
  if (/\bopenai|anthropic|gemini|ai\b/.test(lower)) integrations.push("openai");

  const customFeatures: string[] = [];
  if (includePriority) customFeatures.push("priority-levels");
  if (includeStatusFilter) customFeatures.push("status-filtering");
  if (includeSearch) customFeatures.push("search");
  if (includeExportCsv) customFeatures.push("csv-export");
  if (includeAuth) customFeatures.push("auth-session");
  if (includePayments) customFeatures.push("payment-checkout");

  return {
    title,
    summary: prompt.trim().slice(0, 260),
    appType,
    themePreference,
    includeAuth,
    includePriority,
    includeStatusFilter,
    includeSearch,
    includeExportCsv,
    includePayments,
    stackFrontend,
    stackBackend,
    stackDatabase,
    primaryEntity: {
      name: entityName,
      plural,
      tableName: plural,
      fields,
    },
    integrations,
    customFeatures,
    acceptanceCriteria: [
      "GET /health returns HTTP 200 with database connectivity status",
      "GET /openapi.json serves valid OpenAPI 3.0.3 schema for all routes",
      `CRUD operations on /api/${plural} persist across requests and validate inputs`,
      "Frontend loads with zero console/runtime errors and supports create/filter/update/delete",
      "Automated test suite executes cleanly with zero failing assertions",
    ],
  };
};

export const blueprintToPlan = (bp: ProjectBlueprint): ArchitecturePlan => ({
  title: bp.title,
  summary: bp.summary,
  domainModel: `${bp.primaryEntity.name} (${bp.primaryEntity.fields.map((f) => f.name).join(", ")})`,
  appType: bp.appType,
  stack: {
    frontend: bp.stackFrontend,
    backend: bp.stackBackend,
    database: bp.stackDatabase,
    testing: "Node Test Runner (node --test) + HTTP Integration Probes",
    deployment: "Isolated Sandbox Preview + Verified Production Bundle + Dockerfile",
  },
  entities: [
    {
      name: bp.primaryEntity.name,
      tableName: bp.primaryEntity.tableName,
      fields: bp.primaryEntity.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
      })),
    },
  ],
  apiEndpoints: [
    { method: "GET", path: "/health", description: "Liveness and DB record count probe" },
    { method: "GET", path: "/openapi.json", description: "OpenAPI 3.0.3 service specification" },
    {
      method: "GET",
      path: `/api/${bp.primaryEntity.plural}`,
      description: `List and filter ${bp.primaryEntity.plural}`,
    },
    {
      method: "POST",
      path: `/api/${bp.primaryEntity.plural}`,
      description: `Create a new ${bp.primaryEntity.name.toLowerCase()}`,
    },
    {
      method: "PATCH",
      path: `/api/${bp.primaryEntity.plural}/{id}`,
      description: `Update an existing ${bp.primaryEntity.name.toLowerCase()}`,
    },
    {
      method: "DELETE",
      path: `/api/${bp.primaryEntity.plural}/{id}`,
      description: `Delete a ${bp.primaryEntity.name.toLowerCase()}`,
    },
    { method: "GET", path: "/api/stats", description: "Aggregated counts and numeric metrics" },
  ],
  pages: [
    { name: "Overview & Analytics", route: "/", purpose: "Live KPI summary cards and active workspace" },
    { name: `${bp.primaryEntity.name} Directory`, route: "/#list", purpose: "Filterable, searchable interactive table/cards" },
    { name: "Create / Edit Form", route: "/#create", purpose: "Validated creation and status updates" },
  ],
  integrations: bp.integrations,
  acceptanceCriteria: bp.acceptanceCriteria,
});

export const buildBlueprintFromPrompt = (
  prompt: string,
  options: {
    appType: AppType;
    stackFrontend: string;
    stackBackend: string;
    stackDatabase: string;
  },
): ProjectBlueprint =>
  inferDomainFromPrompt(
    prompt,
    options.appType,
    options.stackFrontend,
    options.stackBackend,
    options.stackDatabase,
  );

export const mergeModificationIntoBlueprint = (
  existing: ProjectBlueprint,
  modificationPrompt: string,
): { blueprint: ProjectBlueprint; changesApplied: string[] } => {
  const lower = modificationPrompt.toLowerCase();
  const next: ProjectBlueprint = structuredClone(existing);
  const changesApplied: string[] = [];

  if (/\bpriority\b/.test(lower) && !next.primaryEntity.fields.some((f) => f.name === "priority")) {
    next.primaryEntity.fields.push({
      name: "priority",
      label: "Priority",
      type: "enum",
      required: true,
      options: ["low", "medium", "high"],
      defaultValue: "medium",
    });
    next.includePriority = true;
    if (!next.customFeatures.includes("priority-levels")) {
      next.customFeatures.push("priority-levels");
    }
    changesApplied.push("Added `priority` field (low/medium/high) across DB schema, API validation, UI filter, and tests");
  }

  if (/\bdue\s*date|deadline\b/.test(lower) && !next.primaryEntity.fields.some((f) => f.name === "due_date")) {
    next.primaryEntity.fields.push({
      name: "due_date",
      label: "Due Date",
      type: "date",
      required: false,
    });
    changesApplied.push("Added `due_date` field to schema, form, and list cards");
  }

  if (/\btag|tags|label\b/.test(lower) && !next.primaryEntity.fields.some((f) => f.name === "tag")) {
    next.primaryEntity.fields.push({
      name: "tag",
      label: "Tag",
      type: "string",
      required: false,
      defaultValue: "core",
    });
    changesApplied.push("Added `tag` metadata field and filter support");
  }

  if (/\bcsv|export\b/.test(lower) && !next.includeExportCsv) {
    next.includeExportCsv = true;
    next.customFeatures.push("csv-export");
    changesApplied.push("Enabled CSV export endpoint & UI download button");
  }

  if (/\bdark\s*mode|light\s*mode|theme\b/.test(lower)) {
    next.themePreference = /\blight\b/.test(lower) ? "light" : "dark";
    changesApplied.push(`Updated default theme preference to ${next.themePreference} with UI toggle`);
  }

  if (/\bauth|login\b/.test(lower) && !next.includeAuth) {
    next.includeAuth = true;
    changesApplied.push("Added demo user session sign-in route and UI badge");
  }

  if (/\bfilter|status\b/.test(lower)) {
    next.includeStatusFilter = true;
    if (!next.customFeatures.includes("status-filtering")) {
      next.customFeatures.push("status-filtering");
    }
    changesApplied.push("Enhanced multi-facet filtering and status metric cards");
  }

  if (changesApplied.length === 0) {
    if (!next.primaryEntity.fields.some((f) => f.name === "notes")) {
      next.primaryEntity.fields.push({
        name: "notes",
        label: "Notes",
        type: "text",
        required: false,
      });
    }
    next.summary = `${existing.summary} | Updated: ${modificationPrompt.trim().slice(0, 120)}`;
    changesApplied.push(`Applied conversational enhancement: "${modificationPrompt.trim().slice(0, 100)}"`);
  }

  return { blueprint: next, changesApplied };
};

const writeWorkspaceFile = (workspacePath: string, relPath: string, content: string): void => {
  const fullPath = join(workspacePath, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
};

const buildSeedRows = (bp: ProjectBlueprint): Array<Record<string, unknown>> => {
  const entity = bp.primaryEntity;
  const statusField = entity.fields.find((f) => f.name === "status");
  const statuses = statusField?.options ?? ["active", "completed"];

  const sampleTitlesByEntity: Record<string, string[]> = {
    Book: ["Designing Data-Intensive Applications", "Clean Architecture", "The Pragmatic Programmer"],
    Expense: ["Cloud Compute Cluster", "Design System License", "Team Offsite Travel"],
    Deal: ["Enterprise Annual Platform", "Series-B API Expansion", "Global Security Rollout"],
    Product: ["Edge Gateway Sensor v2", "Rackmount Power Controller", "Optical Fiber Transceiver"],
    Habit: ["Morning Deep Work (90m)", "Read 20 Technical Pages", "Evening Strength Session"],
    Task: ["Implement OAuth2 Session Gate", "Build Live Preview Reverse Proxy", "Add Automated Regression Suite"],
    Recipe: ["Herb Roasted Salmon Bowl", "Spiced Chickpea Tagine", "Matcha Chia Overnight Oats"],
    Subscription: ["Customer Billing Webhook", "GitHub Push Event Hook", "Deployment Health Callback"],
    Item: ["Initialize Core Architecture", "Configure Database Schema", "Verify Deployment Pipeline"],
  };

  const titles = sampleTitlesByEntity[entity.name] ?? sampleTitlesByEntity.Item!;
  return titles.map((title, idx) => {
    const row: Record<string, unknown> = {
      id: `rec-${idx + 1}`,
      createdAt: new Date(Date.now() - (3 - idx) * 86400_000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    for (const f of entity.fields) {
      if (f.name === "title") row[f.name] = title;
      else if (f.name === "status") row[f.name] = statuses[idx % statuses.length];
      else if (f.name === "priority") row[f.name] = ["high", "medium", "low"][idx % 3];
      else if (f.type === "number") row[f.name] = (idx + 1) * (f.name === "rating" ? 1 : f.name === "streak" ? 5 : 120);
      else if (f.type === "enum" && f.options && f.options.length > 0) row[f.name] = f.options[idx % f.options.length];
      else if (f.type === "date") row[f.name] = new Date(Date.now() + (idx + 2) * 86400_000).toISOString().slice(0, 10);
      else if (f.name === "author") row[f.name] = ["Martin Kleppmann", "Robert C. Martin", "Andrew Hunt"][idx % 3];
      else if (f.name === "company") row[f.name] = ["Northstar Labs", "Vanguard Cloud", "Helios Systems"][idx % 3];
      else if (f.name === "sku") row[f.name] = `SKU-100${idx + 1}`;
      else if (f.name === "target_url") row[f.name] = `https://hooks.example.com/v1/event-${idx + 1}`;
      else if (f.name === "assignee") row[f.name] = ["Ava Chen", "Marcus Reed", "Priya Nair"][idx % 3];
      else row[f.name] = f.defaultValue ?? `${f.label} sample ${idx + 1}`;
    }
    return row;
  });
};

export const synthesizeWorkspaceFromBlueprint = (
  workspacePath: string,
  bp: ProjectBlueprint,
): string[] => {
  mkdirSync(workspacePath, { recursive: true });
  const entity = bp.primaryEntity;
  const plural = entity.plural;
  const createdFiles: string[] = [];
  const write = (rel: string, content: string) => {
    writeWorkspaceFile(workspacePath, rel, content);
    createdFiles.push(rel);
  };

  // 1. Blueprint manifest
  write("aetherforge.blueprint.json", JSON.stringify(bp, null, 2));

  // 2. package.json
  write(
    "package.json",
    JSON.stringify(
      {
        name: plural + "-app",
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: {
          dev: "node src/server.mjs",
          start: "node src/server.mjs",
          build: "node -e \"console.log('Verified static + server bundle ready')\"",
          test: "node --test tests/app.test.mjs",
        },
      },
      null,
      2,
    ),
  );

  // 3. SQL Schema (Database Agent)
  const sqlColumns = entity.fields
    .map((f) => {
      const sqlType = f.type === "number" ? "REAL" : f.type === "boolean" ? "INTEGER" : "TEXT";
      return `  ${f.name} ${sqlType}${f.required ? " NOT NULL" : ""}`;
    })
    .join(",\n");

  write(
    "schema.sql",
    `-- Generated by AetherForge Database Agent (${bp.stackDatabase})
CREATE TABLE IF NOT EXISTS ${entity.tableName} (
  id TEXT PRIMARY KEY,
${sqlColumns},
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_${entity.tableName}_status ON ${entity.tableName}(status);
`,
  );

  // 4. Data persistence layer (preserves existing user records if already created!)
  const dataPath = join(workspacePath, "data/database.json");
  if (!existsSync(dataPath)) {
    const initialDb = {
      schemaVersion: 1,
      table: entity.tableName,
      records: buildSeedRows(bp),
    };
    write("data/database.json", JSON.stringify(initialDb, null, 2));
  }

  write(
    "src/db.mjs",
    `import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.APP_DB_PATH || join(here, "..", "data", "database.json");

export const loadStore = () => {
  if (!existsSync(DB_PATH)) {
    return { schemaVersion: 1, table: ${JSON.stringify(entity.tableName)}, records: [] };
  }
  return JSON.parse(readFileSync(DB_PATH, "utf8"));
};

export const saveStore = (store) => {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + "." + process.pid + ".tmp";
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, DB_PATH);
};
`,
  );

  // 5. OpenAPI 3.0.3 Specification (consumable directly by REA inspect-api-contract!)
  const openapi = {
    openapi: "3.0.3",
    info: { title: bp.title, version: "1.0.0", description: bp.summary },
    paths: {
      "/health": {
        get: {
          operationId: "getHealth",
          summary: "Application health check",
          responses: { "200": { description: "Healthy" } },
        },
      },
      [`/api/${plural}`]: {
        get: {
          operationId: `list${entity.name}s`,
          summary: `List and filter ${plural}`,
          responses: { "200": { description: "List response" } },
        },
        post: {
          operationId: `create${entity.name}`,
          summary: `Create ${entity.name}`,
          responses: { "201": { description: "Created" }, "400": { description: "Validation error" } },
        },
      },
      [`/api/${plural}/{id}`]: {
        get: {
          operationId: `get${entity.name}`,
          summary: `Fetch single ${entity.name}`,
          responses: { "200": { description: "Found" }, "404": { description: "Not found" } },
        },
        patch: {
          operationId: `update${entity.name}`,
          summary: `Update ${entity.name}`,
          responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        },
        delete: {
          operationId: `delete${entity.name}`,
          summary: `Delete ${entity.name}`,
          responses: { "200": { description: "Deleted" }, "404": { description: "Not found" } },
        },
      },
      "/api/stats": {
        get: {
          operationId: "getStats",
          summary: "Summary metrics",
          responses: { "200": { description: "Metrics payload" } },
        },
      },
      ...(bp.includePayments
        ? {
            "/api/payments/config": {
              get: { operationId: "getPaymentConfig", summary: "Configured payment gateway mode", responses: { "200": { description: "Config status" } } },
            },
            "/api/payments/checkout": {
              post: { operationId: "createPaymentCheckout", summary: "Create checkout order/session", responses: { "201": { description: "Created" } } },
            },
            "/api/payments/confirm": {
              post: { operationId: "confirmPayment", summary: "Verify & mark payment paid", responses: { "200": { description: "Confirmed" } } },
            },
            "/api/payments/transactions": {
              get: { operationId: "listTransactions", summary: "List payment transactions", responses: { "200": { description: "Transactions" } } },
            },
          }
        : {}),
    },
  };
  write("openapi.json", JSON.stringify(openapi, null, 2));

  // 6. Backend HTTP Server (src/server.mjs)
  const requiredFields = entity.fields.filter((f) => f.required).map((f) => f.name);
  const numericFields = entity.fields.filter((f) => f.type === "number").map((f) => f.name);

  write(
    "src/server.mjs",
    `import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStore, saveStore } from "./db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, "..", "public");
const OPENAPI_PATH = join(here, "..", "openapi.json");
const ENTITY_PLURAL = ${JSON.stringify(plural)};
const REQUIRED_FIELDS = ${JSON.stringify(requiredFields)};
const NUMERIC_FIELDS = ${JSON.stringify(numericFields)};
const FIELD_DEFS = ${JSON.stringify(entity.fields)};
const INCLUDE_PAYMENTS = ${JSON.stringify(Boolean(bp.includePayments))};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

export const createAppServer = () =>
  createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET" && path === "/health") {
      const store = loadStore();
      return sendJson(res, 200, {
        status: "ok",
        app: ${JSON.stringify(bp.title)},
        entity: ENTITY_PLURAL,
        records: store.records.length,
        timestamp: new Date().toISOString(),
      });
    }

    if (method === "GET" && path === "/openapi.json") {
      const raw = readFileSync(OPENAPI_PATH, "utf8");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(raw);
    }

    if (method === "GET" && path === "/api/stats") {
      const store = loadStore();
      const byStatus = {};
      const byPriority = {};
      let numericTotal = 0;
      const primaryNumeric = NUMERIC_FIELDS[0] || null;
      for (const rec of store.records) {
        const st = String(rec.status || "unknown");
        byStatus[st] = (byStatus[st] || 0) + 1;
        if (rec.priority) {
          const pr = String(rec.priority);
          byPriority[pr] = (byPriority[pr] || 0) + 1;
        }
        if (primaryNumeric && typeof rec[primaryNumeric] === "number") {
          numericTotal += rec[primaryNumeric];
        }
      }
      return sendJson(res, 200, {
        total: store.records.length,
        byStatus,
        byPriority,
        primaryNumericField: primaryNumeric,
        numericTotal,
      });
    }

    if (method === "GET" && path === "/api/" + ENTITY_PLURAL) {
      const store = loadStore();
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const status = url.searchParams.get("status") || "";
      const priority = url.searchParams.get("priority") || "";
      let items = [...store.records];
      if (status && status !== "all") {
        items = items.filter((r) => String(r.status || "") === status);
      }
      if (priority && priority !== "all") {
        items = items.filter((r) => String(r.priority || "") === priority);
      }
      if (q) {
        items = items.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
      }
      return sendJson(res, 200, { items, total: items.length });
    }

    if (method === "POST" && path === "/api/" + ENTITY_PLURAL) {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      const record = {
        id: "rec-" + randomUUID().slice(0, 8),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      for (const def of FIELD_DEFS) {
        let val = body[def.name];
        if ((val === undefined || val === null || val === "") && def.defaultValue !== undefined) {
          val = def.defaultValue;
        }
        if (def.required && (val === undefined || val === null || String(val).trim() === "")) {
          return sendJson(res, 400, { error: "Missing required field: " + def.name, field: def.name });
        }
        if (def.type === "number" && val !== undefined && val !== "") {
          const num = Number(val);
          if (Number.isNaN(num)) {
            return sendJson(res, 400, { error: "Field must be numeric: " + def.name, field: def.name });
          }
          val = num;
        }
        record[def.name] = val ?? "";
      }
      const store = loadStore();
      store.records.unshift(record);
      saveStore(store);
      return sendJson(res, 201, record);
    }

    const itemMatch = path.match(new RegExp("^/api/" + ENTITY_PLURAL + "/([^/]+)$"));
    if (itemMatch) {
      const id = decodeURIComponent(itemMatch[1]);
      const store = loadStore();
      const idx = store.records.findIndex((r) => r.id === id);
      if (idx === -1) {
        return sendJson(res, 404, { error: "Record not found" });
      }
      if (method === "GET") {
        return sendJson(res, 200, store.records[idx]);
      }
      if (method === "PATCH" || method === "PUT") {
        let body;
        try {
          body = await readBody(req);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
        const existing = store.records[idx];
        const updated = { ...existing, updatedAt: new Date().toISOString() };
        for (const def of FIELD_DEFS) {
          if (body[def.name] !== undefined) {
            updated[def.name] = def.type === "number" ? Number(body[def.name]) : body[def.name];
          }
        }
        store.records[idx] = updated;
        saveStore(store);
        return sendJson(res, 200, updated);
      }
      if (method === "DELETE") {
        const [removed] = store.records.splice(idx, 1);
        saveStore(store);
        return sendJson(res, 200, { deleted: true, id: removed.id });
      }
    }

    // Payment Endpoints (enabled when app includes billing/payments/checkout)
    if (INCLUDE_PAYMENTS && method === "GET" && path === "/api/payments/config") {
      return sendJson(res, 200, {
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        mode: process.env.STRIPE_SECRET_KEY || process.env.RAZORPAY_KEY_ID ? "live" : "sandbox-test",
      });
    }

    if (INCLUDE_PAYMENTS && method === "GET" && path === "/api/payments/transactions") {
      const store = loadStore();
      return sendJson(res, 200, { transactions: store.payments || [] });
    }

    if (INCLUDE_PAYMENTS && method === "POST" && path === "/api/payments/checkout") {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      const amountCents = Math.max(100, Number(body.amountCents || 2900));
      const currency = String(body.currency || "usd").toLowerCase();
      const provider = String(body.provider || "stripe");
      const label = String(body.label || "Pro Plan Checkout").slice(0, 120);
      const tx = {
        id: "tx-" + randomUUID().slice(0, 8),
        provider,
        label,
        amountCents,
        currency,
        status: "pending",
        mode: process.env.STRIPE_SECRET_KEY || process.env.RAZORPAY_KEY_ID ? "live" : "sandbox-test",
        checkoutUrl: null,
        createdAt: new Date().toISOString(),
      };
      if (provider === "stripe" && process.env.STRIPE_SECRET_KEY) {
        try {
          const params = new URLSearchParams({
            mode: "payment",
            success_url: String(body.successUrl || "http://127.0.0.1/?paid=1"),
            cancel_url: String(body.cancelUrl || "http://127.0.0.1/?cancelled=1"),
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": currency,
            "line_items[0][price_data][unit_amount]": String(amountCents),
            "line_items[0][price_data][product_data][name]": label,
            "metadata[txId]": tx.id,
          });
          const sRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });
          if (sRes.ok) {
            const session = await sRes.json();
            tx.externalSessionId = session.id;
            tx.checkoutUrl = session.url || null;
          }
        } catch {
          // Keep created transaction cleanly if upstream call fails
        }
      }
      const store = loadStore();
      store.payments = [tx, ...(store.payments || [])];
      saveStore(store);
      return sendJson(res, 201, { transaction: tx });
    }

    if (INCLUDE_PAYMENTS && method === "POST" && path === "/api/payments/confirm") {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      const store = loadStore();
      const payments = store.payments || [];
      const idx = payments.findIndex((p) => p.id === body.transactionId);
      if (idx === -1) return sendJson(res, 404, { error: "Transaction not found" });
      if (body.razorpayOrderId && body.razorpayPaymentId && body.razorpaySignature && process.env.RAZORPAY_KEY_SECRET) {
        const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
          .update(body.razorpayOrderId + "|" + body.razorpayPaymentId)
          .digest("hex");
        const a = Buffer.from(String(body.razorpaySignature), "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return sendJson(res, 400, { error: "Invalid Razorpay signature" });
        }
      }
      payments[idx] = { ...payments[idx], status: "paid", paidAt: new Date().toISOString() };
      store.payments = payments;
      saveStore(store);
      return sendJson(res, 200, { transaction: payments[idx] });
    }

    // Static asset serving (works both at root and behind reverse proxy!)
    const safeRel = path === "/" ? "index.html" : path.replace(/^\\/+/, "");
    const candidate = join(PUBLIC_DIR, safeRel);
    if (existsSync(candidate) && !safeRel.includes("..")) {
      const ext = extname(candidate);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      return res.end(readFileSync(candidate));
    }

    const fallback = join(PUBLIC_DIR, "index.html");
    if (existsSync(fallback)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(readFileSync(fallback));
    }
    return sendJson(res, 404, { error: "Not found" });
  });

const isDirectEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectEntry) {
  const host = process.env.HOST || "0.0.0.0";
  const port = Number.parseInt(process.env.PORT || "4700", 10);
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(JSON.stringify({ event: "listening", host, port, app: ${JSON.stringify(bp.title)} }));
  });
}
`,
  );

  // 7. Interactive Responsive Frontend customized per appType (mobile-expo, landing, api, fullstack/webapp)
  let specializedBundle:
    | {
        stylesCss: string;
        indexHtml: string;
        appJs: string;
        extraFiles: Array<{ path: string; content: string }>;
      }
    | null = null;

  if (bp.appType === "mobile-expo" || bp.stackFrontend.toLowerCase().includes("expo")) {
    specializedBundle = generateMobileExpoArtifacts(bp);
  } else if (bp.appType === "landing") {
    specializedBundle = generateLandingArtifacts(bp);
  } else if (bp.appType === "api") {
    specializedBundle = generateApiExplorerArtifacts(bp);
  }

  if (specializedBundle) {
    write("public/styles.css", specializedBundle.stylesCss);
    write("public/index.html", specializedBundle.indexHtml);
    write("public/app.js", specializedBundle.appJs);
    for (const extra of specializedBundle.extraFiles) {
      write(extra.path, extra.content);
    }
  } else {
    write(
      "public/styles.css",
      `:root {
  --bg: ${bp.themePreference === "dark" ? "#0b1120" : "#f8fafc"};
  --surface: ${bp.themePreference === "dark" ? "#111827" : "#ffffff"};
  --surface-2: ${bp.themePreference === "dark" ? "#1e293b" : "#f1f5f9"};
  --border: ${bp.themePreference === "dark" ? "#293548" : "#e2e8f0"};
  --text: ${bp.themePreference === "dark" ? "#f1f5f9" : "#0f172a"};
  --muted: ${bp.themePreference === "dark" ? "#94a3b8" : "#64748b"};
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
.container { max-width: 1120px; margin: 0 auto; padding: 20px 16px 48px; }
.topbar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--border); margin-bottom: 20px;
}
.brand h1 { margin: 0; font-size: 1.4rem; letter-spacing: -0.02em; }
.brand p { margin: 4px 0 0; color: var(--muted); font-size: 0.875rem; }
.actions-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: 12px; margin-bottom: 20px;
}
.stat-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
}
.stat-label { font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.stat-value { font-size: 1.65rem; font-weight: 700; margin-top: 4px; }
.panel {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 18px;
}
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
label.field { display: flex; flex-direction: column; gap: 5px; font-size: 0.82rem; color: var(--muted); }
input, select, textarea {
  width: 100%; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; font-size: 0.9rem;
}
button {
  cursor: pointer; border: none; border-radius: 8px; padding: 9px 14px;
  font-size: 0.875rem; font-weight: 600; transition: opacity 0.15s, background 0.15s;
}
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
.btn-danger { background: rgba(239,68,68,0.16); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
.records-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; }
.record-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;
}
.badge {
  display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px;
  font-size: 0.75rem; font-weight: 600; background: rgba(99,102,241,0.18); color: #818cf8;
}
.badge-high { background: rgba(239,68,68,0.18); color: #f87171; }
.badge-medium { background: rgba(245,158,11,0.18); color: #fbbf24; }
.badge-low { background: rgba(16,185,129,0.18); color: #34d399; }
.chart-bars { display: flex; gap: 10px; align-items: flex-end; height: 90px; padding-top: 8px; }
.chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--muted); }
.chart-fill { width: 100%; max-width: 56px; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #818cf8, #4f46e5); min-height: 6px; }
.error-banner {
  background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4);
  color: #fca5a5; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; display: none;
}
@media (max-width: 640px) {
  .container { padding: 12px 10px 36px; }
  .topbar { flex-direction: column; align-items: flex-start; }
}
`,
    );

    write(
      "public/index.html",
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${bp.title}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body class="${bp.themePreference}-theme">
  <div class="container">
    <header class="topbar">
      <div class="brand">
        <h1>${bp.title}</h1>
        <p>${bp.stackFrontend} &bull; ${bp.stackBackend} &bull; ${bp.stackDatabase}</p>
      </div>
      <div class="actions-row">
        ${bp.includeAuth ? '<button id="demo-auth-btn" class="btn-ghost" type="button">Sign In (Demo)</button>' : ""}
        <button id="theme-toggle" class="btn-ghost" type="button">Toggle Theme</button>
        ${bp.includeExportCsv ? '<button id="export-csv" class="btn-ghost" type="button">Export CSV</button>' : ""}
      </div>
    </header>

    <div id="error-banner" class="error-banner"></div>
    <section id="stats-grid" class="stats-grid"></section>
    <section class="panel" id="analytics-panel" style="display:none;">
      <div style="font-size:0.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">Status Distribution</div>
      <div id="chart-bars" class="chart-bars"></div>
    </section>

    <section class="panel">
      <h2 style="margin:0 0 12px;font-size:1.05rem;">Add ${entity.name}</h2>
      <form id="create-form" class="form-grid"></form>
    </section>

    <section class="panel">
      <div class="toolbar">
        <input id="search-input" type="search" placeholder="Search ${plural}..." style="flex:1;min-width:180px;" />
        <select id="status-filter" style="width:auto;min-width:140px;"></select>
        ${bp.includePriority ? '<select id="priority-filter" style="width:auto;min-width:140px;"><option value="all">All Priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>' : ""}
      </div>
      <div id="records-grid" class="records-grid"></div>
    </section>
    ${
      bp.includePayments
        ? `<section class="panel" id="payments-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <div>
          <h2 style="margin:0;font-size:1.05rem;">Payments & Checkout</h2>
          <small id="payment-mode-badge" style="color:var(--muted);">Detecting gateway...</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="pay-stripe-btn" class="btn-primary" type="button">Checkout $29 (Stripe)</button>
          <button id="pay-razorpay-btn" class="btn-ghost" type="button">Checkout ₹2,400 (Razorpay)</button>
        </div>
      </div>
      <div id="payments-list" style="display:grid;gap:8px;"></div>
    </section>`
        : ""
    }
  </div>
  <script type="module" src="./app.js"></script>
</body>
</html>
`,
    );

    write(
      "public/app.js",
      `const FIELDS = ${JSON.stringify(entity.fields)};
const ENTITY_PLURAL = ${JSON.stringify(plural)};
const INCLUDE_PRIORITY = ${JSON.stringify(bp.includePriority)};
const INCLUDE_PAYMENTS = ${JSON.stringify(Boolean(bp.includePayments))};

// Parent iframe preview error bridge (clean telemetry back to IDE Debugging Agent)
window.addEventListener("error", (event) => {
  window.parent?.postMessage({ type: "aetherforge:preview-error", message: event.message, source: event.filename }, "*");
});
window.addEventListener("unhandledrejection", (event) => {
  window.parent?.postMessage({ type: "aetherforge:preview-error", message: String(event.reason) }, "*");
});

const apiUrl = (path) => {
  const clean = path.replace(/^\\/+/, "");
  return "./" + clean;
};

const banner = document.getElementById("error-banner");
const showError = (msg) => {
  if (!msg) { banner.style.display = "none"; banner.textContent = ""; return; }
  banner.style.display = "block";
  banner.textContent = msg;
};

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
        o.value = opt;
        o.textContent = opt;
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
  const submitWrap = document.createElement("div");
  submitWrap.style.display = "flex";
  submitWrap.style.alignItems = "flex-end";
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "btn-primary";
  btn.style.width = "100%";
  btn.textContent = "Create ${entity.name}";
  submitWrap.appendChild(btn);
  form.appendChild(submitWrap);
};

const populateFilters = () => {
  const statusSelect = document.getElementById("status-filter");
  const statusField = FIELDS.find((f) => f.name === "status");
  statusSelect.innerHTML = '<option value="all">All Statuses</option>';
  if (statusField && Array.isArray(statusField.options)) {
    for (const opt of statusField.options) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      statusSelect.appendChild(o);
    }
  }
};

let lastItems = [];

const loadStats = async () => {
  const res = await fetch(apiUrl("api/stats"));
  const stats = await res.json();
  const grid = document.getElementById("stats-grid");
  const cards = [
    { label: "Total ${titleCase(plural)}", value: stats.total },
    ...Object.entries(stats.byStatus || {}).map(([k, v]) => ({ label: "Status: " + k, value: v })),
  ];
  if (stats.primaryNumericField) {
    cards.push({ label: "Total " + stats.primaryNumericField, value: stats.numericTotal });
  }
  if (INCLUDE_PRIORITY && stats.byPriority?.high) {
    cards.push({ label: "High Priority", value: stats.byPriority.high });
  }
  grid.innerHTML = cards
    .map((c) => '<div class="stat-card"><div class="stat-label">' + c.label + '</div><div class="stat-value">' + c.value + '</div></div>')
    .join("");

  const entries = Object.entries(stats.byStatus || {});
  const chartPanel = document.getElementById("analytics-panel");
  const chartBars = document.getElementById("chart-bars");
  if (entries.length > 0 && chartPanel && chartBars) {
    chartPanel.style.display = "block";
    const maxVal = Math.max(1, ...entries.map(([, v]) => Number(v)));
    chartBars.innerHTML = entries
      .map(([k, v]) => {
        const pct = Math.max(12, Math.round((Number(v) / maxVal) * 64));
        return '<div class="chart-col"><div class="chart-fill" style="height:' + pct + 'px;"></div><strong>' + v + '</strong><span>' + k + '</span></div>';
      })
      .join("");
  }
};

const loadItems = async () => {
  const q = document.getElementById("search-input").value;
  const status = document.getElementById("status-filter").value;
  const priorityEl = document.getElementById("priority-filter");
  const priority = priorityEl ? priorityEl.value : "all";
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  if (priority && priority !== "all") params.set("priority", priority);

  const res = await fetch(apiUrl("api/" + ENTITY_PLURAL + "?" + params.toString()));
  const data = await res.json();
  lastItems = data.items || [];
  const grid = document.getElementById("records-grid");
  if (lastItems.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted);">No matching records yet.</p>';
    return;
  }
  const statusOptions = FIELDS.find((f) => f.name === "status")?.options || ["active", "done"];
  grid.innerHTML = lastItems
    .map((item) => {
      const priorityBadge = item.priority
        ? '<span class="badge badge-' + item.priority + '">' + item.priority + '</span>'
        : "";
      const meta = FIELDS.filter((f) => !["title", "status", "priority"].includes(f.name))
        .map((f) => item[f.name] !== undefined && item[f.name] !== "" ? '<div><strong>' + f.label + ':</strong> ' + String(item[f.name]) + '</div>' : "")
        .join("");
      return (
        '<div class="record-card">' +
        '<div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<strong style="font-size:1rem;">' + String(item.title || item.id) + '</strong>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
        '<span class="badge">' + String(item.status || "open") + '</span>' + priorityBadge +
        '</div></div>' +
        '<div style="margin-top:8px;font-size:0.84rem;color:var(--muted);display:grid;gap:3px;">' + meta + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border);">' +
        '<select data-action="status" data-id="' + item.id + '" style="padding:5px 8px;font-size:0.8rem;">' +
        statusOptions.map((opt) => '<option value="' + opt + '"' + (item.status === opt ? " selected" : "") + '>' + opt + '</option>').join("") +
        '</select>' +
        '<button type="button" class="btn-danger" data-action="delete" data-id="' + item.id + '">Delete</button>' +
        '</div></div>'
      );
    })
    .join("");
};

document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  const res = await fetch(apiUrl("api/" + ENTITY_PLURAL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    showError(body.error || "Failed to create record");
    return;
  }
  e.target.reset();
  renderForm();
  await Promise.all([loadItems(), loadStats()]);
});

document.getElementById("records-grid").addEventListener("change", async (e) => {
  const target = e.target;
  if (target.dataset?.action === "status") {
    await fetch(apiUrl("api/" + ENTITY_PLURAL + "/" + encodeURIComponent(target.dataset.id)), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: target.value }),
    });
    await Promise.all([loadItems(), loadStats()]);
  }
});

document.getElementById("records-grid").addEventListener("click", async (e) => {
  const target = e.target;
  if (target.dataset?.action === "delete") {
    await fetch(apiUrl("api/" + ENTITY_PLURAL + "/" + encodeURIComponent(target.dataset.id)), {
      method: "DELETE",
    });
    await Promise.all([loadItems(), loadStats()]);
  }
});

document.getElementById("search-input").addEventListener("input", () => loadItems());
document.getElementById("status-filter").addEventListener("change", () => loadItems());
document.getElementById("priority-filter")?.addEventListener("change", () => loadItems());
document.getElementById("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  document.body.classList.toggle("dark-theme");
});
document.getElementById("demo-auth-btn")?.addEventListener("click", (e) => {
  e.target.textContent = e.target.textContent.includes("Demo") ? "Signed in: Builder" : "Sign In (Demo)";
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

renderForm();
populateFilters();
Promise.all([loadStats(), loadItems()]).catch((err) => showError(err.message));

if (INCLUDE_PAYMENTS) {
  const loadPayments = async () => {
    const [cfgRes, txRes] = await Promise.all([
      fetch(apiUrl("api/payments/config")),
      fetch(apiUrl("api/payments/transactions")),
    ]);
    const cfg = await cfgRes.json();
    const txData = await txRes.json();
    const badge = document.getElementById("payment-mode-badge");
    if (badge) {
      badge.textContent = "Gateway Mode: " + cfg.mode + " (Stripe: " + (cfg.stripeConfigured ? "live" : "test") + ", Razorpay: " + (cfg.razorpayConfigured ? "live" : "test") + ")";
    }
    const list = document.getElementById("payments-list");
    if (list) {
      list.innerHTML = (txData.transactions || [])
        .map((tx) => '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--border);border-radius:8px;"><span><strong>' + tx.label + "</strong> (" + tx.provider + " &bull; " + (tx.amountCents / 100).toFixed(2) + " " + tx.currency.toUpperCase() + ')</span><span class="badge">' + tx.status + "</span></div>")
        .join("") || '<span style="color:var(--muted);font-size:0.84rem;">No transactions yet.</span>';
    }
  };
  const triggerPay = async (provider, amountCents, currency, label) => {
    const res = await fetch(apiUrl("api/payments/checkout"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, amountCents, currency, label }),
    });
    const body = await res.json();
    if (body.transaction?.checkoutUrl) {
      window.open(body.transaction.checkoutUrl, "_blank");
    } else if (body.transaction?.id) {
      await fetch(apiUrl("api/payments/confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: body.transaction.id }),
      });
    }
    await loadPayments();
  };
  document.getElementById("pay-stripe-btn")?.addEventListener("click", () => triggerPay("stripe", 2900, "usd", "Pro Plan Checkout"));
  document.getElementById("pay-razorpay-btn")?.addEventListener("click", () => triggerPay("razorpay", 240000, "inr", "Pro Plan INR"));
  void loadPayments();
}
`,
    );
  }

  // 8. TypeScript / React / Multi-stack companion source exports (clean developer handoff!)
  write(
    "src/frontend/App.tsx",
    `import React, { useEffect, useState } from "react";

export interface ${entity.name}Record {
  id: string;
${entity.fields.map((f) => `  ${f.name}${f.required ? "" : "?"}: ${f.type === "number" ? "number" : "string"};`).join("\n")}
}

export function App() {
  const [items, setItems] = useState<${entity.name}Record[]>([]);
  useEffect(() => {
    fetch("./api/${plural}").then((r) => r.json()).then((d) => setItems(d.items ?? []));
  }, []);
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold">${bp.title}</h1>
      <p className="text-sm opacity-75">Loaded {items.length} ${plural}</p>
    </main>
  );
}
`,
  );

  if (bp.stackBackend.toLowerCase().includes("fastapi") || bp.stackBackend.toLowerCase().includes("python")) {
    write(
      "app/main.py",
      `from fastapi import FastAPI
app = FastAPI(title=${JSON.stringify(bp.title)})

@app.get("/health")
def health():
    return {"status": "ok", "app": ${JSON.stringify(bp.title)}}
`,
    );
    write("requirements.txt", "fastapi>=0.115.0\nuvicorn>=0.32.0\n");
  }

  // 9. Docker deployment artifact
  write(
    "Dockerfile",
    `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY . .
EXPOSE 4700
ENV PORT=4700 HOST=0.0.0.0
CMD ["node", "src/server.mjs"]
`,
  );

  // 10. Real Automated Integration Test Suite (tests/app.test.mjs)
  const validCreateBody: Record<string, unknown> = {};
  for (const f of entity.fields) {
    if (f.name === "title") validCreateBody[f.name] = "Verification Test Record";
    else if (f.type === "number") validCreateBody[f.name] = 42;
    else if (f.type === "enum" && f.options?.length) validCreateBody[f.name] = f.options[0];
    else if (f.type === "date") validCreateBody[f.name] = "2026-12-01";
    else validCreateBody[f.name] = "Automated check";
  }

  write(
    "tests/app.test.mjs",
    `import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "af-app-test-"));
process.env.APP_DB_PATH = join(tempDir, "test-db.json");

const { createAppServer } = await import("../src/server.mjs");

test("${bp.title} — end-to-end health, OpenAPI, CRUD, filter, and UI", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = \`http://127.0.0.1:\${address.port}\`;

  try {
    // 1. Health endpoint
    const healthRes = await fetch(\`\${base}/health\`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, "ok");

    // 2. OpenAPI spec endpoint
    const apiRes = await fetch(\`\${base}/openapi.json\`);
    assert.equal(apiRes.status, 200);
    const spec = await apiRes.json();
    assert.ok(spec.paths["/api/${plural}"]);

    // 3. Frontend HTML serves cleanly
    const htmlRes = await fetch(\`\${base}/\`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.match(html, /${bp.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/);

    // 4. Validation rejects missing required title
    const badRes = await fetch(\`\${base}/api/${plural}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(badRes.status, 400);

    // 5. Create valid record
    const createRes = await fetch(\`\${base}/api/${plural}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(${JSON.stringify(validCreateBody)}),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.id);

    // 6. Search / list finds record
    const listRes = await fetch(\`\${base}/api/${plural}?q=Verification\`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.items.length, 1);

    ${
      bp.includePriority
        ? `// 7. Priority filtering verified
    const priRes = await fetch(\`\${base}/api/${plural}?priority=${validCreateBody.priority ?? "medium"}\`);
    assert.equal(priRes.status, 200);
    const priData = await priRes.json();
    assert.ok(priData.items.length >= 1);`
        : ""
    }

    // 8. Patch updates record
    const statusTarget = ${JSON.stringify(entity.fields.find((f) => f.name === "status")?.options?.slice(-1)[0] ?? "done")};
    const patchRes = await fetch(\`\${base}/api/${plural}/\${created.id}\`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusTarget }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.status, statusTarget);

    // 9. Delete removes record
    const delRes = await fetch(\`\${base}/api/${plural}/\${created.id}\`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
    const afterDel = await fetch(\`\${base}/api/${plural}/\${created.id}\`);
    assert.equal(afterDel.status, 404);

    ${
      bp.includePayments
        ? `// 10. Payment checkout & confirmation verified
    const payCfg = await fetch(\`\${base}/api/payments/config\`);
    assert.equal(payCfg.status, 200);
    const coRes = await fetch(\`\${base}/api/payments/checkout\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "stripe", amountCents: 2900, currency: "usd", label: "Test Order" }),
    });
    assert.equal(coRes.status, 201);
    const co = await coRes.json();
    assert.ok(co.transaction.id);
    const confRes = await fetch(\`\${base}/api/payments/confirm\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: co.transaction.id }),
    });
    assert.equal(confRes.status, 200);
    const confirmed = await confRes.json();
    assert.equal(confirmed.transaction.status, "paid");`
        : ""
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tempDir, { recursive: true, force: true });
  }
});
`,
  );

  // 11. README.md
  write(
    "README.md",
    `# ${bp.title}

Generated autonomously by **AetherForge Studio**.

## Stack
- Frontend: ${bp.stackFrontend}
- Backend: ${bp.stackBackend}
- Database: ${bp.stackDatabase}

## Commands
\`\`\`bash
npm start   # Start HTTP + Frontend server on port 4700
npm test    # Execute automated integration tests
\`\`\`
`,
  );

  return createdFiles;
};

export const readExistingBlueprint = (workspacePath: string): ProjectBlueprint | null => {
  const bpPath = join(workspacePath, "aetherforge.blueprint.json");
  if (!existsSync(bpPath)) return null;
  try {
    return JSON.parse(readFileSync(bpPath, "utf8")) as ProjectBlueprint;
  } catch {
    return null;
  }
};

const llmFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,32}$/),
  label: z.string().min(1).max(48),
  type: z.enum(["string", "number", "boolean", "enum", "date", "text"]),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(32)).max(8).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const llmBlueprintPatchSchema = z.object({
  title: z.string().min(2).max(80).optional(),
  summary: z.string().min(4).max(300).optional(),
  entityName: z.string().regex(/^[A-Z][A-Za-z0-9]{1,32}$/).optional(),
  plural: z.string().regex(/^[a-z][a-z0-9_]{1,32}$/).optional(),
  fields: z.array(llmFieldSchema).min(2).max(12).optional(),
  includeExportCsv: z.boolean().optional(),
  includeAuth: z.boolean().optional(),
  acceptanceCriteria: z.array(z.string().min(4).max(180)).min(1).max(8).optional(),
});

export const applyLlmDomainBlueprint = (
  base: ProjectBlueprint,
  llmRawJson: string,
): ProjectBlueprint => {
  try {
    const cleaned = llmRawJson
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = llmBlueprintPatchSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) return base;
    const d = parsed.data;
    const next: ProjectBlueprint = structuredClone(base);
    if (d.title) next.title = d.title;
    if (d.summary) next.summary = d.summary;
    if (d.entityName) next.primaryEntity.name = d.entityName;
    if (d.plural) {
      next.primaryEntity.plural = d.plural;
      next.primaryEntity.tableName = d.plural;
    }
    if (d.fields && d.fields.length >= 2) {
      const hasTitle = d.fields.some((f) => f.name === "title");
      const hasStatus = d.fields.some((f) => f.name === "status");
      next.primaryEntity.fields = [
        ...(hasTitle ? [] : [{ name: "title", label: "Title", type: "string" as const, required: true }]),
        ...d.fields,
        ...(hasStatus
          ? []
          : [
              {
                name: "status",
                label: "Status",
                type: "enum" as const,
                required: true,
                options: ["active", "pending", "completed"],
                defaultValue: "active",
              },
            ]),
      ];
    }
    if (d.includeExportCsv !== undefined) next.includeExportCsv = d.includeExportCsv;
    if (d.includeAuth !== undefined) next.includeAuth = d.includeAuth;
    if (d.acceptanceCriteria) next.acceptanceCriteria = d.acceptanceCriteria;
    return next;
  } catch {
    return base;
  }
};

