/**
 * Fills the database with mock entries for testing. They are marked
 * source "mock", so they are easy to tell apart and to remove; real entries
 * are never touched. Re-running replaces the previous mock set instead of
 * adding a second one.
 *
 *   npm run seed          replace the mock entries
 *   npm run seed:clear    remove them
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { loadTaxonomy } from "./taxonomy.ts";
import type { NewEntry } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(HERE, "tasking.db");
const TAXONOMY_PATH = process.env.TAXONOMY_PATH ?? join(HERE, "..", "tasking.json");
const SOURCE = "mock";

type App = Pick<NewEntry, "appId" | "appName" | "appExe">;

const firefox: App = { appId: "firefox_firefox.desktop", appName: "Firefox", appExe: "/snap/firefox/current/usr/lib/firefox/firefox" };
const chrome: App = { appId: "google-chrome.desktop", appName: "Google Chrome", appExe: "/opt/google/chrome/chrome" };
const code: App = { appId: "code.desktop", appName: "Visual Studio Code", appExe: "/usr/share/code/code" };
const slack: App = { appId: "slack_slack.desktop", appName: "Slack", appExe: "/snap/slack/current/usr/lib/slack/slack" };
const files: App = { appId: "org.gnome.Nautilus.desktop", appName: "Files", appExe: "/usr/bin/nautilus" };
const terminal: App = { appId: "org.gnome.Ptyxis.desktop", appName: "Terminal", appExe: "/usr/bin/ptyxis" };
// Captured with no window focused, e.g. from the desktop.
const none: App = { appId: null, appName: null, appExe: null };

// [hours ago, category, text, note, app, window title]
const mocks: [number, string, string, string, App, string | null][] = [
  // todo
  [2, "todo", "Renew the car insurance before 30 September", "", chrome, "Pojištění vozidla – Allianz - Google Chrome"],
  [4, "todo", "npm audit reports 2 moderate vulnerabilities", "check whether express is affected", terminal, "podlomar@omen: ~/Personal/tasking/server"],
  [5, "todo", "Fix the flaky test in db.test.ts", "fails about 1 in 10 runs on CI", code, "db.test.ts - tasking - Visual Studio Code"],
  [20, "todo", "Call the dentist to move Thursday's appointment", "ask for a morning slot", none, null],
  [30, "todo", "Review the pull request for the export feature", "", chrome, "Add CSV export · Pull Request #42 · podlomar/mytasks - Google Chrome"],
  [50, "todo", "", "Send Pavel the photos from the weekend", none, null],
  [72, "todo", "Zaplatit fakturu za elektřinu", "splatnost 20. 9.", firefox, "ČEZ – Moje faktury — Mozilla Firefox"],

  // buy, with no subcategory: the category's default
  [12, "buy", "Gift for Jana's birthday", "something for the garden?", none, null],
  [100, "buy", "Replacement filter for the water jug", "", chrome, "BRITA Maxtra Pro filtry - Google Chrome"],

  // buy subcategories
  [3, "buy:gro", "vejce", "10 ks", none, null],
  [8, "buy:gro", "coffee beans", "the Ethiopian one", firefox, "Etiopie Yirgacheffe – výběrová káva — Mozilla Firefox"],
  [26, "buy:gro", "dishwasher tablets", "", none, null],
  [27, "buy:gro", "smetana ke šlehání", "2×, na svíčkovou", firefox, "Svíčková na smetaně – recept — Mozilla Firefox"],
  [40, "buy:hom", "KALLAX shelf insert with doors", "white, 2 pcs", chrome, "KALLAX Vložka s dvířky, bílá - IKEA - Google Chrome"],
  [150, "buy:hom", "Frying pan 28 cm", "must work on induction", firefox, "Tefal Unlimited 28 cm — Mozilla Firefox"],
  [15, "buy:ele", "USB-C charger 65 W", "for the travel bag", chrome, "Anker Nano II 65W Charger - Google Chrome"],
  [200, "buy:ele", "Samsung 990 PRO 2TB", "compare with WD SN850X", firefox, "Samsung 990 PRO 2TB | Alza.cz — Mozilla Firefox"],
  [90, "buy:clo", "Trail running shoes", "size 44, wide fit", chrome, "Salomon Speedcross 6 - Google Chrome"],
  [60, "buy:pha", "sunscreen SPF 50", "", none, null],
  [61, "buy:pha", "vitamín D", "", none, null],
  [300, "buy:hob", "Guitar strings, 10–46 gauge", "Elixir Nanoweb", firefox, "Elixir Electric Nanoweb 10-46 — Mozilla Firefox"],

  // link
  [6, "link", "https://github.com/sindresorhus/awesome", "for the weekend reading list", chrome, "sindresorhus/awesome: 😎 Awesome lists about all kinds of interesting topics - Google Chrome"],
  [25, "link", "Write-Ahead Logging", "https://sqlite.org/wal.html", firefox, "Write-Ahead Logging — Mozilla Firefox"],
  [48, "link", "Port Extensions to GNOME Shell 50", "", chrome, "Port Extensions to GNOME Shell 50 | GNOME JavaScript - Google Chrome"],
  [120, "link", "Designing resilient HTTP clients", "the retry budget section", firefox, "Designing resilient HTTP clients — Mozilla Firefox"],

  // note
  [10, "note", "The retry budget should be per-endpoint, not global.", "came up in the architecture review", slack, "architecture-review (Channel) - Acme - Slack"],
  [18, "note", "", "The parking garage closes at 22:00", none, null],
  [36, "note", "Ideas for the tasking app:\n- a weekly review view\n- snooze a todo until a date\n- export to Markdown", "", code, "README.md - tasking - Visual Studio Code"],
  [70, "note", "Scans of the car documents are in ~/Documents/auto", "", files, "auto — Files"],
  [400, "note", "Wi-Fi password at the cottage: on the card on the fridge", "", none, null],

  // media
  [22, "media", "SQLite at the Edge", "podcast episode", chrome, "SQLite at the Edge - Software Engineering Daily - Google Chrome"],
  [55, "media", "The Godfather", "the restored 4K version", chrome, "The Godfather (1972) - IMDb - Google Chrome"],
  [80, "media", "Thinking in Systems – Donella Meadows", "recommended by Pavel", none, null],
  [130, "media", "Severance, season 2", "", firefox, "Severance | Apple TV+ — Mozilla Firefox"],

  // place
  [45, "place", "Café Lounge, Plaská 8, Praha", "great flat white, quiet in the morning", chrome, "Café Lounge - Google Maps - Google Chrome"],
  [96, "place", "Lokál Dlouhá", "for the team dinner, book ahead", none, null],
  [170, "place", "Museum Kampa", "the Kupka exhibition", firefox, "Museum Kampa — Mozilla Firefox"],

  // event
  [28, "event", "JSConf Prague, 14 November", "early bird ends 1 October", chrome, "JSConf Prague 2026 - Google Chrome"],
  [110, "event", "Dýňový festival na statku", "s dětmi", none, null],
  [250, "event", "Radiohead – O2 arena, 3 October", "", firefox, "Radiohead | Ticketportal — Mozilla Firefox"],

  // person
  [33, "person", "Jana Svobodová – UX researcher", "met at the meetup, interested in the tasking app", slack, "Jana Svobodová - Acme - Slack"],
  [140, "person", "MUDr. Petr Novák, the new GP", "", firefox, "MUDr. Petr Novák – praktický lékař — Mozilla Firefox"],
  [160, "person", "Tomáš the plumber, +420 123 456 789", "fixed the leaking tap last time", none, null],
];

const db = openDb(DB_PATH);

if (process.argv.includes("--clear")) {
  console.log(`removed ${db.removeBySource(SOURCE)} mock entries`);
  db.close();
  process.exit(0);
}

// Check before deleting anything, so a bad mock never leaves you with none.
const taxonomy = loadTaxonomy(TAXONOMY_PATH);
const valid = new Set(taxonomy.flatMap((c) => [c.key, ...c.subcategories.map((s) => `${c.key}:${s.key}`)]));
const unknown = [...new Set(mocks.map((m) => m[1]).filter((c) => !valid.has(c)))];
if (unknown.length > 0) {
  console.error(`mock categories not in ${TAXONOMY_PATH}: ${unknown.join(", ")}`);
  process.exit(1);
}

const removed = db.removeBySource(SOURCE);
const now = Date.now();
for (const [hoursAgo, category, text, note, app, windowTitle] of mocks) {
  db.add({
    date: new Date(now - hoursAgo * 3_600_000).toISOString(),
    text,
    note,
    source: SOURCE,
    category,
    ...app,
    windowTitle,
  });
}
db.close();

const counts = Object.entries(Object.groupBy(mocks, (m) => m[1])).map(([c, ms]) => `${c} ${ms!.length}`);
console.log(`replaced ${removed} mock entries with ${mocks.length}: ${counts.join(", ")}`);
