const KEY = "abhichal-paid";
const LOG = "abhichal-hisab";
const paid = () => localStorage.getItem(KEY) === "1";

function views(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function card(t) {
  const open = t.free || paid();
  const head = `<span class="tag">${esc(t.rank)}</span> <span class="tag dim">${views(t.signal_views)} views</span>`;
  const body = `<h2>${esc(t.title)}</h2>
    <p class="meta">Top public result: ${esc(t.signal_title)}</p>
    <p>${esc(t.what)}</p>
    <p class="meta">${esc(t.lasts)}</p>`;
  if (!open) {
    return `<article class="locked">${head}${body}<p>Recipe is in the ₹149 pack.</p></article>`;
  }
  return `<article class="card">${head}${body}
    <p><b>How to make it</b></p>
    <ol>${t.make.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <p><b>Tools.</b> ${esc(t.tools)}</p>
    <p class="meta">Skip: ${esc(t.avoid)}</p>
  </article>`;
}

function render(doc) {
  document.getElementById("updated").textContent = doc.updated;
  document.getElementById("source").textContent = doc.source;
  document.getElementById("list").innerHTML = doc.formats.map(card).join("");
  const emerging = doc.emerging || [];
  document.getElementById("emerging").innerHTML = emerging.length
    ? emerging.map((row) => `<article class="locked"><span class="tag dim">${views(row.views)} views · ${row.videos} videos</span><h2>${esc(row.phrase)}</h2><p class="meta">${row.examples.map(esc).join("<br>")}</p></article>`).join("")
    : "<p class=\"meta\">Nothing new repeated enough in this scan.</p>";
  const buy = document.getElementById("buy");
  if (paid()) buy.textContent = "Pack is open";
}

function unlock() {
  localStorage.setItem(KEY, "1");
  if (window.FORMATS) render(window.FORMATS);
}

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

fetch("./data/formats.json?v=5")
  .then((r) => r.json())
  .then((doc) => {
    window.FORMATS = doc;
    render(doc);
  })
  .catch(() => {
    document.getElementById("list").innerHTML = "<p>Could not load the format list.</p>";
  });
paintLog();
