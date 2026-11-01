const LOG = "abhichal-hisab";

function views(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function money(n) {
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let filter = "all";

function pills(n) {
  return [
    n.yt ? '<span class="pill yt">YouTube</span>' : "",
    n.ig ? '<span class="pill ig">Instagram</span>' : ""
  ].join("");
}

function card(n, base) {
  const yt = n.rpm
    ? `${money(base / 1000 * n.rpm[0])}–${money(base / 1000 * n.rpm[1])}`
    : "No RPM band";
  return `<button type="button" class="niche" data-id="${esc(n.id)}">${pills(n)}<h2>${esc(n.name)}</h2><p class="about">${esc(n.about)}</p><div class="money"><div><span>YouTube / 500k views</span><strong>${yt}</strong></div><div><span>Instagram</span><strong>Same video, as a Reel</strong></div></div><div class="open-label">How to make it</div></button>`;
}

function lesson(n, base) {
  const yt = n.rpm
    ? `${money(base / 1000 * n.rpm[0])}–${money(base / 1000 * n.rpm[1])} at 500k views`
    : "No RPM band";
  const link = n.example
    ? `<a class="ex" href="${esc(n.example.url)}">${esc(n.example.title)} · ${views(n.example.views)} views</a>`
    : "";
  const steps = n.steps.map((s) => `<li>${esc(s)}</li>`).join("");
  return `<article class="lesson"><button type="button" class="back" id="back">All AI formats</button>${pills(n)}<h2>${esc(n.name)}</h2><p class="about">${esc(n.about)}</p><div class="facts"><div><span>Length</span>${esc(n.length)}</div><div><span>How long it lasts</span>${esc(n.lasts)}</div><div><span>YouTube estimate</span>${yt}</div></div>${link}<h3>How to make it</h3><ol>${steps}</ol><h3>The shape of the script</h3><div class="shape">${esc(n.shape)}</div><h3>Tools</h3><p>${esc(n.tools)}</p><h3>Leave out</h3><p>${esc(n.avoid)}</p><p class="small">Instagram pays this as reach, not a per-view rate. Post the same video as a Reel.</p></article>`;
}

function render(doc) {
  const base = doc.assumptionViews;
  document.getElementById("source").textContent = doc.source;
  const openId = location.hash.slice(1);
  const open = doc.niches.find((n) => n.id === openId);
  const list = document.getElementById("list");
  document.querySelector(".filters").hidden = Boolean(open);
  if (open) {
    list.className = "";
    list.innerHTML = lesson(open, base);
    document.getElementById("back").onclick = () => { location.hash = ""; };
    window.scrollTo(0, 0);
    return;
  }
  const items = doc.niches.filter((n) => filter === "all" || (filter === "youtube" ? n.yt : n.ig));
  list.className = "grid";
  list.innerHTML = items.map((n) => card(n, base)).join("");
  list.querySelectorAll(".niche").forEach((btn) => {
    btn.onclick = () => { location.hash = btn.dataset.id; };
  });
}

document.querySelectorAll(".filters button").forEach((btn) => {
  btn.onclick = () => {
    filter = btn.dataset.filter;
    document.querySelectorAll(".filters button").forEach((b) => b.classList.toggle("on", b === btn));
    if (window.NICHES) render(window.NICHES);
  };
});

window.addEventListener("hashchange", () => {
  if (window.NICHES) render(window.NICHES);
});

function rows() {
  try { return JSON.parse(localStorage.getItem(LOG) || "[]"); } catch { return []; }
}

function paintLog() {
  const list = rows();
  document.getElementById("log").innerHTML = list.map((r) => {
    const back = r.spend ? Math.round((r.buys * 149 / r.spend) * 100) : 0;
    const cls = back >= 100 ? "good" : "bad";
    return `<p class="row"><span>${r.day}</span><span class="${cls}">${back}% · ₹${r.buys * 149} / ₹${r.spend}</span></p>`;
  }).join("");
}

document.getElementById("save").onclick = () => {
  const spend = Number(document.getElementById("spend").value || 0);
  const visits = Number(document.getElementById("visits").value || 0);
  const buys = Number(document.getElementById("buys").value || 0);
  const day = new Date().toLocaleDateString("en-IN");
  const list = rows().filter((r) => r.day !== day);
  list.unshift({ day, spend, visits, buys });
  localStorage.setItem(LOG, JSON.stringify(list.slice(0, 30)));
  const back = spend ? Math.round((buys * 149 / spend) * 100) : 0;
  const line = back >= 100
    ? `${back}% back. Keep the budget, or raise it a little.`
    : `${back}% back. That is under 100%. Do not raise the budget.`;
  document.getElementById("result").innerHTML = `<p class="${back >= 100 ? "good" : "bad"}">${line}</p><p class="meta">${visits} visits, ${buys} purchases, ₹${buys * 149} in, ₹${spend} on ads.</p>`;
  paintLog();
};

fetch("./data/niches.json?v=10")
  .then((r) => r.json())
  .then((doc) => {
    window.NICHES = doc;
    render(doc);
  })
  .catch(() => {
    document.getElementById("list").innerHTML = "<p>Could not load the niche list.</p>";
  });
paintLog();
