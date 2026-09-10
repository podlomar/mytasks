import express from "express";
import { appendFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapturePayload, StoredCapture } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE = join(HERE, "captures.jsonl");
const PORT = Number(process.env.PORT ?? 4123);

const app = express();
app.use(express.json({ limit: "2mb" }));

/** Narrow an unknown body into a CapturePayload, filling gaps with nulls. */
function normalize(body: unknown): CapturePayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, any>;
  if (typeof b.text !== "string") return null;

  return {
    capturedAt: typeof b.capturedAt === "string" ? b.capturedAt : new Date().toISOString(),
    text: b.text,
    note: typeof b.note === "string" ? b.note : "",
    category: typeof b.category === "string" && b.category ? b.category : null,
    source: b.source === "primary" || b.source === "clipboard" ? b.source : "none",
    app: {
      id: b.app?.id ?? null,
      name: b.app?.name ?? null,
      wmClass: b.app?.wmClass ?? null,
      gtkApplicationId: b.app?.gtkApplicationId ?? null,
      sandboxedAppId: b.app?.sandboxedAppId ?? null,
      pid: typeof b.app?.pid === "number" ? b.app.pid : null,
      exe: b.app?.exe ?? null,
      cwd: b.app?.cwd ?? null,
    },
    window: {
      title: b.window?.title ?? null,
      id: typeof b.window?.id === "number" ? b.window.id : null,
      workspace: typeof b.window?.workspace === "number" ? b.window.workspace : null,
      monitor: typeof b.window?.monitor === "number" ? b.window.monitor : null,
    },
  };
}

/** One-line preview so the terminal stays readable during testing. */
function preview(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

app.post("/captures", async (req, res) => {
  const payload = normalize(req.body);
  if (!payload) {
    console.warn("  rejected: body must be an object with a string `text`");
    return res.status(400).json({ error: "expected an object with a string `text` field" });
  }

  const stored: StoredCapture = {
    ...payload,
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
  };
  await appendFile(STORE, JSON.stringify(stored) + "\n", "utf8");

  const from = stored.app.name ?? stored.app.wmClass ?? "unknown app";
  const tag = stored.category ? `  [${stored.category}]` : "";
  console.log(`\n  captured  ${stored.id.slice(0, 8)}  from ${from}${tag}`);
  if (stored.window.title) console.log(`  window    ${preview(stored.window.title)}`);
  if (stored.app.cwd) console.log(`  cwd       ${stored.app.cwd}`);
  console.log(`  text      ${stored.text ? preview(stored.text) : "(empty selection)"}`);
  if (stored.note) console.log(`  note      ${preview(stored.note)}`);

  res.status(201).json({ id: stored.id, receivedAt: stored.receivedAt });
});

/** Read the log back, newest first. */
async function readAll(): Promise<StoredCapture[]> {
  try {
    const raw = await readFile(STORE, "utf8");
    return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as StoredCapture);
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

app.get("/captures", async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const all = await readAll();
  res.json(all.reverse().slice(0, limit));
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  tasking server listening on http://127.0.0.1:${PORT}`);
  console.log(`  POST /captures   receive a capture`);
  console.log(`  GET  /captures   list recent captures`);
  console.log(`  storing to ${STORE}\n`);
});
