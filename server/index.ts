import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import type { NewEntry } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(HERE, "tasking.db");
const PORT = Number(process.env.PORT ?? 4123);

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

app.post("/captures", (req, res) => {
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

app.get("/captures", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 1000);
  res.json(db.latest(limit));
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  tasking server listening on http://127.0.0.1:${PORT}`);
  console.log(`  POST /captures   store an entry`);
  console.log(`  GET  /captures   list recent entries`);
  console.log(`  storing to ${DB_PATH} (table: entries)\n`);
});
