"use strict";

const PASS_KEY = "formatly-pass";
const PASS_DAYS = 30;
const PRICE = 149;
const INR_PER_USD = 96.7; // US Federal Reserve H.10, 9 Oct 2026, as quoted by fluxnote.io
const SHORTS_RPM = { us: 0.328, in: 0.008 }; // US$ per 1,000 views, AIR Media-Tech partner data
const INDIA_LONG_FACTOR = 0.74 / 14.67; // MilX long-form CPM, India vs US
const PAGE = 24;

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
let CAT = null, LIVE = { niches: {} }, RADAR = { items: [] }, FREE = null, PRO = null, proLoading = null;
let pendingScroll = null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- pass ---------- */
function pass() {
  try {
    const p = JSON.parse(localStorage.getItem(PASS_KEY) || "null");
    return p && p.until > Date.now() ? p : null;
  } catch { return null; }
}
const paid = () => Boolean(pass());
function grant(paymentId) {
  localStorage.setItem(PASS_KEY, JSON.stringify({ until: Date.now() + PASS_DAYS * 864e5, pid: paymentId || "" }));
  loadPro().then(route);
}
function loadPro() {
  if (PRO) return Promise.resolve(PRO);
  if (!proLoading) {
    proLoading = fetch("./data/pro.json?v=11").then((r) => r.json()).then((d) => (PRO = d)).catch(() => { proLoading = null; return null; });
  }
  return proLoading;
}
async function buy() {
  const cfg = window.ABHICHAL || {};
  if (!cfg.razorpayKey) { alert("Payment key is missing."); return; }
  if (!window.Razorpay) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => alert("Could not load the payment window. Check your connection."));
  }
  if (!window.Razorpay) return;
  new Razorpay({
    key: cfg.razorpayKey,
    amount: cfg.amountPaise,
    currency: "INR",
    name: "Formatly",
    description: cfg.packName,
    theme: { color: "#d7ff3f" },
    handler(resp) { grant(resp && resp.razorpay_payment_id); }
  }).open();
}
function paintChip() {
  const p = pass();
  const el = $("#passchip");
  if (p) {
    el.innerHTML = `<span class="chip-pass">Pro until ${esc(fmtDate(new Date(p.until)))}</span>`;
  } else {
    el.innerHTML = `<button class="btn" data-buy>Unlock all · ₹${PRICE}/month</button>`;
  }
}

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
function lesson(n) {
  if (n.recipe === "baby") return { kind: "recipe", data: FREE, stack: FREE.stack, free: true };
  if (!PRO) return null;
  if (n.recipe && PRO.recipes[n.recipe]) return { kind: "recipe", data: PRO.recipes[n.recipe], stack: PRO.stack };
  const st = PRO.styles[n.style];
  return st ? { kind: "style", data: st, stack: PRO.stack, style: n.style } : null;
}
const canOpen = (n) => n.recipe === "baby" || paid();

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
  return `
  <div class="hero">
    <div class="kicker"><i class="dot"></i>Scanned ${esc(fmtDate(LIVE.updated || CAT.updated || new Date().toISOString().slice(0, 10)))} · updates every Monday</div>
    <h1>What is working in <em>AI video</em> this week.</h1>
    <p class="lead">${total} niches for YouTube and Instagram. For each one: the biggest video of the week, what it can earn from ads, and the exact prompts to make it. The views are counted. The money is sourced.</p>
    <div class="cta"><a class="btn big" href="#/" data-go="browse">Browse ${total} niches</a><button class="btn big ghost" data-go="pricing">See Pro · ₹${PRICE}/month</button></div>
    <div class="stats">
      <div class="stat"><b>${total}</b><span>niches in the scan</span></div>
      <div class="stat"><b>${withTop}</b><span>with a top video this week</span></div>
      <div class="stat"><b>${recipes}</b><span>AI formats with full recipes</span></div>
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
        <tr><td><b>Veo 3.1</b> (Google)</td><td>Cinematic shots that follow the prompt, with sound generated in the clip.</td><td>Short clips, about 4 to 8 seconds. Costly to retry.</td></tr>
        <tr><td><b>Kling 3.0</b></td><td>Consistent characters, dialogue with lip-sync, 10 to 15 second shots.</td><td>Read its licence for monetised use.</td></tr>
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
    <div class="sec-h"><div><h2>Pro, ₹${PRICE} a month</h2><p class="sub">Look around for free. Pay when you want to make the videos.</p></div></div>
    <div class="price">
      <div class="plan pro">
        <h3>Pro</h3>
        <div class="p">₹${PRICE}<small> / 30 days</small></div>
        <ul>
          <li>All ${recipes} AI format recipes, step by step</li>
          <li>Master prompts for script, character, and scene, ready to copy</li>
          <li>A playbook with prompts for every other niche (${total} in all)</li>
          <li>Each Monday: new top videos and new phrases on the radar</li>
          <li>The tool stack for each recipe</li>
        </ul>
        ${paid() ? '<span class="chip-pass">Pro is on</span>' : `<button class="btn big" data-buy>Unlock 30 days · ₹${PRICE}</button>`}
        <p class="fine">One payment buys 30 days on this device. It does not renew by itself. <a href="terms.html">Terms and refunds</a>.</p>
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
      <details><summary>Does Pro renew by itself?</summary><p>No. ₹149 buys 30 days on the device you pay from. Pay again to extend. Automatic renewal needs a different setup that is not live yet.</p></details>
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
  const shown = esc(text).replace(/\[[^\]]+\]/g, (m) => `<mark>${m}</mark>`);
  return `<div class="prompt"><header><div><b>${esc(p.label)}</b><small>${esc(p.tool)}</small></div><button class="copy" data-copy="${esc(text).replace(/\n/g, "&#10;")}">Copy</button></header><pre>${shown}</pre></div>`;
}
function lessonHTML(n) {
  const L = lesson(n);
  const open = canOpen(n);
  if (!open || !L) {
    const isRecipe = Boolean(n.recipe);
    return `<div class="cols locked">
      <div class="panel ghost"><h3>How to make it</h3><ol class="steps">${Array.from({ length: 6 }, () => '<li>Placeholder line that stays hidden until the pass is on, six steps in all.</li>').join("")}</ol></div>
      <div class="panel ghost"><h3>Master prompts</h3><div class="prompt"><header><b>1. Script prompt</b></header><pre>Placeholder prompt text that stays hidden until the pass is on. Three prompts in all, ready to copy.</pre></div><div class="prompt"><pre>Placeholder prompt text.</pre></div></div>
      <div class="gate"><div class="gate-box"><span class="badge b-F">Pro</span><b>${isRecipe ? "Full recipe and master prompts" : "Playbook and master prompts"}</b><p>6 steps, 3 copy-ready prompts, and the tool stack for ${esc(n.name)}. ₹${PRICE} for 30 days.</p><button class="btn big" data-buy>Unlock 30 days · ₹${PRICE}</button></div></div>
    </div>`;
  }
  const d = L.data;
  const stack = Object.entries(L.stack).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const title = L.kind === "recipe" ? "How to make it" : `Playbook: ${STYLE_NAME[L.style]}`;
  const note = L.kind === "style" ? `<p class="sub" style="margin:-6px 0 14px">This playbook covers the whole format. Fill the highlighted [BRACKETS] with your topic inside ${esc(n.name)}.</p>` : "";
  return `<div class="cols">
    <div class="panel"><h3>${esc(title)}</h3>${note}<ol class="steps">${d.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${d.shape ? `<h3 style="margin-top:22px">Shape of the script</h3><div class="shape">${esc(d.shape)}</div>` : ""}
      ${d.lasts ? `<p class="sub" style="margin-top:16px"><b style="color:#f5f5f4">How long it lasts.</b> ${esc(d.lasts)}</p>` : ""}
      <p class="avoid">${esc(d.avoid)}</p>
      <h3 style="margin-top:22px">Tool stack</h3><dl class="stack">${stack}</dl>
    </div>
    <div><div class="panel"><h3>Master prompts</h3>${d.prompts.map((p) => promptHTML(p, n)).join("")}<p class="fine">Fill in the highlighted [BRACKETS]. Keep characters original and turn on the synthetic-content label.</p></div></div>
  </div>`;
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

  <section><div class="sec-h"><div><h2>Make it</h2></div></div>${lessonHTML(n)}</section>

  <section><div class="sec-h"><div><h2>What it could earn</h2></div></div>${calcHTML()}<div style="margin-top:14px">${igBox}</div>${reel}</section>`;
}
function bindNiche(n) {
  calc.niche = n.id;
  $$(".copy").forEach((b) => (b.onclick = () => {
    const t = b.getAttribute("data-copy");
    const done = () => { b.textContent = "Copied"; b.classList.add("done"); setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done);
    else { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); }
  }));
  bindCalc();
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
    bindNiche(n);
    document.title = n.name + " · Formatly";
    window.scrollTo(0, 0);
  } else {
    app.innerHTML = homeHTML();
    bindHome();
    document.title = "Formatly: what is working in AI video this week";
    if (pendingScroll) { const t = $("#" + pendingScroll); pendingScroll = null; if (t) t.scrollIntoView(); }
  }
}
document.addEventListener("click", (e) => {
  const buyBtn = e.target.closest("[data-buy]");
  if (buyBtn) { buy(); return; }
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
  fetch("./data/catalog.json?v=11").then((r) => r.json()),
  fetch("./data/live.json?v=11").then((r) => (r.ok ? r.json() : { niches: {} })).catch(() => ({ niches: {} })),
  fetch("./data/radar.json?v=11").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
  fetch("./data/free.json?v=11").then((r) => r.json())
]).then(([cat, live, radar, free]) => {
  CAT = cat; LIVE = live; RADAR = radar; FREE = free;
  return paid() ? loadPro() : null;
}).then(route).catch(() => {
  $("#app").innerHTML = '<p style="padding:80px 0;color:#9b9ba6">Could not load the scan. Refresh the page.</p>';
});
