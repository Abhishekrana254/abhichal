const KEY = "abhichal-paid";
const LOG = "abhichal-hisab";
const paid = () => localStorage.getItem(KEY) === "1";

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

function card(n, base) {
  const pills = [
    n.yt ? '<span class="pill yt">YouTube</span>' : "",
    n.ig ? '<span class="pill ig">Instagram</span>' : ""
  ].join("");
  const yt = n.rpm
    ? `${money(base / 1000 * n.rpm[0])}–${money(base / 1000 * n.rpm[1])}`
    : "No RPM band";
  const ig = n.ig ? "Reach, not a rate" : "Weak fit";
  const link = n.example
    ? `<a class="ex" href="${esc(n.example.url)}">${esc(n.example.title)} · ${views(n.example.views)} views</a>`
    : "";
  const reel = n.reel ? `<div class="reel">Reel says ${esc(n.reel)}</div>` : "";
  return `<article class="niche">${pills}<h2>${esc(n.name)}</h2><p class="about">${esc(n.about)}</p>${link}${reel}<div class="money"><div><span>YouTube / 500k views</span><strong>${yt}</strong></div><div><span>Instagram</span><strong>${ig}</strong></div></div></article>`;
}

function render(doc) {
  const base = doc.assumptionViews;
  document.getElementById("source").textContent = doc.source;
  const items = doc.niches.filter((n) => filter === "all" || (filter === "youtube" ? n.yt : n.ig));
  document.getElementById("list").innerHTML = items.map((n) => card(n, base)).join("");
}

function unlock() {
  localStorage.setItem(KEY, "1");
  if (window.NICHES) render(window.NICHES);
}

document.querySelectorAll(".filters button").forEach((btn) => {
  btn.onclick = () => {
    filter = btn.dataset.filter;
    document.querySelectorAll(".filters button").forEach((b) => b.classList.toggle("on", b === btn));
    if (window.NICHES) render(window.NICHES);
  };
});

document.getElementById("buy").onclick = async () => {
  if (paid()) return;
  const cfg = window.ABHICHAL || {};
  if (!cfg.razorpayKey) {
    alert("Payment key is missing.");
    return;
  }
  if (!window.Razorpay) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const rzp = new Razorpay({
    key: cfg.razorpayKey,
    amount: cfg.amountPaise,
    currency: "INR",
    name: "Formatly",
    description: cfg.packName,
    handler() { unlock(); }
  });
  rzp.open();
};

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

fetch("./data/niches.json?v=8")
  .then((r) => r.json())
  .then((doc) => {
    window.NICHES = doc;
    render(doc);
  })
  .catch(() => {
    document.getElementById("list").innerHTML = "<p>Could not load the niche list.</p>";
  });
paintLog();
