import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiGet, apiPost, stLabel, dotClass } from "./api.js";

/* ---------------- icons (inline, stroke = currentColor) ---------------- */
const svg = (children, extra = {}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...extra}>{children}</svg>
);
const I = {
  dashboard: svg(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  connect: svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 21v.01M21 17v.01M17 21v.01" /></>),
  send: svg(<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>),
  bulk: svg(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />),
  media: svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" /></>),
  inbox: svg(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>),
  sent: svg(<><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" /></>),
  users: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  bot: svg(<><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4M8 16h.01M16 16h.01" /></>),
  sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: svg(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />),
  menu: svg(<path d="M3 12h18M3 6h18M3 18h18" />),
  refresh: svg(<><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>),
};
const NAV = [
  ["dashboard", "Dashboard", I.dashboard],
  ["connect", "Connect", I.connect],
  ["send", "Send", I.send],
  ["bulk", "Bulk", I.bulk],
  ["media", "Media", I.media],
  ["inbox", "Inbox", I.inbox],
  ["sent", "Sent", I.sent],
];

/* ---------------- templates (localStorage) ---------------- */
const loadTemplates = () => { try { return JSON.parse(localStorage.getItem("wa_templates") || "[]"); } catch { return []; } };
const saveTemplates = (t) => localStorage.setItem("wa_templates", JSON.stringify(t));

/* ---------------- App ---------------- */
export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("wa_theme") || "light");
  const [tab, setTab] = useState("dashboard");
  const [sessions, setSessions] = useState([]);
  const [cur, setCur] = useState(localStorage.getItem("wa_cur") || "test1");
  const [status, setStatus] = useState({ status: "none", connected: false, phone: null });
  const [navOpen, setNavOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [auth, setAuth] = useState({ checked: false, required: false, authed: true });

  const toast = useCallback((tx, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tx, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("wa_theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("wa_cur", cur); }, [cur]);
  useEffect(() => { apiGet("/api/me").then((r) => r.ok && setAuth({ checked: true, required: r.authRequired, authed: r.authed })); }, []);

  const loadSessions = useCallback(async () => {
    const r = await apiGet("/api/sessions");
    const list = r.ok ? r.sessions : [];
    if (!list.some((s) => s.name === (r.default || "test1"))) list.unshift({ name: r.default || "test1", status: "none" });
    setSessions(list);
    setCur((c) => (list.some((s) => s.name === c) ? c : list[0]?.name || "test1"));
  }, []);

  const refreshStatus = useCallback(async () => {
    const s = await apiGet("/api/status", cur);
    if (s.ok) setStatus({ status: s.exists ? s.status : "none", connected: s.connected, phone: s.phone });
  }, [cur]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { refreshStatus(); const t = setInterval(refreshStatus, 8000); return () => clearInterval(t); }, [refreshStatus]);

  const go = (t) => { setTab(t); setNavOpen(false); };
  const curStatus = sessions.find((s) => s.name === cur)?.status || status.status;

  if (auth.checked && auth.required && !auth.authed) return <Login onDone={() => setAuth({ ...auth, authed: true })} />;

  return (
    <div className="app">
      {navOpen && <div className="overlay show" onClick={() => setNavOpen(false)} />}
      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="brand">
          <div className="brand-badge">Wa</div>
          <div><div className="brand-name">WaSender</div><div className="brand-sub">WhatsApp Sender</div></div>
        </div>
        <nav className="nav">
          {NAV.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => go(id)}>{icon}<span>{label}</span></button>
          ))}
        </nav>
        <div className="side-foot">Self-hosted · OpenWA</div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="hamb" onClick={() => setNavOpen(true)}>{I.menu}</button>
          <div className="status"><span className={"dot " + dotClass(status.status)} />{status.connected ? "Connected · " + (status.phone || "") : stLabel(status.status)}</div>
          <div className="spacer" />
          <div className="acct">
            <span className="lbl">Account</span>
            <div className="dd">
              <button className="dd-btn" onClick={(e) => { e.stopPropagation(); setAcctOpen((o) => !o); }}>
                <span className={"sdot " + dotClass(curStatus)} />{cur}<span className="chev">{I.dashboard && svg(<path d="m6 9 6 6 6-6" />)}</span>
              </button>
              {acctOpen && (
                <div className="dd-menu" onClick={(e) => e.stopPropagation()}>
                  {sessions.map((s) => (
                    <div key={s.name} className="dd-item" onClick={() => { setCur(s.name); setAcctOpen(false); }}>
                      <span className={"sdot " + dotClass(s.status)} /><span className="nm">{s.name}</span><span className="st">{stLabel(s.status)}</span>
                    </div>
                  ))}
                  <div className="dd-sep" />
                  <div className="dd-add" onClick={async () => {
                    setAcctOpen(false);
                    const name = prompt("Name for the new account (letters/numbers/-/_):", "number2");
                    if (!name) return;
                    const r = await apiPost("/api/sessions", { name });
                    if (!r.ok) return toast(r.message, "err");
                    await loadSessions(); setCur(r.name); go("connect");
                    toast(`Added "${r.name}" — scan its QR to link.`, "ok");
                  }}><span className="plus">+</span> Add number</div>
                </div>
              )}
            </div>
          </div>
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>{theme === "dark" ? I.sun : I.moon}</button>
        </header>

        <main className="main" onClick={() => setAcctOpen(false)}>
          <div className="alert">⚠ <div><b>Only message people who opted in.</b> Unofficial automation — bulk/cold sending gets the number banned. Use spare numbers, keep volume low, keep the delay on.</div></div>
          <div className="view" key={tab}>
            {tab === "dashboard" && <Dashboard />}
            {tab === "connect" && <Connect cur={cur} toast={toast} onChange={loadSessions} />}
            {tab === "send" && <Send cur={cur} toast={toast} />}
            {tab === "bulk" && <Bulk cur={cur} toast={toast} />}
            {tab === "media" && <Media cur={cur} toast={toast} />}
            {tab === "inbox" && <Inbox cur={cur} toast={toast} />}
            {tab === "sent" && <Sent />}
          </div>
        </main>
      </div>

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={"toast " + t.type}><div className="tx">{t.tx}</div></div>)}
      </div>
    </div>
  );
}

/* ---------------- Login ---------------- */
function Login({ onDone }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await apiPost("/api/login", { password: pw });
    setBusy(false);
    if (r.ok) { localStorage.setItem("wa_token", r.token || ""); onDone(); }
    else setErr(r.message || "Login failed");
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-badge" style={{ margin: "0 auto 14px" }}>Wa</div>
        <h2 style={{ textAlign: "center", margin: "0 0 4px" }}>WaSender</h2>
        <p className="sub" style={{ textAlign: "center" }}>Enter the dashboard password</p>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
        {err && <p className="hint" style={{ color: "var(--danger)" }}>{err}</p>}
        <button className="btn" style={{ width: "100%" }} disabled={busy}>{busy && <span className="spin" />}Sign in</button>
      </form>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard() {
  const [d, setD] = useState(null);
  const load = useCallback(async () => { const r = await apiGet("/api/stats"); if (r.ok) setD(r); }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  const card = (lbl, num, sub, ico) => (
    <div className="stat"><div className="lbl">{lbl}</div><div className="num">{num}</div><div className="sub2">{sub}</div><span className="ico">{ico}</span></div>
  );
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}><h2 style={{ margin: 0 }}>Dashboard</h2><button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={load}>{I.refresh} Refresh</button></div>
      <div className="stats">
        {card("Accounts", d ? `${d.accounts.connected}/${d.accounts.total}` : "—", d ? `${d.accounts.connected} connected` : "loading…", I.users)}
        {card("Sent today", d ? d.sentToday : "—", d ? `${d.sentTotal} total this session` : "", I.send)}
        {card("Received today", d ? d.receivedToday : "—", d ? `${d.receivedTotal} total this session` : "", I.inbox)}
        {card("Auto-reply", d ? (d.autoReply ? "On" : "Off") : "—", "to incoming messages", I.bot)}
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 14 }}>Accounts</h2>
        <table className="tbl">
          <thead><tr><th>Account</th><th>Phone</th><th>Status</th><th>Last active</th></tr></thead>
          <tbody>
            {d && d.sessions.length ? d.sessions.map((s) => (
              <tr key={s.name}>
                <td><b>{s.name}</b></td><td>{s.phone || "—"}</td>
                <td><span className={"badge " + dotClass(s.status)}><span className={"sdot " + dotClass(s.status)} />{stLabel(s.status)}</span></td>
                <td>{s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString() : "—"}</td>
              </tr>
            )) : <tr><td colSpan="4" className="empty">No accounts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- Connect ---------------- */
function Connect({ cur, toast, onChange }) {
  const [qr, setQr] = useState(null);
  const [linked, setLinked] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => { setQr(null); setLinked(false); clearInterval(timer.current); }, [cur]);

  const connect = async () => {
    toast(`Starting "${cur}"…`, "info");
    await apiPost("/api/connect", {}, cur);
    const r = await apiGet("/api/qr", cur);
    if (r.ok && r.qrCode) setQr(r.qrCode);
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const st = await apiGet("/api/status", cur);
      if (st.ok && st.connected) { clearInterval(timer.current); setQr(null); setLinked(true); onChange(); toast(`"${cur}" linked!`, "ok"); return; }
      const r2 = await apiGet("/api/qr", cur);
      if (r2.ok && r2.qrCode) setQr(r2.qrCode);
    }, 5000);
  };
  const unlink = async () => {
    if (!confirm(`Unlink "${cur}"? It logs the device out — scan a new QR to use it again.`)) return;
    const r = await apiPost("/api/unlink", {}, cur);
    if (r.ok) { setQr(null); setLinked(false); onChange(); toast("Unlinked.", "ok"); } else toast(r.message, "err");
  };
  return (
    <div className="card">
      <h2>Connect WhatsApp</h2>
      <p className="sub">Link the selected account (<b>{cur}</b>). Each account links one phone.</p>
      <div className="row">
        <button className="btn" onClick={connect}>Connect / Show QR</button>
        <button className="btn ghost" onClick={unlink}>Unlink number</button>
      </div>
      {qr && <img className="qr" src={qr.startsWith("data:") ? qr : "data:image/png;base64," + qr} alt="QR code" />}
      {linked && <p className="hint" style={{ color: "var(--brand-d)" }}>✅ Linked — you can send now.</p>}
      <p className="hint">On your phone: WhatsApp → Settings → Linked devices → Link a device → scan.</p>
    </div>
  );
}

/* ---------------- shared: templates bar ---------------- */
function Templates({ value, onPick }) {
  const [list, setList] = useState(loadTemplates);
  const save = () => {
    const v = value().trim(); if (!v) return;
    const name = prompt("Template name:", "Greeting"); if (!name) return;
    const next = [...list.filter((t) => t.name !== name), { name, text: v }];
    setList(next); saveTemplates(next);
  };
  return (
    <div className="row" style={{ marginTop: 10 }}>
      {list.map((t) => <button key={t.name} className="btn sec sm" title={t.text} onClick={() => onPick(t.text)}>{t.name}</button>)}
      <button className="btn ghost sm" onClick={save}>＋ Save as template</button>
    </div>
  );
}

/* ---------------- Send ---------------- */
function Send({ cur, toast }) {
  const [num, setNum] = useState(""); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!num.trim() || !text.trim()) return toast("Enter a number and a message.", "err");
    setBusy(true);
    const r = await apiPost("/api/send", { number: num, text }, cur);
    toast(r.ok ? "✓ Sent to " + r.chatId.replace("@c.us", "") : "✗ " + r.message, r.ok ? "ok" : "err");
    setBusy(false);
  };
  return (
    <div className="card">
      <h2>Send one message</h2>
      <p className="sub">From <b>{cur}</b>.</p>
      <label>Phone number (country code, no +)</label>
      <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="911234567890" />
      <div className="field-row"><label>Message</label><span className="count">{text.length}</span></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Hello 👋" />
      <Templates value={() => text} onPick={setText} />
      <button className="btn" disabled={busy} onClick={send}>{busy && <span className="spin" />}Send message</button>
    </div>
  );
}

/* ---------------- Bulk ---------------- */
function Bulk({ cur, toast }) {
  const [list, setList] = useState(""); const [text, setText] = useState(""); const [delay, setDelay] = useState(8);
  const [running, setRunning] = useState(false); const [prog, setProg] = useState(null); const stop = useRef(false);
  const onCsv = (e) => {
    const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => {
      let lines = rd.result.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines[0] && /[a-z]/i.test(lines[0]) && !/\d{6,}/.test(lines[0])) lines.shift();
      setList(lines.join("\n")); toast(`Imported ${lines.length} recipients.`, "ok");
    };
    rd.readAsText(f);
  };
  const run = async () => {
    const rows = list.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!rows.length || !text.trim()) return toast("Add recipients and a message.", "err");
    setRunning(true); stop.current = false; let sent = 0, fail = 0;
    for (let i = 0; i < rows.length; i++) {
      if (stop.current) break;
      const [number, name = ""] = rows[i].split(",").map((x) => x.trim());
      const msg = text.replace(/\{name\}/g, name || "there");
      const r = await apiPost("/api/send", { number, text: msg }, cur);
      r.ok ? sent++ : fail++;
      setProg({ i: i + 1, total: rows.length, sent, fail });
      if (i < rows.length - 1 && !stop.current) await new Promise((res) => setTimeout(res, Math.max(2, delay) * 1000));
    }
    setRunning(false); toast(`Done. Sent ${sent}, failed ${fail}.`, fail ? "err" : "ok");
  };
  return (
    <div className="card">
      <h2>Send to many</h2>
      <p className="sub">Paste numbers or import a CSV. Use <code>{"{name}"}</code> to personalise. From <b>{cur}</b>.</p>
      <div className="row">
        <label className="btn sec sm" style={{ margin: 0 }}>Import CSV (number,name)<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsv} /></label>
      </div>
      <label>Recipients — one per line: <code>number</code> or <code>number,name</code></label>
      <textarea value={list} onChange={(e) => setList(e.target.value)} placeholder={"911234567890,Sachin\n14155552671,Alex"} />
      <label>Message (supports {"{name}"})</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Hi {name}, quick reminder…" />
      <Templates value={() => text} onPick={setText} />
      <label>Delay between messages (seconds)</label>
      <input type="number" min="2" value={delay} onChange={(e) => setDelay(+e.target.value)} />
      <div className="row">
        <button className="btn" disabled={running} onClick={run}>{running && <span className="spin" />}Send to list</button>
        <button className="btn sec" disabled={!running} onClick={() => (stop.current = true)}>Stop</button>
        {prog && <span className="hint" style={{ marginTop: 0 }}>{prog.i}/{prog.total} · ✓{prog.sent} ✗{prog.fail}</span>}
      </div>
    </div>
  );
}

/* ---------------- Media ---------------- */
function Media({ cur, toast }) {
  const [num, setNum] = useState(""); const [cap, setCap] = useState(""); const [busy, setBusy] = useState(false); const fileRef = useRef(null);
  const send = () => {
    const f = fileRef.current?.files[0];
    if (!num.trim() || !f) return toast("Pick a number and a file.", "err");
    setBusy(true);
    const rd = new FileReader();
    rd.onload = async () => {
      const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "document";
      const r = await apiPost("/api/send-media", { number: num, kind, base64: rd.result, mimetype: f.type, filename: f.name, caption: cap }, cur);
      toast(r.ok ? "✓ Sent " + f.name : "✗ " + r.message, r.ok ? "ok" : "err");
      setBusy(false);
    };
    rd.readAsDataURL(f);
  };
  return (
    <div className="card">
      <h2>Send a photo / file</h2>
      <p className="sub">Images, PDFs, docs — from your computer, via <b>{cur}</b>.</p>
      <label>Phone number (country code, no +)</label>
      <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="911234567890" />
      <label>File</label>
      <input type="file" ref={fileRef} />
      <label>Caption (optional)</label>
      <input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Here you go!" />
      <button className="btn" disabled={busy} onClick={send}>{busy && <span className="spin" />}Send file</button>
    </div>
  );
}

/* ---------------- Inbox ---------------- */
function Inbox({ cur, toast }) {
  const [msgs, setMsgs] = useState([]); const [ar, setAr] = useState({ enabled: false, text: "" });
  const load = useCallback(async () => { const r = await apiGet("/api/inbox"); if (r.ok) { setMsgs(r.messages); setAr(r.autoReply); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);
  return (
    <div className="card">
      <h2>Inbox & auto-reply</h2>
      <p className="sub">Incoming messages (all accounts) and optional auto-respond.</p>
      <div className="row">
        <button className="btn sec" onClick={async () => { const r = await apiPost("/api/webhook/register", {}, cur); toast(r.ok ? "Receiving enabled" : r.message, r.ok ? "ok" : "err"); }}>Enable receiving (webhook)</button>
        <button className="btn ghost" onClick={load}>{I.refresh} Refresh</button>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={ar.enabled} onChange={(e) => setAr({ ...ar, enabled: e.target.checked })} />
        <label style={{ margin: 0 }}>Auto-reply to every incoming message</label>
      </div>
      <input value={ar.text} onChange={(e) => setAr({ ...ar, text: e.target.value })} placeholder="Thanks! We'll get back to you soon." style={{ marginTop: 8 }} />
      <button className="btn" onClick={async () => { const r = await apiPost("/api/autoreply", ar); toast(r.ok ? "Auto-reply " + (r.autoReply.enabled ? "ON" : "OFF") : r.message, r.ok ? "ok" : "err"); }}>Save auto-reply</button>
      <h2 style={{ marginTop: 22, fontSize: 14 }}>Recent incoming</h2>
      {msgs.length ? msgs.map((m, i) => (
        <div className="msg" key={i}><b>{(m.from || "").replace("@c.us", "")}</b> <span className="t">· {new Date(m.at).toLocaleTimeString()}</span><br />{m.body}</div>
      )) : <div className="empty">No messages yet.</div>}
    </div>
  );
}

/* ---------------- Sent ---------------- */
function Sent() {
  const [msgs, setMsgs] = useState([]);
  const load = useCallback(async () => { const r = await apiGet("/api/sent"); if (r.ok) setMsgs(r.messages); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="card">
      <div className="row"><h2 style={{ margin: 0 }}>Sent history</h2><button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={load}>{I.refresh} Refresh</button></div>
      <p className="sub">What this app sent — recipient, text, time (resets on app restart).</p>
      {msgs.length ? msgs.map((m, i) => (
        <div className="msg" key={i}><b>→ {(m.to || "").replace("@c.us", "")}</b> <span className="t">· {new Date(m.at).toLocaleString()} · {m.session}{m.kind && m.kind !== "text" ? " · " + m.kind : ""}</span><br />{m.text}</div>
      )) : <div className="empty">Nothing sent yet.</div>}
    </div>
  );
}
