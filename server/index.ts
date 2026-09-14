import express from "express";
import { existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { loadTaxonomy, type Category } from "./taxonomy.ts";
import type { CategorySummary, Entry, EntryGroup, NewEntry } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(HERE, "tasking.db");
const TAXONOMY_PATH = process.env.TAXONOMY_PATH ?? join(HERE, "..", "tasking.json");
const WEB_DIST = process.env.WEB_DIST ?? join(HERE, "..", "web", "dist");
const PORT = Number(process.env.PORT ?? 4123);
// Local only by default: everything captured is personal.
const HOST = process.env.HOST ?? "127.0.0.1";

const db = openDb(DB_PATH);
const app = express();
app.use(express.json({ limit: "1mb" }));

/** A non-empty string, or null. */
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Narrow an unknown body into a NewEntry, filling gaps with nulls. */
function normalize(body: unknown): NewEntry | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.text !== "string") return null;

  return {
    date: str(b.date) ?? new Date().toISOString(),
    text: b.text,
    note: typeof b.note === "string" ? b.note : "",
    source: str(b.source) ?? "unknown",
    category: str(b.category),
    appId: str(b.appId),
    appName: str(b.appName),
    appExe: str(b.appExe),
    windowTitle: str(b.windowTitle),
  };
}

/** One-line preview so the terminal stays readable during testing. */
function preview(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

/** tasking.json, read fresh; on failure answers 500 and returns null. */
function readTaxonomy(res: express.Response): Category[] | null {
  try {
    return loadTaxonomy(TAXONOMY_PATH);
  } catch (err: any) {
    res.status(500).json({ error: `could not read ${TAXONOMY_PATH}: ${err.message}` });
    return null;
  }
}

/**
 * Groups in tasking.json order, led by the entries stored under the category
 * alone. Every group is present even when empty, so a client can lay out all
 * sections. A subcategory found in stored entries but no longer in
 * tasking.json gets a group at the end, so grouping never drops an entry.
 */
function groupBySubcategory(category: Category, only: string | null, entries: Entry[]): EntryGroup[] {
  const groups: EntryGroup[] = only
    ? category.subcategories.filter((s) => s.key === only).map((s) => ({ subcategory: s.key, name: s.name, entries: [] }))
    : [
        { subcategory: null, name: null, entries: [] },
        ...category.subcategories.map((s) => ({ subcategory: s.key, name: s.name, entries: [] as Entry[] })),
      ];

  for (const entry of entries) {
    const sub = entry.category?.split(":")[1] ?? null;
    let group = groups.find((g) => g.subcategory === sub);
    if (!group) {
      group = { subcategory: sub, name: null, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

// --- API ---------------------------------------------------------------------

const api = express.Router();

api.post("/captures", (req, res) => {
  const entry = normalize(req.body);
  if (!entry) {
    console.warn("  rejected: body must be an object with a string `text`");
    return res.status(400).json({ error: "expected an object with a string `text` field" });
  }

  const stored = db.add(entry);

  const tag = stored.category ? `  [${stored.category}]` : "";
  console.log(`\n  #${stored.id}  ${stored.date}  from ${stored.appName ?? "unknown app"}${tag}`);
  if (stored.windowTitle) console.log(`  window    ${preview(stored.windowTitle)}`);
  console.log(`  text      ${stored.text ? preview(stored.text) : "(empty)"}`);
  if (stored.note) console.log(`  note      ${preview(stored.note)}`);

  res.status(201).json(stored);
});

api.get("/captures", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 1000);
  res.json(db.latest(limit));
});

/** Every category in tasking.json, with how many entries each holds. */
api.get("/categories", (_req, res) => {
  const taxonomy = readTaxonomy(res);
  if (!taxonomy) return;

  const counts = db.countsByCategory();
  const summaries: CategorySummary[] = taxonomy.map((c) => {
    // Plain entries, every subcategory, and any subcategory no longer in tasking.json.
    let count = 0;
    for (const [category, n] of counts) {
      if (category === c.key || category.startsWith(`${c.key}:`)) count += n;
    }
    return {
      key: c.key,
      description: c.description,
      count,
      subcategories: c.subcategories.map((s) => ({ ...s, count: counts.get(`${c.key}:${s.key}`) ?? 0 })),
    };
  });
  res.json(summaries);
});

/** One category, e.g. /api/categories/buy, or one subcategory, /api/categories/buy:gro. */
api.get("/categories/:category", (req, res) => {
  const group = req.query.group;
  if (group !== undefined && group !== "subcategory") {
    return res.status(400).json({ error: 'group must be "subcategory"' });
  }

  const taxonomy = readTaxonomy(res);
  if (!taxonomy) return;

  const parts = req.params.category.split(":");
  const category = parts.length <= 2 ? taxonomy.find((c) => c.key === parts[0]) : undefined;
  if (!category) {
    return res.status(404).json({ error: `unknown category "${req.params.category}"` });
  }
  const sub = parts[1] ?? null;
  if (sub !== null && !category.subcategories.some((s) => s.key === sub)) {
    return res.status(404).json({ error: `unknown subcategory "${sub}" in "${category.key}"` });
  }

  const entries = db.inCategory(req.params.category);
  res.json(group === "subcategory" ? groupBySubcategory(category, sub, entries) : entries);
});

api.get("/health", (_req, res) => res.json({ ok: true }));

// Unknown API paths are JSON errors, never the web app's HTML.
api.use((_req, res) => res.status(404).json({ error: "no such API endpoint" }));

app.use("/api", api);

// --- Web app -----------------------------------------------------------------

// Built files from web/dist, then index.html for any other page address, so
// client-side routes like /buy survive a reload. Paths with a file extension
// are not pages: a missing asset stays a 404.
app.use(express.static(WEB_DIST));
app.use((req, res, next) => {
  if (req.method !== "GET" || extname(req.path)) return next();
  const index = join(WEB_DIST, "index.html");
  if (!existsSync(index)) {
    return res.status(503).type("text").send('The web app is not built yet: run "npm run build" in web/.');
  }
  res.sendFile(index);
});

app.listen(PORT, HOST, () => {
  console.log(`\n  tasking server listening on http://${HOST}:${PORT}`);
  console.log(`  POST /api/captures                store an entry`);
  console.log(`  GET  /api/captures                list recent entries`);
  console.log(`  GET  /api/categories              categories with counts`);
  console.log(`  GET  /api/categories/:category    entries in one category (?group=subcategory)`);
  console.log(`  web app from ${WEB_DIST}`);
  console.log(`  storing to ${DB_PATH} (table: entries)`);
  console.log(`  categories from ${TAXONOMY_PATH}\n`);
});
