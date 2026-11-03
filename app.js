"use strict";

const PRICE = 49; // one-time 30-day pass, no auto-renewal
const INR_PER_USD = 96.7; // US Federal Reserve H.10, 9 Oct 2026, as quoted by fluxnote.io
const SHORTS_RPM = { us: 0.328, in: 0.008 }; // US$ per 1,000 views, AIR Media-Tech partner data
const INDIA_LONG_FACTOR = 0.74 / 14.67; // MilX long-form CPM, India vs US
const PAGE = 24;

const STYLE_TITLE = { story: "Story and comedy episodes", explainer: "Voice-over explainer: research, script, b-roll", news: "Weekly news and tools roundup", tutorial: "Screen tutorial: plan, record, chapter", listicle: "Review or ranked list: criteria first", animation: "Stick-figure and whiteboard animation", satisfying: "Satisfying and ASMR clips: one action, one sound", handson: "Hands-on how-to: film it, cut it, caption it", commentary: "Commentary and breakdowns: transformation first", quote: "Quote and affirmation Shorts: original script, licensed music", ambient: "Ambient and AI music: curate, do not loop" };
const AI_LABEL = { F: "Made with AI", A: "AI helps", R: "Your footage" };
const STYLE_NAME = {
  story: "Story and comedy episode",
  explainer: "Voice-over explainer",
  news: "Weekly news and tools",
  tutorial: "Screen tutorial",
  listicle: "Review or ranked list",
  animation: "Stick-figure or whiteboard animation",
  satisfying: "Satisfying loop",
  handson: "Hands-on how-to",
  commentary: "Breakdown or commentary",
  quote: "Quote and affirmation video",
  ambient: "Ambient or long loop"
};

const state = { q: "", group: "all", reach: "all", ai: "all", sort: "views", shown: PAGE };
const calc = { views: 500000, kind: "long", aud: "in", niche: "" };
let CAT = null, LIVE = { niches: {} }, RADAR = { items: [] }, FREE = null;
let pendingScroll = null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- account, payments, analytics ---------- */
const CFG = window.ABHICHAL || {};
const API = String(CFG.api || "").replace(/\/$/, "");
const TOKEN_KEY = "formatly-token", VID_KEY = "formatly-vid";
let ME = null;          // account info from /api/me, or null when signed out
const LESSONS = {};     // paid lessons, fetched from the API only after sign-in
let currentNiche = "";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } }
};
const token = () => store.get(TOKEN_KEY) || "";
function visitorId() {
  let v = store.get(VID_KEY);
  if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); store.set(VID_KEY, v); }
  return v;
}
const SRC_KEY = "formatly-src";
// Where this visitor came from: "source/medium/campaign". A tagged link (utm_*) or a Google Ads click (gclid) wins and is remembered;
// otherwise we keep what we saw first, then the referring site, then "direct".
function sourceNow() {
  const q = new URLSearchParams(location.search);
  const us = q.get("utm_source");
  let fresh = "";
  if (us) fresh = [us, q.get("utm_medium") || "", q.get("utm_campaign") || ""].join("/").replace(/\/+$/, "");
  else if (q.get("gclid")) fresh = "google/cpc";
  if (fresh) { store.set(SRC_KEY, fresh.toLowerCase()); return fresh.toLowerCase(); }
  const saved = store.get(SRC_KEY);
  if (saved) return saved;
  try {
    const h = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
    if (h && h !== location.hostname) { const v = h + "/referral"; store.set(SRC_KEY, v); return v; }
  } catch { /* ignore */ }
  return "direct";
}
const doNotTrack = () => navigator.doNotTrack === "1" || window.doNotTrack === "1";
function track(t, extra) {
  if (!API || doNotTrack()) return;
  let ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* ignore */ }
  if (ref === location.hostname) ref = "";
  const first = t === "pv";
  const body = JSON.stringify({
    t, vid: visitorId(), src: sourceNow(),
    ref: first ? ref : undefined,
    utm: first ? new URLSearchParams(location.search).get("utm_source") || "" : undefined,
    dev: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "m" : "d",
    ...(extra || {})
  });
  try { fetch(API + "/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {}); } catch { /* ignore */ }
}
async function api(path, opt) {
  if (!API) throw new Error("The members service is not connected yet.");
  const h = { "Content-Type": "application/json" };
  if (token()) h.Authorization = "Bearer " + token();
  const r = await fetch(API + path, { ...(opt || {}), headers: h });
  let j = {};
  try { j = await r.json(); } catch { /* empty body */ }
  if (!r.ok) { const e = new Error(j.error || "Something went wrong. Please try again."); e.status = r.status; throw e; }
  return j;
}
async function refreshMe() {
  if (!token()) { ME = null; return; }
  try {
    const m = await api("/api/me");
    if (m.token) store.set(TOKEN_KEY, m.token);
    ME = m;
  } catch (e) {
    if (e.status === 401) { store.del(TOKEN_KEY); ME = null; }
  }
}
const paid = () => Boolean(ME && ME.active);
const hadPlan = () => Boolean(ME && (ME.paidCount || ME.paidUntil || ME.subId || ME.status));
async function loadLesson(id) {
  if (LESSONS[id]) return LESSONS[id];
  return (LESSONS[id] = await api("/api/lesson?id=" + encodeURIComponent(id)));
}
function signOut() {
  store.del(TOKEN_KEY); ME = null;
  Object.keys(LESSONS).forEach((k) => delete LESSONS[k]);
  closeModal(); route();
}

/* ---------- modals ---------- */
function closeModal() { const m = $("#modal"); if (m) { m.remove(); document.body.classList.remove("noscroll"); } }
function modal(html, onMount) {
  closeModal();
  const d = document.createElement("div");
  d.className = "modal"; d.id = "modal";
  d.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Close" data-close>×</button>${html}</div>`;
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) closeModal(); });
  document.body.appendChild(d);
  document.body.classList.add("noscroll");
  if (onMount) onMount(d);
  const f = d.querySelector("input:not([type=checkbox]),textarea");
  if (f) f.focus();
}
const fld = (d, id) => $("#" + id, d);
function say(d, msg, bad) { const m = $(".msg", d); if (m) { m.textContent = msg || ""; m.className = "msg" + (bad ? " bad" : ""); } }

function loadGsi() {
  if (window.google && window.google.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function enter(d, r) {
  store.set(TOKEN_KEY, r.token);
  await refreshMe(); paintChip(); route();
  if (paid()) { closeModal(); return; }
  if (d && d.dataset && d.dataset.then === "buy") buyModal(true); else closeModal();
}
async function acceptGoogle(d, credential) {
  say(d, "Signing in with Google…");
  await enter(d, await api("/api/auth", { method: "POST", body: JSON.stringify({ mode: "google", credential, vid: visitorId(), src: sourceNow() }) }));
}
function mountGoogle(d) {
  const slot = $(".gbtn", d);
  if (!slot || !CFG.googleClientId) { if (slot) slot.remove(); return; }
  loadGsi().then(() => {
    const w = Math.min(360, slot.clientWidth || 320);
    google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: (resp) => acceptGoogle(d, resp.credential).catch((e) => say(d, e.message, true)) });
    google.accounts.id.renderButton(slot, { theme: "filled_black", size: "large", width: w, text: "continue_with", shape: "pill" });
  }).catch(() => { slot.remove(); });
}

function buyModal(again) {
  if (!again) track("buy_click");
  const loggedIn = Boolean(ME);
  modal(`<h3>Formatly Pro</h3>
    <p class="sub" style="margin-top:0">₹${PRICE} one time for 30 days of every lesson. No auto-renewal and no UPI AutoPay: you pay once, and extend only if you want to.</p>
    ${loggedIn
    ? `<p class="sub">Paying as <b>${esc(ME.email)}</b>. <button class="link" id="b-switch">Not you?</button></p>`
    : `<label>Name (optional)<input id="b-name" type="text" autocomplete="name" maxlength="60"></label>
    <label>Email<input id="b-email" type="email" autocomplete="email" placeholder="you@gmail.com" required></label>
    <p class="fine">Pay first — no sign-in needed. Lessons open right after payment. Come back anytime with this email or Google.</p>`}
    <label class="check"><input id="b-agree" type="checkbox"><span>I agree to the <a href="terms.html" target="_blank" rel="noopener">terms</a> and the <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a>, and that this is a one-time payment of ₹${PRICE} for 30 days of access. It does not renew by itself.</span></label>
    <p class="msg"></p>
    <button class="btn big" id="b-go">Pay ₹${PRICE} · UPI or card</button>
    <p class="fine">Payments run on Razorpay. We never see your card or UPI PIN.</p>
    ${loggedIn ? "" : `<p class="fine" style="text-align:center;margin-top:12px">Already paid or have an account? <button class="link" id="b-signin">Sign in</button></p>`}`, (d) => {
    if (loggedIn) fld(d, "b-switch").onclick = () => { signOut(); buyModal(true); };
    else {
      const si = fld(d, "b-signin");
      if (si) si.onclick = () => signInModal("buy");
      const em = fld(d, "b-email");
      if (em) em.focus();
    }
    const startPay = async () => {
      const email = loggedIn ? ME.email : fld(d, "b-email").value.trim().toLowerCase();
      const name = loggedIn ? (ME.name || "") : (fld(d, "b-name") ? fld(d, "b-name").value.trim() : "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say(d, "Enter a valid email address.", true);
      if (!fld(d, "b-agree").checked) return say(d, "Please tick the box to continue.", true);
      fld(d, "b-go").disabled = true; say(d, "Creating your secure checkout…");
      try {
        const c = await api("/api/checkout", { method: "POST", body: JSON.stringify({ email, name, agree: true, plan: "pass", vid: visitorId(), src: sourceNow() }) });
        await openRazorpay(c, d);
      } catch (e) {
        fld(d, "b-go").disabled = false;
        if (e.status === 409) {
          say(d, e.message + " Sign in, then pay again.", true);
          setTimeout(() => signInModal("buy"), 1200);
        } else say(d, e.message, true);
      }
    };
    fld(d, "b-go").onclick = startPay;
    const em = fld(d, "b-email");
    if (em) em.addEventListener("keydown", (ev) => { if (ev.key === "Enter") startPay(); });
  });
}
async function openRazorpay(c, d) {
  if (!window.Razorpay) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => {});
  }
  if (!window.Razorpay) throw new Error("Could not load the payment window. Check your connection and try again.");
  const rz = new Razorpay({
    key: c.key, ...(c.order_id ? { order_id: c.order_id, amount: c.amount, currency: "INR" } : { subscription_id: c.subscription_id }), name: "Formatly", description: c.description,
    prefill: { email: c.email }, theme: { color: "#d7ff3f" },
    modal: { ondismiss() { track("checkout_dismiss"); if (d) { fld(d, "b-go").disabled = false; say(d, ""); } } },
    async handler(resp) { await finishPayment(resp); }
  });
  rz.on && rz.on("payment.failed", () => { if (d) say(d, "The payment did not go through. You were not charged for Pro. Try again or use another method.", true); });
  track("checkout_open");
  rz.open();
}
async function finishPayment(resp) {
  modal(`<h3>Confirming your payment…</h3><p class="sub">This takes a few seconds. Please do not close this page.</p>`);
  try {
    const r = await api("/api/verify", { method: "POST", body: JSON.stringify({ razorpay_payment_id: resp.razorpay_payment_id, razorpay_subscription_id: resp.razorpay_subscription_id, razorpay_order_id: resp.razorpay_order_id, razorpay_signature: resp.razorpay_signature }) });
    store.set(TOKEN_KEY, r.token);
    await refreshMe(); paintChip();
    try { if (window.gtag) gtag("event", "conversion", { send_to: "AW-18550624955/oBsSCJ-No7AdELul0I1F", value: PRICE, currency: "INR", transaction_id: String(resp.razorpay_payment_id || "") }); } catch (_) {}
    const em = esc(r.email || (ME && ME.email) || "");
    const rk = r.recoveryKey ? `<p class="sub">Save this access code somewhere safe: <code>${esc(r.recoveryKey)}</code></p>` : "";
    modal(`<h3>You are in. Welcome to Pro.</h3><p class="sub">Every lesson is open for the next 30 days. Nothing renews by itself.</p>${rk}<p class="sub">Next time on another device: sign in with <b>${em}</b> (Continue with Google works with the same email).</p><button class="btn big" data-close>Open my lessons</button>`);
    route();
  } catch (e) {
    modal(`<h3>Payment received, access is pending</h3><p class="sub">${esc(e.message)}</p><p class="sub">Your payment ID: <code>${esc(resp.razorpay_payment_id || "")}</code>. Keep it. Sign in again in a minute, or contact us and we will fix it the same day.</p><div class="row"><button class="btn" data-restore>Sign in</button><button class="btn ghost" data-contact>Contact us</button></div>`);
  }
}
function signInModal(then, mode) {
  const up = mode === "signup";
  modal(`<h3>${up ? "Create your account" : "Sign in"}</h3>
    <p class="sub" style="margin-top:0">${then === "buy" ? "Sign in to continue checkout for this email. " : ""}${up ? "Already have an account?" : "New here?"} <button class="link" id="s-flip">${up ? "Sign in" : "Create an account"}</button>${then === "buy" ? ` · <button class="link" id="s-back-buy">Back to pay without signing in</button>` : ""}</p>
    <div class="gbtn"></div>
    <p class="fine" style="text-align:center;margin:10px 0">or use your email</p>
    ${up ? '<label>Name (optional)<input id="s-name" type="text" autocomplete="name" maxlength="60"></label>' : ""}
    <label>Email<input id="s-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
    <label>Password<input id="s-pw" type="password" autocomplete="${up ? "new-password" : "current-password"}" placeholder="${up ? "At least 8 characters" : "Your password"}"></label>
    <p class="msg"></p>
    <button class="btn big" id="s-go">${up ? "Create account" : "Sign in"}</button>
    <p class="fine">${up ? "" : 'Forgot your password? Continue with Google, or write to ' + esc(CFG.supportEmail || "us") + ". "}By continuing you agree to the <a href="terms.html" target="_blank" rel="noopener">terms</a> and <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a>.</p>`, (d) => {
    if (then) d.dataset.then = then;
    mountGoogle(d);
    fld(d, "s-flip").onclick = () => signInModal(then, up ? "login" : "signup");
    const back = fld(d, "s-back-buy");
    if (back) back.onclick = () => buyModal(true);
    const go = async () => {
      const email = fld(d, "s-email").value.trim(), password = fld(d, "s-pw").value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say(d, "Enter a valid email address.", true);
      if (!password) return say(d, "Enter your password.", true);
      if (up && password.length < 8) return say(d, "Use at least 8 characters.", true);
      fld(d, "s-go").disabled = true; say(d, up ? "Creating your account…" : "Signing in…");
      try {
        const nm = fld(d, "s-name");
        await enter(d, await api("/api/auth", { method: "POST", body: JSON.stringify({ mode: up ? "signup" : "login", email, password, name: nm ? nm.value : "" }) }));
        if (!up) track("restore_ok");
      } catch (e) { fld(d, "s-go").disabled = false; say(d, e.message, true); }
    };
    fld(d, "s-go").onclick = go;
    fld(d, "s-pw").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  });
}
const restoreModal = () => signInModal();
function accountModal() {
  if (!ME) return restoreModal();
  const st = ME.cancelRequested ? "Cancelled. Access ends " + fmtDate(new Date(ME.paidUntil)) : paid() ? (ME.renewsAt ? "Renews on " + fmtDate(new Date(ME.renewsAt)) : "Active until " + fmtDate(new Date(ME.paidUntil)) + (ME.plan === "pass" ? " (no auto-renewal)" : "")) : hadPlan() ? "Access ended " + fmtDate(new Date(ME.paidUntil)) : "Signed in. Pro starts after you pay.";
  modal(`<h3>Your account</h3>
    <dl class="acct"><div><dt>Email</dt><dd>${esc(ME.email)}</dd></div><div><dt>Plan</dt><dd>${hadPlan() || paid() ? (ME.plan === "pass" ? "Formatly Pass, ₹" + PRICE + " for 30 days" : "Formatly Pro, ₹149 a month") : "None yet"}</dd></div><div><dt>Status</dt><dd>${esc(st)}</dd></div>${hadPlan() && ME.plan !== "pass" ? `<div><dt>Months paid</dt><dd>${ME.paidCount || 0}</dd></div>` : ""}</dl>
    <div class="row">
      ${paid() && !ME.cancelRequested && ME.plan !== "pass" ? '<button class="btn ghost" id="a-cancel">Cancel renewal</button>' : ""}
      ${!paid() || ME.plan === "pass" ? `<button class="btn" data-buy>${hadPlan() ? "Get 30 more days" : "Unlock"} · ₹${PRICE}</button>` : ""}
      <button class="btn ghost" data-contact>Contact us</button>
      <button class="btn ghost" id="a-out">Sign out</button>
    </div>
    <p class="msg"></p>
    <p class="fine">On another phone or computer, press Sign in with this email.</p>`, (d) => {
    fld(d, "a-out").onclick = signOut;
    const c = fld(d, "a-cancel");
    if (c) c.onclick = async () => {
      if (!confirm("Stop future charges? You keep access until " + fmtDate(new Date(ME.paidUntil)) + ".")) return;
      say(d, "Cancelling…");
      try { await api("/api/cancel", { method: "POST", body: "{}" }); await refreshMe(); paintChip(); accountModal(); }
      catch (e) { say(d, e.message, true); }
    };
  });
}
function contactModal(kind) {
  modal(`<h3>Contact us</h3>
    <p class="sub" style="margin-top:0">Payment taken but no access? Something broken? Tell us. We reply by email${CFG.supportEmail ? " (or write to " + esc(CFG.supportEmail) + ")" : ""}.</p>
    <label>Your email<input id="c-email" type="email" autocomplete="email" value="${esc(ME ? ME.email : "")}"></label>
    <label>Topic<select id="c-kind"><option value="payment">Payment or billing</option><option value="access">I cannot get in</option><option value="bug">Something is broken</option><option value="idea">Idea or request</option><option value="other">Other</option></select></label>
    <label>Message<textarea id="c-msg" rows="5" maxlength="2000"></textarea></label>
    <label>Razorpay payment ID (if you have one)<input id="c-pay" placeholder="pay_…"></label>
    <p class="msg"></p>
    <button class="btn big" id="c-go">Send</button>`, (d) => {
    if (kind) fld(d, "c-kind").value = kind;
    fld(d, "c-go").onclick = async () => {
      say(d, "Sending…");
      try {
        await api("/api/contact", { method: "POST", body: JSON.stringify({ email: fld(d, "c-email").value, kind: fld(d, "c-kind").value, message: fld(d, "c-msg").value, paymentId: fld(d, "c-pay").value }) });
        track("contact"); modal(`<h3>Sent</h3><p class="sub">Thank you. We will reply to your email.</p>`);
      } catch (e) { say(d, e.message, true); }
    };
  });
}
function paintChip() {
  const el = $("#passchip");
  if (!el) return;
  if (ME) el.innerHTML = paid() ? '<button class="btn ok" data-account>Pro · Account</button>' : hadPlan() ? `<button class="btn" data-account>Renew · Account</button>` : `<button class="link" data-account>Account</button><button class="btn" data-buy>Unlock all · ₹${PRICE}</button>`;
  else el.innerHTML = `<button class="link" data-restore>Sign in</button><button class="btn" data-buy>Unlock all · ₹${PRICE}</button>`;
  paintInstall();
}

/* ---------- install and engagement tracking ---------- */
let deferredInstall = null;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function paintInstall() {
  const b = $("#installbtn");
  if (!b) return;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  // Offer the install after someone has paid, not on the first visit from an ad.
  b.hidden = standalone() || !paid() || !(deferredInstall || ios);
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; track("install_prompt"); paintInstall(); });
window.addEventListener("appinstalled", () => { track("installed"); deferredInstall = null; paintInstall(); });
async function installApp() {
  if (deferredInstall) {
    track("install_click");
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch { /* ignore */ }
    deferredInstall = null; paintInstall();
  } else {
    track("ios_hint");
    modal(`<h3>Install Formatly</h3><p class="sub">On iPhone: tap the Share button in Safari, then Add to Home Screen. Formatly then opens like an app.</p>`);
  }
}
try { if (standalone() && !sessionStorage.getItem("fm-standalone")) { sessionStorage.setItem("fm-standalone", "1"); setTimeout(() => track("standalone"), 800); } } catch { /* ignore */ }

/* ---------- format helpers ---------- */
function fmtViews(n) {
  if (n >= 1e7) return Math.round(n / 1e6) + "M";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n);
}
const fmtInt = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
function fmtDur(s) {
  if (!s) return "n/a";
  if (s < 90) return s + " sec";
  if (s < 5400) return Math.round(s / 60) + " min";
  return (s / 3600).toFixed(1) + " h";
}
function fmtDate(d) {
  const x = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function usd(n) {
  if (n >= 100) return "$" + fmtInt(n);
  if (n >= 10) return "$" + n.toFixed(0);
  if (n >= 1) return "$" + n.toFixed(1).replace(/\.0$/, "");
  return "$" + n.toFixed(2);
}
const inr = (usdAmt) => "₹" + fmtInt(usdAmt * INR_PER_USD);
const rpmText = (r) => (r ? `$${r[0]}–$${r[1]}` : "No band");

function spark(hist) {
  if (!hist || hist.length < 2) return "";
  const v = hist.map((h) => h.views);
  const lo = Math.min(...v), hi = Math.max(...v);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 76 + 2},${hi === lo ? 12 : 22 - ((x - lo) / (hi - lo)) * 20}`).join(" ");
  return `<svg class="spark" width="80" height="24" viewBox="0 0 80 24" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#d7ff3f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------- data ---------- */
const nicheById = (id) => CAT.niches.find((n) => n.id === id);
const bandOf = (n) => CAT.groups[n.group].rpm;
// A result is a loose match when its title is in Latin script and shares no word with the search phrase.
// Titles in other scripts cannot be checked this way, so they are not flagged.
function isLatin(s) {
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (!letters.length) return false;
  return letters.replace(/[^A-Za-z]/g, "").length / letters.length > 0.7;
}
function looseMatch(n, v) {
  if (!isLatin(v.title)) return false;
  const ws = n.q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const hay = (v.title + " " + v.channel).toLowerCase();
  return ws.length > 0 && !ws.some((w) => hay.includes(w));
}
const liveCache = {};
function liveOf(id) {
  if (liveCache[id]) return liveCache[id];
  const raw = LIVE.niches[id] || { top: [], history: [] };
  const n = nicheById(id);
  const top = raw.top.map((v) => ({ ...v, loose: looseMatch(n, v) })).sort((a, b) => (a.loose - b.loose) || (b.views - a.views));
  return (liveCache[id] = { ...raw, top });
}
const topViews = (n) => (liveOf(n.id).top[0] ? liveOf(n.id).top[0].views : 0);
const strictViews = (n) => { const t = liveOf(n.id).top[0]; return t && !t.loose ? t.views : 0; };
/* ---------- estimate ---------- */
function estimate() {
  const n = calc.niche ? nicheById(calc.niche) : null;
  const k = calc.views / 1000;
  if (calc.kind === "shorts") {
    const r = SHORTS_RPM[calc.aud];
    return { lo: k * r, hi: k * r, note: calc.aud === "in" ? "Shorts viewed in India pay about $0.008 per 1,000 views (AIR Media-Tech partner data)." : "Shorts viewed in the US pay about $0.33 per 1,000 views (AIR Media-Tech partner data). A global mix is nearer $0.15 to $0.25." };
  }
  const band = n ? bandOf(n) : [3, 8];
  if (n && !band) return { none: true, note: "No published long-form band for this group, so there is no honest number to show." };
  const f = calc.aud === "in" ? INDIA_LONG_FACTOR : 1;
  return {
    lo: k * band[0] * f, hi: k * band[1] * f,
    note: (n ? `Band for ${CAT.groups[n.group].name}: $${band[0]}–$${band[1]} per 1,000 views. ` : "No niche picked, so this uses a middle band of $3–$8. ") +
      (calc.aud === "in" ? "India viewers pay about one-twentieth of US viewers on long videos (MilX CPM $0.74 vs $14.67), so the band is scaled by 0.05." : "Bands are mostly US-audience rates.")
  };
}
function calcHTML() {
  const t = Math.round(100 * Math.log(calc.views / 10000) / Math.log(1000));
  const opts = ['<option value="">Pick a niche (optional)</option>'].concat(
    Object.keys(CAT.groups).map((g) => `<optgroup label="${esc(CAT.groups[g].name)}">${CAT.niches.filter((n) => n.group === g).map((n) => `<option value="${n.id}" ${calc.niche === n.id ? "selected" : ""}>${esc(n.name)}</option>`).join("")}</optgroup>`)
  ).join("");
  return `<div class="calc">
    <div>
      <div class="field"><label>Views in a month</label><div class="val" id="c-val">${fmtInt(calc.views)}</div><input id="c-views" type="range" min="0" max="100" value="${t}" aria-label="Monthly views" /></div>
      <div class="field"><label>Video type</label><div class="seg" id="c-kind"><button class="${calc.kind === "long" ? "on" : ""}" data-v="long">Long videos</button><button class="${calc.kind === "shorts" ? "on" : ""}" data-v="shorts">Shorts</button></div></div>
      <div class="field"><label>Where viewers are</label><div class="seg" id="c-aud"><button class="${calc.aud === "us" ? "on" : ""}" data-v="us">US, UK, CA, AU</button><button class="${calc.aud === "in" ? "on" : ""}" data-v="in">India</button></div></div>
      <div class="field"><label>Niche</label><select id="c-niche">${opts}</select></div>
    </div>
    <div class="out" id="c-out"></div>
  </div>`;
}
function paintCalc() {
  const e = estimate();
  const out = $("#c-out");
  if (!out) return;
  if (e.none) {
    out.innerHTML = `<div class="eyebrow">YouTube ad revenue, estimated</div><div class="res">No band</div><p>${esc(e.note)}</p>`;
    return;
  }
  const same = Math.abs(e.hi - e.lo) < 1e-9;
  out.innerHTML = `<div class="eyebrow">YouTube ad revenue, estimated, per month</div>
    <div class="res">${same ? usd(e.lo) : usd(e.lo) + " – " + usd(e.hi)}</div>
    <div class="inr">${same ? inr(e.lo) : inr(e.lo) + " – " + inr(e.hi)} at ₹${INR_PER_USD}/$</div>
    <p>${esc(e.note)}</p>
    <p class="hint"><b>Instagram:</b> ₹0 per view in India. Reels earn through brand deals, gifts, subscriptions, or your own product. See Pricing and the FAQ.</p>`;
}
function bindCalc() {
  const v = $("#c-views");
  if (!v) return;
  v.oninput = () => {
    calc.views = Math.max(10000, Math.round(10000 * Math.pow(1000, v.value / 100) / 1000) * 1000);
    $("#c-val").textContent = fmtInt(calc.views);
    paintCalc();
  };
  [["#c-kind", "kind"], ["#c-aud", "aud"]].forEach(([sel, key]) => {
    $$(sel + " button").forEach((b) => (b.onclick = () => {
      calc[key] = b.dataset.v;
      $$(sel + " button").forEach((x) => x.classList.toggle("on", x === b));
      paintCalc();
    }));
  });
  $("#c-niche").onchange = (ev) => { calc.niche = ev.target.value; paintCalc(); };
  paintCalc();
}

/* ---------- home ---------- */
function card(n) {
  const lv = liveOf(n.id);
  const top = lv.top[0];
  const lockMark = n.recipe === "baby" ? '<span class="free">Free lesson</span>' : paid() ? "" : '<span class="lock">Pro</span>';
  return `<a class="card" href="#/n/${n.id}">
    <div class="g"><span>${esc(CAT.groups[n.group].name)}</span><span class="badge b-${n.ai}">${AI_LABEL[n.ai]}</span></div>
    <h3>${esc(n.name)}</h3>
    <div class="big">${top ? fmtViews(top.views) : "n/a"}<small>${top ? (top.loose ? "top result this week · loose match" : "top video this week") : "no result this week"}</small></div>
    ${spark(lv.history)}
    <div class="foot"><span>Long-form RPM ${rpmText(bandOf(n))}</span>${lockMark}</div>
  </a>`;
}
function filtered() {
  const q = state.q.trim().toLowerCase();
  let list = CAT.niches.filter((n) => {
    if (state.group !== "all" && n.group !== state.group) return false;
    if (state.reach === "ig" && !n.ig) return false;
    if (state.reach === "yt" && n.ig) return false;
    if (state.ai === "F" && n.ai !== "F") return false;
    if (q && !(n.name + " " + n.line + " " + CAT.groups[n.group].name).toLowerCase().includes(q)) return false;
    return true;
  });
  const hi = (n) => (bandOf(n) ? bandOf(n)[1] : -1);
  if (state.sort === "views") list.sort((a, b) => strictViews(b) - strictViews(a) || topViews(b) - topViews(a));
  else if (state.sort === "rpm") list.sort((a, b) => hi(b) - hi(a) || strictViews(b) - strictViews(a));
  else list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}
function paintGrid() {
  const list = filtered();
  $("#count").textContent = `${list.length} niche${list.length === 1 ? "" : "s"}`;
  $("#grid").innerHTML = list.slice(0, state.shown).map(card).join("") || '<p class="sub">Nothing matches. Clear a filter.</p>';
  $("#more").innerHTML = list.length > state.shown ? `<button class="btn ghost" id="showmore">Show ${Math.min(PAGE, list.length - state.shown)} more</button>` : "";
  const m = $("#showmore");
  if (m) m.onclick = () => { state.shown += PAGE; paintGrid(); };
}
function homeHTML() {
  const total = CAT.niches.length;
  const withTop = CAT.niches.filter((n) => topViews(n) > 0).length;
  const recipes = CAT.niches.filter((n) => n.recipe).length;
  const movers = CAT.niches.filter((n) => n.group === "ai-story" && strictViews(n) > 0).sort((a, b) => strictViews(b) - strictViews(a)).slice(0, 6);
  const radar = (RADAR.items || []).slice(0, 8);
  const groups = Object.keys(CAT.groups);
  const gchips = ['<button class="on" data-g="all">All</button>'].concat(groups.map((g) => `<button data-g="${g}">${esc(CAT.groups[g].name)}</button>`)).join("");
  const fromAd = /[?&](gclid=|utm_source=(google|instagram))/.test(location.search);
  const heroMain = fromAd
    ? `<h1>Copy-paste <em>AI video prompts</em> that already got millions of views.</h1>
    <p class="lead">Pick a viral AI format, copy its master prompt, and paste it into Google Flow, Veo or ChatGPT. This is not a video generator: it is the prompts and steps that make the video in your own tool. The full AI baby comedy lesson with 3 master prompts is free. Pro is a one-time ₹${PRICE} for 30 days of all ${total} niches.</p>
    <div class="cta"><a class="btn big" href="#/n/ai-baby-comedy">Open the free lesson</a><button class="btn big ghost" data-go="pricing">See Pro · ₹${PRICE}</button></div>`
    : `<h1>What is working in <em>AI video</em> this week.</h1>
    <p class="lead">${total} niches for YouTube and Instagram. For each one: the biggest video of the week, what it can earn from ads, and the exact prompts to make it. The views are counted. The money is sourced.</p>
    <div class="cta"><a class="btn big" href="#/" data-go="browse">Browse ${total} niches</a><button class="btn big ghost" data-go="pricing">See Pro · ₹${PRICE}</button></div>`;
  return `
  <div class="hero">
    <div class="kicker"><i class="dot"></i>Scanned ${esc(fmtDate(LIVE.updated || CAT.updated || new Date().toISOString().slice(0, 10)))} · updates every Monday</div>
    ${heroMain}
    <div class="stats">
      <div class="stat"><b>${total}</b><span>niches in the scan</span></div>
      <div class="stat"><b>${withTop}</b><span>with a top video this week</span></div>
      <div class="stat"><b>${recipes + new Set(CAT.niches.map((x) => x.style)).size}</b><span>step-by-step playbooks, every niche covered</span></div>
      <div class="stat"><b>${CAT.sources ? Object.keys(CAT.sources).length : 0}</b><span>cited sources for the money</span></div>
    </div>
  </div>

  <section id="movers">
    <div class="sec-h"><div><h2>AI formats, this week</h2><p class="sub">The most-viewed video uploaded in the last seven days for each AI format. Click one to see the videos and how to make it.</p></div></div>
    <div class="movers">${movers.map((n, i) => {
      const t = liveOf(n.id).top[0];
      return `<a class="mover" href="#/n/${n.id}"><span class="rank">0${i + 1}</span><div class="num">${fmtViews(t.views)}</div><div class="cap">views, top video this week</div><h3>${esc(n.name)}</h3><p>${esc(n.line)}</p></a>`;
    }).join("")}</div>
  </section>

  ${radar.length ? `<section id="radar">
    <div class="sec-h"><div><h2>New phrases on the radar</h2><p class="sub">YouTube's own suggestions after "ai" plus each letter. Nobody typed these in. Each shows the top video this week for the phrase.</p></div></div>
    <div class="radar">${radar.map((r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener"><b>${fmtViews(r.views)}</b><span>${esc(r.phrase)}<small>${esc(r.title.slice(0, 80))}</small></span></a>`).join("")}</div>
  </section>` : ""}

  <section id="browse">
    <div class="sec-h"><div><h2>Every niche</h2><p class="sub">Search ${total} niches. Sorted by this week's top video unless you change it. Open one for the full numbers.</p></div></div>
    <div class="tools">
      <div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="q" type="search" placeholder="Search niches: baby, finance, cars, survival…" value="${esc(state.q)}" /></div>
      <div class="seg" id="s-ai"><button data-v="all" class="${state.ai === "all" ? "on" : ""}">All</button><button data-v="F" class="${state.ai === "F" ? "on" : ""}">Made with AI</button></div>
      <div class="seg" id="s-reach"><button data-v="all" class="${state.reach === "all" ? "on" : ""}">YouTube + Instagram</button><button data-v="ig" class="${state.reach === "ig" ? "on" : ""}">Fits Reels</button><button data-v="yt" class="${state.reach === "yt" ? "on" : ""}">Long loops only</button></div>
      <select id="sort"><option value="views">Sort: this week's views</option><option value="rpm">Sort: highest RPM band</option><option value="az">Sort: A to Z</option></select>
    </div>
    <div class="groups" id="groups">${gchips}</div>
    <div class="count" id="count"></div>
    <div class="grid" id="grid"></div>
    <div class="more" id="more"></div>
  </section>

  <section id="calc">
    <div class="sec-h"><div><h2>What could it earn?</h2><p class="sub">Views divided by 1,000, times a rate. Same arithmetic as the reel with 14 faceless niches, but with the rate shown and sourced. Shorts and India both pay far less than people expect.</p></div></div>
    ${calcHTML()}
  </section>

  <section id="stack">
    <div class="sec-h"><div><h2>Which tool for what</h2><p class="sub">Capabilities from three 2026 comparisons. Free tiers and prices change, so check each site before you pay anyone.</p></div></div>
    <table class="tbl">
      <thead><tr><th>Tool</th><th>Good for</th><th>Watch for</th></tr></thead>
      <tbody>
        <tr><td><b>Google Flow</b> (Omni Flash, Veo 3.1)</td><td>Our default. Vertical 9:16, ingredient images keep a character the same, saved voices keep a voice the same (Omni Flash).</td><td>One clip is 8 to 10 seconds. Voice references only work together with ingredients. Check the model picker for what your plan includes.</td></tr>
        <tr><td><b>Veo 3.1</b> (Google)</td><td>Cinematic shots that follow the prompt, with sound generated in the clip.</td><td>Short clips, about 4 to 8 seconds. Costly to retry.</td></tr>
        <tr><td><b>Kling 3.0</b></td><td>Motion Control copies a dance from your own clip onto a character image. Dialogue with lip-sync, 10 to 15 second shots.</td><td>Read its licence for monetised use.</td></tr>
        <tr><td><b>Hailuo 2.3</b></td><td>Expressive faces and close-ups. Fast and low cost.</td><td>Clips cap near 6 to 10 seconds.</td></tr>
        <tr><td><b>Seedance 2.0</b></td><td>Motion-heavy shots and dance. Led one public benchmark in 2026.</td><td>Access varies by country.</td></tr>
        <tr><td><b>Runway Gen-4.5</b></td><td>Directed work: keyframes, image-to-video, restyling a clip.</td><td>More control means more steps.</td></tr>
        <tr><td><b>ChatGPT, Gemini, Claude</b></td><td>Scripts, series plans, titles. Every recipe here starts with one.</td><td>Ask for sources on any fact and open them.</td></tr>
        <tr><td><b>CapCut</b></td><td>Captions, cuts, and export for vertical video.</td><td>Check the music licence before you post.</td></tr>
      </tbody>
    </table>
    <p class="src">From <a href="https://tech-insider.org/best-ai-video-generator-2026/" target="_blank" rel="noopener">tech-insider.org</a>, <a href="https://www.creativeainews.com/articles/ai-video-generation-benchmark-2026-comparison/" target="_blank" rel="noopener">creativeainews.com</a> and <a href="https://inkfox.app/blog/best-ai-video-generators-2026" target="_blank" rel="noopener">inkfox.app</a>. Not paid placements.</p>
  </section>

  <section id="pricing">
    <div class="sec-h"><div><h2>Pro, ₹${PRICE} for 30 days</h2><p class="sub">Look around for free. Pay when you want to make the videos.</p></div></div>
    <div class="price">
      <div class="plan pro">
        <h3>Pro</h3>
        <div class="p">₹${PRICE}<small> / 30 days, one time</small></div>
        <ul>
          <li>${recipes} deep recipes for the AI formats that are working (horror, myth, baby comedy and more): a master prompt for ChatGPT that writes your Google Flow prompts</li>
          <li>Character lock and voice lock blocks so the same cast and voice come back every episode</li>
          <li>The input to send each time, an example, the Flow settings and a pre-post checklist</li>
          <li>${new Set(CAT.niches.map((x) => x.style)).size} format playbooks, each with its own master prompt, that cover every other niche (${total} in all). Finance, health, tech, food, DIY and the rest are made as explainers, how-tos, news roundups and so on, and each playbook says how.</li>
          <li>Each lesson lists the sources it was researched from, and the platform rules that apply</li>
        </ul>
        ${paid() ? '<button class="btn big ghost" data-account>Pro is on · Account</button>' : `<button class="btn big" data-buy>Unlock · ₹${PRICE}</button>`}
        <p class="fine">Pay ₹${PRICE} once by UPI or card, through Razorpay. You get 30 days of access. There is no auto-renewal and no mandate; extend only if you want more time. <a href="terms.html">Terms</a> and <a href="refund.html">refunds</a>.</p>
      </div>
      <div class="plan free">
        <h3>Free</h3>
        <div class="p">₹0</div>
        <ul>
          <li>All ${total} niches with this week's top videos</li>
          <li>Earnings calculator with sourced rates</li>
          <li>The AI baby comedy lesson in full, with its three master prompts</li>
          <li>Instagram and Shorts reality checks</li>
        </ul>
      </div>
    </div>
  </section>

  <section id="faq">
    <div class="sec-h"><h2>Questions</h2></div>
    <div class="faq">
      <details><summary>Where do the earnings numbers come from?</summary><p>Long-form RPM bands come from published 2026 niche reports (listed under Sources). Shorts rates come from AIR Media-Tech's partner data. They are for comparing niches. Your YouTube Studio is the only real number.</p></details>
      <details><summary>How is "this week" measured?</summary><p>Every Monday a script runs a YouTube search for each niche, limited to videos uploaded that week and sorted by views, and records the top three. Where a result does not look like the niche, the page marks it as a loose match. Instagram has no public counters, so Instagram fit is a judgement about the format, not a measurement.</p></details>
      <details><summary>Does Instagram pay per view in India?</summary><p>No. Instagram's own help page says its bonus programs are invite-only and run in the US, South Korea, and Japan. In India, money comes from gifts, subscriptions (10,000 followers), brand deals, affiliate links, or selling your own product. Views are how you reach those.</p></details>
      <details><summary>Will I get these views?</summary><p>No promise. A top video this week shows what an audience is watching. It does not say what a new channel will get.</p></details>
      <details><summary>Does Pro renew by itself?</summary><p>No. The ₹49 pass is a single payment for 30 days. There is no UPI AutoPay mandate and nothing is charged again. When the 30 days end, access ends; buy another pass if you want more time. Members who joined earlier on the ₹149 monthly plan can still cancel that renewal in Account.</p></details>
      <details><summary>Can I get a refund?</summary><p>No. The lessons open the moment you pay, so the ₹49 is not returned. Nothing is charged again, so there is nothing to cancel.</p></details>
      <details><summary>How do I sign in on another phone or computer?</summary><p>Press Sign in and use the same Google account, or the same email and password, that you paid with.</p></details>
      <details><summary>I paid but I have no access</summary><p>Press Sign in and use the same Google account, or the same email and password, that you paid with. If that still fails, use Contact us at the bottom of the page and include the payment ID from your receipt. We fix it the same day.</p></details>
      <details><summary>What do you store about me?</summary><p>Your email, name and the phone number Razorpay shares, your subscription status, and anonymous page counts. No card or UPI details ever reach us. See the <a href="privacy.html">privacy policy</a>.</p></details>
      <details><summary>Do I have to mark AI videos?</summary><p>YouTube has a setting to disclose realistic altered or synthetic content. Turn it on. Every recipe says so, and every recipe uses original characters, not real people.</p></details>
    </div>
  </section>

  <section id="sources">
    <div class="sec-h"><h2>Sources</h2></div>
    <div class="faq">${Object.values(CAT.sources).map((s) => `<details><summary>${esc(s.name)}</summary><p><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></p></details>`).join("")}</div>
  </section>`;
}
function bindHome() {
  $("#q").oninput = (e) => { state.q = e.target.value; state.shown = PAGE; paintGrid(); };
  [["#s-ai", "ai"], ["#s-reach", "reach"]].forEach(([sel, key]) => $$(sel + " button").forEach((b) => (b.onclick = () => {
    state[key] = b.dataset.v; state.shown = PAGE;
    $$(sel + " button").forEach((x) => x.classList.toggle("on", x === b));
    paintGrid();
  })));
  $("#sort").value = state.sort;
  $("#sort").onchange = (e) => { state.sort = e.target.value; state.shown = PAGE; paintGrid(); };
  $$("#groups button").forEach((b) => {
    b.classList.toggle("on", b.dataset.g === state.group);
    b.onclick = () => { state.group = b.dataset.g; state.shown = PAGE; $$("#groups button").forEach((x) => x.classList.toggle("on", x === b)); paintGrid(); };
  });
  paintGrid();
  bindCalc();
}

/* ---------- niche page ---------- */
function promptHTML(p, n) {
  const text = p.text.replace(/\[NICHE\]/g, n.name);
  const shown = esc(text).replace(/\[[^\]\n]{1,80}\]/g, (m) => `<mark>${m}</mark>`);
  return `<div class="prompt"><header><div><b>${esc(p.label)}</b><small>${esc(p.tool || "")}</small></div><button class="copy" data-copy="${esc(text).replace(/\n/g, "&#10;")}">Copy</button></header><pre>${shown}</pre></div>`;
}
const liHTML = (a) => (a || []).map((s) => `<li>${esc(s)}</li>`).join("");
function lessonBody(d, n, o) {
  o = o || {};
  const stack = Object.entries(d.stack || {}).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const note = d.kind === "style" ? `<p class="sub" style="margin:-6px 0 14px">This playbook covers the whole format. Wherever you see [NICHE], write ${esc(n.name)}. Fill the other highlighted [BRACKETS] once.</p>` : "";
  const how = `<p class="sub" style="margin:-4px 0 12px">Make a ChatGPT project (or a Custom GPT, or a Cursor rule). Paste this once as its instructions. After that you only send the short input in box 3 each time, and it returns prompts ready for Flow.</p>`;
  const ex = d.example ? `<div class="example"><b>Example input</b><pre>${esc(d.example.input)}</pre><p>${esc(d.example.note || "")}</p></div>` : "";
  return `<div class="cols">
    <div class="panel"><h3>${d.kind === "style" ? "Playbook: " + esc(d.title) : esc(d.title)}</h3>${note}
      <p class="sub" style="margin:0 0 14px"><b style="color:#f5f5f4">Why it lasts.</b> ${esc(d.lasts)}</p>
      <h4>Tool stack</h4><dl class="stack">${stack}</dl>
      <h4>Set up once</h4><ol class="steps">${liHTML(d.setup)}</ol>
      <h4>Every video</h4><ol class="steps">${liHTML(d.loop)}</ol>
      <h4>Settings in Flow or the video tool</h4><ol class="steps plain">${liHTML(d.flow)}</ol>
      <h4>Check before you post</h4><ul class="checks">${liHTML(d.qc)}</ul>
      <p class="avoid">${esc(d.avoid)}</p>
      <h4>Platform rules for this format</h4><ul class="rules">${liHTML(d.policy)}</ul>
      <h4>Researched from</h4><ul class="srcs">${(d.sources || []).map((s) => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join("")}</ul>
      ${o.licensed ? `<p class="fine" style="margin-top:18px">Licensed to ${esc(o.licensed)} for personal use. Please do not share or resell the prompts.</p>` : ""}
    </div>
    <div>
      <div class="panel"><h3>1 · Master prompt, paste once</h3>${how}${promptHTML(d.master, n)}</div>
      ${(d.locks || []).length ? `<div class="panel" style="margin-top:16px"><h3>2 · Locks, your look and voice</h3><p class="sub" style="margin:-4px 0 12px">These blocks are already inside the master prompt. Fill the highlighted [BRACKETS] once and then never change a word.</p>${d.locks.map((l) => promptHTML(l, n)).join("")}</div>` : ""}
      <div class="panel" style="margin-top:16px"><h3>${(d.locks || []).length ? "3" : "2"} · What you send each time</h3>${promptHTML(d.input, n)}${ex}</div>
    </div>
  </div>`;
}
function lockedLesson(n, why) {
  const isRecipe = Boolean(n.recipe);
  return `<div class="cols locked">
      <div class="panel ghost"><h3>How to make it</h3><ol class="steps">${Array.from({ length: 6 }, () => "<li>Placeholder line that stays hidden until you are a Pro member, six steps in all.</li>").join("")}</ol></div>
      <div class="panel ghost"><h3>Master prompt</h3><div class="prompt"><header><b>1. Master prompt</b></header><pre>Placeholder text that stays hidden until you are a Pro member. The real prompt is not in this page.</pre></div><div class="prompt"><pre>Placeholder text.</pre></div></div>
      <div class="gate"><div class="gate-box"><span class="badge b-F">Pro</span><b>${isRecipe ? "Full recipe, master prompt and locks" : "Full playbook and master prompt"}</b><p>${!isRecipe && STYLE_TITLE[n.style] ? "This niche is made with the “" + esc(STYLE_TITLE[n.style]) + "” playbook, with " + esc(n.name) + " filled in for you. " : ""}${why ? esc(why) + " " : ""}${isRecipe ? "The ChatGPT master prompt, the character and voice locks, the Flow settings, the checklist and the sources" : "The ChatGPT master prompt, the step-by-step plan, the tools, the checklist and the sources"} for ${esc(n.name)}. ₹${PRICE} one time for 30 days, no auto-renewal.</p><button class="btn big" data-buy>Unlock · ₹${PRICE}</button><button class="link" data-restore>Already paid? Sign in</button></div></div>
    </div>`;
}
async function hydrateLesson(n) {
  const slot = $("#lesson-slot");
  if (!slot) return;
  if (n.recipe === "baby") { slot.innerHTML = lessonBody(FREE, n); bindCopy(); return; }
  if (!paid()) { slot.innerHTML = lockedLesson(n); return; }
  slot.innerHTML = '<p class="sub" style="padding:30px 0">Loading your lesson…</p>';
  const id = n.recipe || n.style;
  try {
    const r = await loadLesson(id);
    if (currentNiche !== n.id) return;
    slot.innerHTML = lessonBody(r.lesson, n, { licensed: r.licensedTo });
    bindCopy();
  } catch (e) {
    if (currentNiche !== n.id) return;
    if (e.status === 401 || e.status === 402) { await refreshMe(); paintChip(); slot.innerHTML = lockedLesson(n, e.message); }
    else slot.innerHTML = `<p class="sub" style="padding:30px 0">Could not load the lesson. ${esc(e.message)} <button class="btn" data-retry>Try again</button></p>`;
  }
}
function bindCopy() {
  $$(".copy").forEach((b) => (b.onclick = () => {
    const t = b.getAttribute("data-copy");
    const done = () => { b.textContent = "Copied"; b.classList.add("done"); setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done);
    else { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); }
  }));
}
function nicheHTML(n) {
  const lv = liveOf(n.id);
  const g = CAT.groups[n.group];
  const band = g.rpm;
  const top = lv.top[0];
  const k = 500;
  const vids = lv.top.map((v) => `<a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener"><b>${fmtViews(v.views)}</b><div class="t">${esc(v.title.slice(0, 110))}<small>${esc(v.channel)} · ${fmtDur(v.secs)} ${v.loose ? '<span class="loose">· loose match</span>' : ""}</small></div><span class="lock" style="color:#9b9ba6">↗</span></a>`).join("");
  const igBox = n.ig
    ? `<div class="ig-box"><b>Instagram.</b> Reels pay ₹0 per view in India. Instagram's bonus program is invite-only and limited to the US, South Korea and Japan. The money comes from:<ul><li>Brand deals priced on your reach (Creator Marketplace, or direct)</li><li>Gifts (US$0.01 per Star) and subscriptions at 10,000 followers</li><li>Affiliate links, or your own product</li></ul><p class="src" style="margin:10px 0 0">Source: <a href="https://help.instagram.com/708013994693013" target="_blank" rel="noopener">Instagram Help Center</a>. Instagram has no public view counters, so fit here is judged from the format.</p></div>`
    : `<div class="ig-box"><b>Instagram.</b> This one is a long loop. It does not suit Reels. Use YouTube.</div>`;
  const reel = n.reel ? `<p class="src">A reel listing 14 faceless niches claims <b>${esc(n.reel)}</b> for this niche. That is its author's estimate (views ÷ 1,000 × an assumed RPM), not a payout.</p>` : "";
  return `
  <a class="back" href="#/">← All niches</a>
  <div class="d-head">
    <div class="g" style="display:flex;gap:10px;align-items:center"><span class="badge b-${n.ai}">${AI_LABEL[n.ai]}</span><span class="sub" style="margin:0">${esc(g.name)}</span>${n.recipe === "baby" ? '<span class="free">Free lesson</span>' : ""}</div>
    <h1>${esc(n.name)}</h1>
    <p class="lead">${esc(n.line)}</p>
    <div class="metrics">
      <div class="metric"><span>Top video this week</span><b>${top ? fmtViews(top.views) : "n/a"}</b><small>views${top && top.loose ? " · loose match" : ""}</small>${spark(lv.history)}</div>
      <div class="metric"><span>Typical length of the top three</span><b>${lv.medianSecs ? fmtDur(lv.medianSecs) : "n/a"}</b><small>median, this week</small></div>
      <div class="metric"><span>Long-form RPM band</span><b>${rpmText(band)}</b><small>per 1,000 views, US-style audience</small></div>
      <div class="metric"><span>Shorts per 1M views</span><b>${usd(SHORTS_RPM.in * 1000)}–${usd(SHORTS_RPM.us * 1000)}</b><small>India viewers to US viewers</small></div>
    </div>
  </div>

  <section style="padding-top:34px"><div class="sec-h"><div><h2>This week's top videos</h2><p class="sub">YouTube search "${esc(n.q)}", uploaded in the last 7 days, sorted by views. ${esc(fmtDate(LIVE.updated || ""))}.</p></div></div>
    <div class="vids">${vids || '<p class="sub">The scan found no videos for this phrase this week.</p>'}</div>
  </section>

  <section><div class="sec-h"><div><h2>Make it</h2></div></div><div id="lesson-slot"></div></section>

  <section><div class="sec-h"><div><h2>What it could earn</h2></div></div>${calcHTML()}<div style="margin-top:14px">${igBox}</div>${reel}</section>`;
}
function bindNiche(n) {
  calc.niche = n.id;
  currentNiche = n.id;
  bindCalc();
  hydrateLesson(n);
}

/* ---------- routing ---------- */
function route() {
  if (!CAT) return;
  const m = location.hash.match(/^#\/n\/([a-z0-9-]+)/);
  const app = $("#app");
  paintChip();
  if (m && nicheById(m[1])) {
    const n = nicheById(m[1]);
    calc.niche = n.id;
    app.innerHTML = nicheHTML(n);
    track("pv"); track("niche", { nid: n.id });
    bindNiche(n);
    document.title = n.name + " · Formatly";
    window.scrollTo(0, 0);
  } else {
    currentNiche = "";
    app.innerHTML = homeHTML();
    track("pv");
    bindHome();
    document.title = "Formatly: what is working in AI video this week";
    if (pendingScroll) { const t = $("#" + pendingScroll); pendingScroll = null; if (t) t.scrollIntoView(); }
  }
}
document.addEventListener("click", (e) => {
  const buyBtn = e.target.closest("[data-buy]");
  if (buyBtn) { e.preventDefault(); if (paid()) { accountModal(); return; } buyModal(); return; }
  if (e.target.closest("[data-restore]")) { e.preventDefault(); restoreModal(); return; }
  if (e.target.closest("[data-account]")) { e.preventDefault(); accountModal(); return; }
  const ct = e.target.closest("[data-contact]");
  if (ct) { e.preventDefault(); contactModal(); return; }
  if (e.target.closest("[data-install]")) { e.preventDefault(); installApp(); return; }
  if (e.target.closest("[data-retry]")) { const n = currentNiche && nicheById(currentNiche); if (n) hydrateLesson(n); return; }
  const go = e.target.closest("[data-go]");
  if (go) {
    e.preventDefault();
    const id = go.dataset.go;
    const home = !/^#\/n\//.test(location.hash);
    if (home) { const t = $("#" + id); if (t) t.scrollIntoView(); }
    else { pendingScroll = id; location.hash = "#/"; }
  }
});
window.addEventListener("hashchange", route);

Promise.all([
  fetch("./data/catalog.json?v=20").then((r) => r.json()),
  fetch("./data/live.json?v=20").then((r) => (r.ok ? r.json() : { niches: {} })).catch(() => ({ niches: {} })),
  fetch("./data/radar.json?v=20").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
  fetch("./data/free.json?v=20").then((r) => r.json())
]).then(([cat, live, radar, free]) => {
  CAT = cat; LIVE = live; RADAR = radar; FREE = free;
  return refreshMe();
}).then(() => { paintInstall(); route(); }).catch(() => {
  $("#app").innerHTML = '<p style="padding:80px 0;color:#9b9ba6">Could not load the scan. Refresh the page.</p>';
});
