const KEY = "abhichal-paid";
const LOG = "abhichal-hisab";
const paid = () => localStorage.getItem(KEY) === "1";

function card(t) {
  const open = t.free || paid();
  if (!open) {
    return `<article class="locked"><span class="tag dim">₹149</span><h2>${t.title}</h2><p class="meta">${t.where} · ${t.since} · ${t.heat}</p><p>Shoot list lock hai.</p></article>`;
  }
  return `<article class="card">
    <span class="tag">${t.free ? "Free" : "Pack"}</span>
    <h2>${t.title}</h2>
    <p class="meta">${t.where} · shuru ${t.since} · ${t.heat} · ${t.seconds}</p>
    <p><b>Hook.</b> ${t.hook}</p>
    <p><b>Sound.</b> ${t.sound}</p>
    <b>Shoot</b>
    <ol>${t.shots.map((s) => `<li>${s}</li>`).join("")}</ol>
    <b>Edit</b>
    <ol>${t.edit.map((s) => `<li>${s}</li>`).join("")}</ol>
    <p><b>End.</b> ${t.end}</p>
    <p><b>Caption.</b> ${t.caption}</p>
    <p class="meta">Mat karo: ${t.avoid}</p>
  </article>`;
}

function render() {
  document.getElementById("list").innerHTML = window.TRENDS.map(card).join("");
  document.getElementById("audio-list").innerHTML = window.AUDIO.map(
    (a) => `<article class="audio"><b>${a.name}</b><div class="meta">${a.note}</div></article>`
  ).join("");
  const buy = document.getElementById("buy");
  if (paid()) buy.textContent = "Pack khul chuka hai";
}

function unlock() {
  localStorage.setItem(KEY, "1");
  render();
}

document.getElementById("buy").onclick = async () => {
  if (paid()) return;
  const cfg = window.ABHICHAL || {};
  if (!cfg.razorpayKey) {
    alert("Razorpay key abhi khali hai. Key daalne ke baad yahi button payment kholega.");
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
    name: "AbhiChal",
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
    ? `${back}% wapas aaya. Kal budget same ya thoda upar.`
    : `${back}% wapas aaya. 100% se neeche hai, budget mat badhana.`;
  document.getElementById("result").innerHTML = `<p class="${back >= 100 ? "good" : "bad"}">${line}</p><p class="meta">${visits} visits, ${buys} kharid, ₹${buys * 149} kamai, ₹${spend} ads.</p>`;
  paintLog();
};

render();
paintLog();
