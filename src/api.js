// Tiny API client. The Express backend holds the OpenWA key; we only call /api/*.
async function http(path, opts = {}) {
  const token = localStorage.getItem("wa_token") || "";
  const headers = { "Content-Type": "application/json", ...(token ? { "x-auth-token": token } : {}), ...(opts.headers || {}) };
  const res = await fetch(path, { ...opts, headers });
  try { return await res.json(); }
  catch { return { ok: false, message: "Bad response from server" }; }
}

const withSession = (path, session) =>
  session ? path + (path.includes("?") ? "&" : "?") + "session=" + encodeURIComponent(session) : path;

export const apiGet = (path, session) => http(withSession(path, session));
export const apiPost = (path, body = {}, session) =>
  http(path, { method: "POST", body: JSON.stringify(session ? { ...body, session } : body) });

// Friendly labels + dot classes for raw engine statuses.
export const STATUS_LABEL = {
  ready: "Connected", qr_ready: "Awaiting QR scan", created: "Not set up", none: "Not set up",
  initializing: "Connecting…", authenticating: "Connecting…", disconnected: "Disconnected", failed: "Connection error",
};
export const stLabel = (s) => STATUS_LABEL[s] || s;
export const dotClass = (s) =>
  s === "ready" ? "on" : (s === "authenticating" || s === "initializing") ? "warn" : s === "failed" ? "err" : "off";
