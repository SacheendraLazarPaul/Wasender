// OpenWA Sender (test1) — backend that holds your API key and talks to OpenWA.
// Browser -> this server -> OpenWA -> WhatsApp. Your key never reaches the browser.
// Multi-session: each "session" = one linked WhatsApp number.

import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const OPENWA_URL = (process.env.OPENWA_URL || "http://localhost:2785").replace(/\/$/, "");
const API_KEY = process.env.OPENWA_API_KEY || "";
const DEFAULT_SESSION = process.env.SESSION_ID || "test1";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://host.docker.internal:" + PORT + "/webhook";
// Optional dashboard password. Empty = no login (local use). Set it to protect the UI.
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const AUTH_TOKEN = APP_PASSWORD ? crypto.createHash("sha256").update("wasender:" + APP_PASSWORD).digest("hex") : "";

const app = express();
app.use(express.json({ limit: "64mb" }));

// --- persistence: inbox / sent / auto-reply survive restarts ----------------
const DATA_FILE = path.join(__dirname, "data.json");
let inbox = [], sent = [];
let autoReply = { enabled: false, text: "" };
try {
  if (fs.existsSync(DATA_FILE)) {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    inbox = d.inbox || []; sent = d.sent || []; autoReply = d.autoReply || autoReply;
  }
} catch (e) { console.warn("Could not load data.json:", e.message); }
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify({ inbox, sent, autoReply })); } catch (e) { console.warn("persist failed:", e.message); }
  }, 400);
}
function recordSent(entry) { sent.unshift({ at: Date.now(), ...entry }); if (sent.length > 200) sent.length = 200; persist(); }

// --- optional auth ----------------------------------------------------------
app.get("/api/me", (req, res) => res.json({ ok: true, authRequired: !!APP_PASSWORD, authed: !APP_PASSWORD || req.headers["x-auth-token"] === AUTH_TOKEN }));
app.post("/api/login", (req, res) => {
  if (!APP_PASSWORD) return res.json({ ok: true, token: "" });
  if (String(req.body.password || "") === APP_PASSWORD) return res.json({ ok: true, token: AUTH_TOKEN });
  res.status(401).json({ ok: false, message: "Wrong password" });
});
// Gate every other /api/* route when a password is configured.
app.use("/api", (req, res, next) => {
  if (!APP_PASSWORD || req.headers["x-auth-token"] === AUTH_TOKEN) return next();
  res.status(401).json({ ok: false, message: "Unauthorized" });
});

app.use(express.static(path.join(__dirname, "dist"))); // built React app (run `npm run build`)

// --- OpenWA REST helper -----------------------------------------------------
async function openwa(method, endpoint, body) {
  const res = await fetch(`${OPENWA_URL}/api${endpoint}`, {
    method,
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const m = data?.message || data?.error || `HTTP ${res.status}`;
    const err = new Error(Array.isArray(m) ? m.join(", ") : m);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Which session does this request target? ?session= , body.session , else default.
function nameOf(req) {
  return String(req.query?.session || req.body?.session || DEFAULT_SESSION);
}

// Find a session by name; create it if missing. OpenWA addresses by UUID `id`.
async function resolveSession(name = DEFAULT_SESSION) {
  const list = await openwa("GET", "/sessions");
  let s = Array.isArray(list) ? list.find((x) => x.name === name) : null;
  if (!s) s = await openwa("POST", "/sessions", { name });
  return s;
}

// Always (re)start the engine; harmless if already running (survives restarts).
async function ensureStarted(s) {
  try { await openwa("POST", `/sessions/${s.id}/start`); }
  catch (e) { if (!/already started/i.test(e.message)) throw e; }
}

function toChatId(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Empty phone number");
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) throw new Error(`"${raw}" isn't a valid number (country code, no +)`);
  return `${digits}@c.us`;
}

// --- sessions (multi-account) ----------------------------------------------
app.get("/api/sessions", async (_req, res) => {
  try {
    const list = await openwa("GET", "/sessions");
    const sessions = (Array.isArray(list) ? list : []).map((s) => ({
      name: s.name, status: s.status, phone: s.phone, connected: s.status === "ready",
    }));
    res.json({ ok: true, sessions, default: DEFAULT_SESSION });
  } catch (err) { res.status(502).json({ ok: false, message: err.message }); }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) throw new Error("Session name required");
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) throw new Error("Name: letters, numbers, - or _ only");
    const s = await resolveSession(name);
    res.json({ ok: true, name: s.name, status: s.status });
  } catch (err) { res.status(400).json({ ok: false, message: err.message }); }
});

// --- status / connect / qr / unlink (per session) --------------------------
app.get("/api/status", async (req, res) => {
  if (!API_KEY) return res.json({ ok: false, configured: false, message: "No OPENWA_API_KEY in .env" });
  try {
    const name = nameOf(req);
    const list = await openwa("GET", "/sessions");
    const s = Array.isArray(list) ? list.find((x) => x.name === name) : null;
    res.json({
      ok: true, configured: true, exists: !!s,
      status: s?.status || "none", connected: s?.status === "ready",
      phone: s?.phone || null, sessionName: name, autoReply,
    });
  } catch (err) { res.json({ ok: false, configured: true, message: err.message }); }
});

app.post("/api/connect", async (req, res) => {
  try { const s = await resolveSession(nameOf(req)); await ensureStarted(s); res.json({ ok: true, status: s.status }); }
  catch (err) { res.status(502).json({ ok: false, message: err.message }); }
});

app.post("/api/unlink", async (req, res) => {
  try { const s = await resolveSession(nameOf(req)); await openwa("POST", `/sessions/${s.id}/logout`); res.json({ ok: true }); }
  catch (err) { res.status(502).json({ ok: false, message: err.message }); }
});

app.get("/api/qr", async (req, res) => {
  try {
    const s = await resolveSession(nameOf(req)); await ensureStarted(s);
    const data = await openwa("GET", `/sessions/${s.id}/qr`);
    res.json({ ok: true, qrCode: data.qrCode, status: data.status });
  } catch (err) { res.json({ ok: false, status: "pending", message: err.message }); }
});

// --- send text / media (per session) ---------------------------------------
app.post("/api/send", async (req, res) => {
  try {
    const chatId = toChatId(req.body.number);
    const text = String(req.body.text || "").trim();
    if (!text) throw new Error("Message text is empty");
    const s = await resolveSession(nameOf(req));
    if (s.status !== "ready") throw new Error(`Not connected yet (status: ${s.status}). Scan the QR first.`);
    const data = await openwa("POST", `/sessions/${s.id}/messages/send-text`, { chatId, text });
    recordSent({ to: chatId.replace("@c.us", ""), text, kind: "text", session: s.name });
    res.json({ ok: true, chatId, data });
  } catch (err) { res.status(400).json({ ok: false, message: err.message }); }
});

app.post("/api/send-media", async (req, res) => {
  try {
    const chatId = toChatId(req.body.number);
    let { kind, base64, mimetype, filename, caption } = req.body;
    if (!base64) throw new Error("No file attached");
    const m = /^data:([^;]+);base64,(.*)$/s.exec(base64);
    if (m) { mimetype = mimetype || m[1]; base64 = m[2]; }
    const endpoint = { image: "send-image", video: "send-video", document: "send-document" }[kind] || "send-document";
    const s = await resolveSession(nameOf(req));
    if (s.status !== "ready") throw new Error(`Not connected yet (status: ${s.status}).`);
    const data = await openwa("POST", `/sessions/${s.id}/messages/${endpoint}`, { chatId, base64, mimetype, filename, caption });
    recordSent({ to: chatId.replace("@c.us", ""), text: caption || ("[" + kind + "] " + (filename || "")), kind, session: s.name });
    res.json({ ok: true, chatId, data });
  } catch (err) { res.status(400).json({ ok: false, message: err.message }); }
});

// --- inbox + auto-reply + webhook ------------------------------------------
app.get("/api/inbox", (_req, res) => res.json({ ok: true, messages: inbox.slice(0, 50), autoReply }));

// Sent history: what we sent + to whom + when (resets on app restart).
app.get("/api/sent", (_req, res) => res.json({ ok: true, messages: sent.slice(0, 200) }));

// Dashboard stats: accounts + today's send/receive counts + account overview.
app.get("/api/stats", async (_req, res) => {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const startOfDay = t0.getTime();
  let sessions = [];
  try { const list = await openwa("GET", "/sessions"); sessions = Array.isArray(list) ? list : []; } catch {}
  res.json({
    ok: true,
    accounts: { total: sessions.length, connected: sessions.filter((s) => s.status === "ready").length },
    sentTotal: sent.length,
    sentToday: sent.filter((m) => m.at >= startOfDay).length,
    receivedTotal: inbox.length,
    receivedToday: inbox.filter((m) => m.at >= startOfDay).length,
    autoReply: autoReply.enabled,
    sessions: sessions.map((s) => ({ name: s.name, phone: s.phone, status: s.status, lastActiveAt: s.lastActiveAt || null })),
  });
});

app.post("/api/autoreply", (req, res) => {
  autoReply = { enabled: !!req.body.enabled, text: String(req.body.text || "").trim() };
  persist();
  res.json({ ok: true, autoReply });
});

app.post("/api/webhook/register", async (req, res) => {
  try {
    const s = await resolveSession(nameOf(req));
    const existing = await openwa("GET", `/sessions/${s.id}/webhooks`).catch(() => []);
    const found = Array.isArray(existing) ? existing.find((w) => w.url === WEBHOOK_URL) : null;
    if (found) return res.json({ ok: true, note: "already registered", url: WEBHOOK_URL });
    const w = await openwa("POST", `/sessions/${s.id}/webhooks`, { url: WEBHOOK_URL, events: ["message.received"] });
    res.json({ ok: true, url: WEBHOOK_URL, webhook: w });
  } catch (err) { res.status(502).json({ ok: false, message: err.message, url: WEBHOOK_URL }); }
});

app.post("/webhook", async (req, res) => {
  res.json({ ok: true });
  try {
    const b = req.body || {};
    const event = b.event || b.type || "";
    const msg = b.payload || b.data || b.message || b;
    const from = msg.from || msg.chatId;
    const body = msg.body ?? msg.text ?? "";
    const fromMe = msg.fromMe === true;
    const sessionId = b.sessionId || msg.sessionId;
    if (event.includes("received") && !fromMe && from) {
      inbox.unshift({ from, body, at: Date.now(), sessionId });
      if (inbox.length > 50) inbox.length = 50;
      persist();
      if (autoReply.enabled && autoReply.text && sessionId) {
        await openwa("POST", `/sessions/${sessionId}/messages/send-text`, { chatId: from, text: autoReply.text });
      }
    }
  } catch (e) { console.error("webhook handler error:", e.message); }
});

// SPA fallback: serve the React app for any non-API GET route.
app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

app.listen(PORT, () => {
  console.log(`\n  WaSender:  http://localhost:${PORT}`);
  console.log(`  OpenWA API:             ${OPENWA_URL}/api`);
  console.log(`  Default session:        ${DEFAULT_SESSION}`);
  console.log(`  Webhook URL:            ${WEBHOOK_URL}`);
  if (!API_KEY) console.log(`  ⚠  No OPENWA_API_KEY set — edit .env`);
  console.log("");
  // Auto-reconnect the default account on boot so it's ready without clicking Connect.
  (async () => {
    try {
      const s = await resolveSession(DEFAULT_SESSION);
      await ensureStarted(s);
      console.log(`  Auto-started '${DEFAULT_SESSION}' (status: ${s.status})`);
    } catch (e) {
      console.log(`  Could not auto-start '${DEFAULT_SESSION}': ${e.message} (is OpenWA running?)`);
    }
  })();
});
