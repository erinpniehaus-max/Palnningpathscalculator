/* =====================================================================
   Planning Paths — Long-Term Care Cost & Funding Calculator
   Self-contained vanilla JS. No build step, no runtime dependencies.

   Default monthly costs are 2024 Genworth national MEDIAN figures.
   This is an educational planning tool, not financial or insurance advice.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- 2024 Genworth national median MONTHLY costs ---------- */
  const SETTINGS = [
    { key: "homemaker", label: "In-home — Homemaker services", cost: 6292 },
    { key: "homeaide", label: "In-home — Home health aide", cost: 6483 },
    { key: "adultday", label: "Adult day health care", cost: 2167 },
    { key: "assisted", label: "Assisted living facility", cost: 5900 },
    { key: "nh-semi", label: "Nursing home — semi-private room", cost: 8929 },
    { key: "nh-private", label: "Nursing home — private room", cost: 10025 },
  ];
  const DEFAULT_SETTING = "assisted";

  /* ----------------------------- helpers ----------------------------- */
  const $ = (id) => document.getElementById(id);
  const num = (id) => parseFloat($(id).value) || 0;
  const pct = (id) => (parseFloat($(id).value) || 0) / 100;
  const fmt0 = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

  /* ------------------------- core projection ------------------------- */
  function project(input) {
    const years = Math.max(1, Math.round(input.duration));
    const yearsToStart = Math.max(0, input.careStartAge - input.currentAge);
    const ci = input.costInflation;            // cost inflation (decimal)
    const ii = input.insInflation;             // insurance inflation protection (decimal)
    const ret = input.returnRate;              // discount rate (decimal)

    // Monthly cost inflated from today to care-start.
    const monthlyAtStart = input.monthlyCost * Math.pow(1 + ci, yearsToStart);

    // Insurance monthly benefit inflated (inflation protection) from today to care-start.
    const insMonthlyAtStart = input.insBenefit * Math.pow(1 + ii, yearsToStart);

    // Total insurance pool (nominal, in care-start dollars). Lifetime = uncapped.
    // Pool sized off the at-start (inflation-protected) monthly benefit.
    let poolRemaining = input.insLifetime
      ? Infinity
      : insMonthlyAtStart * 12 * Math.max(1, Math.round(input.insYears));

    const elimFrac = Math.min(1, Math.max(0, input.insElimDays / 365)); // fraction of first year self-paid

    const rows = [];
    let totalCost = 0, totalIns = 0, totalOOP = 0, lumpSum = 0;

    for (let y = 0; y < years; y++) {
      const age = input.careStartAge + y;

      const monthlyCostY = monthlyAtStart * Math.pow(1 + ci, y);
      const annualCostY = monthlyCostY * 12;

      // Insurance benefit available this year (inflation-protected each year).
      const insMonthlyY = insMonthlyAtStart * Math.pow(1 + ii, y);
      let annualBenefitY = insMonthlyY * 12;

      // First care year: elimination period — you self-pay elimFrac of the year,
      // insurance only covers the remaining fraction.
      let coveredFrac = 1;
      if (y === 0 && elimFrac > 0) {
        coveredFrac = 1 - elimFrac;
        annualBenefitY *= coveredFrac;
      }

      // Insurance pays the lesser of (benefit available for the covered portion)
      // and (cost for the covered portion), and is capped by the remaining pool.
      const costCovered = annualCostY * coveredFrac;
      let insPaid = Math.min(annualBenefitY, costCovered);
      if (poolRemaining !== Infinity) {
        insPaid = Math.min(insPaid, poolRemaining);
        poolRemaining -= insPaid;
        if (poolRemaining < 0) poolRemaining = 0;
      }
      if (insPaid < 0) insPaid = 0;

      const oopY = annualCostY - insPaid;

      // Present value of this year's out-of-pocket discounted back to today.
      const yearsFromNow = yearsToStart + y;
      const pvY = oopY / Math.pow(1 + ret, yearsFromNow);

      totalCost += annualCostY;
      totalIns += insPaid;
      totalOOP += oopY;
      lumpSum += pvY;

      rows.push({
        careYear: y + 1,
        age,
        annualCost: annualCostY,
        insPaid,
        oop: oopY,
        pv: pvY,
      });
    }

    return {
      rows, years, yearsToStart,
      monthlyAtStart, insMonthlyAtStart,
      totalCost, totalIns, totalOOP, lumpSum,
      poolLifetime: input.insLifetime,
    };
  }

  /* --------------------------- embedding glue --------------------------
     Lets the calculator live inside a GoHighLevel / Lovable dashboard as an
     <iframe>: it reports its height to the parent for auto-resize, and a
     `?embed=1` URL param hides the duplicate top header bar. */
  const EMBEDDED = window.self !== window.top;
  const PARAMS = new URLSearchParams(window.location.search);
  const HIDE_CHROME = PARAMS.get("embed") === "1" || PARAMS.get("chrome") === "0";

  function postHeight() {
    if (!EMBEDDED) return;
    const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    window.parent.postMessage({ type: "pp-calc-height", height: h }, "*");
  }

  /* ----------------------------- rendering ----------------------------- */
  let LAST = null;

  function renderSummary(res, input) {
    const cards = [
      { k: "Total projected care cost", v: fmt0(res.totalCost), s: res.years + "-yr need, future dollars" },
      { k: "Total insurance coverage", v: fmt0(res.totalIns), s: input.insBenefit > 0 ? (res.poolLifetime ? "lifetime benefit pool" : "from your policy") : "no policy entered" },
      { k: "Total out-of-pocket gap", v: fmt0(res.totalOOP), s: "what you'd pay yourself", red: res.totalOOP > 0 },
      { k: "Lump sum needed today", v: fmt0(res.lumpSum), s: "PV of gap @ " + (input.returnRate * 100).toFixed(1) + "% return" },
    ];
    $("summaryCards").innerHTML = cards
      .map((c) => `<div class="stat"><div class="k">${c.k}</div><div class="v"${c.red ? ' style="color:var(--pp-red)"' : ""}>${c.v}</div><div class="s">${c.s}</div></div>`)
      .join("");

    $("assumeNote").innerHTML =
      "Key assumptions: roughly <strong>70% of people turning 65</strong> will need some type of long-term care, and the <strong>average need is about 3 years</strong>. " +
      "Care costs are inflated at <strong>" + (input.costInflation * 100).toFixed(1) + "%</strong> per year (LTC tends to inflate faster than CPI). " +
      "Monthly cost today: <strong>" + fmt0(input.monthlyCost) + "</strong>; projected to <strong>" + fmt0(res.monthlyAtStart) + "/mo</strong> when care begins at age " + input.careStartAge + ".";
  }

  function renderProjTable(res) {
    const cols = [
      ["Care year", (r) => r.careYear],
      ["Age", (r) => r.age],
      ["Annual cost", (r) => fmt0(r.annualCost)],
      ["Insurance pays", (r) => fmt0(r.insPaid)],
      ["Out-of-pocket", (r) => fmt0(r.oop)],
    ];
    const head = "<thead><tr>" + cols.map((c) => `<th>${c[0]}</th>`).join("") + "</tr></thead>";
    const body = "<tbody>" + res.rows.map((r) =>
      "<tr>" + cols.map((c) => `<td>${c[1](r)}</td>`).join("") + "</tr>"
    ).join("") + "</tbody>";
    $("projTable").innerHTML = head + body;
  }

  function renderCharts(res) {
    const W = 560, H = 240, pad = 44;
    const rows = res.rows;
    const n = rows.length;
    const maxV = Math.max(...rows.map((r) => r.annualCost), 1);

    const plotW = W - pad - 10;
    const groupW = plotW / n;
    const barW = Math.max(3, groupW / 2 - 3);
    const yOf = (v) => H - pad - (v / maxV) * (H - pad - 12);

    let bars = "";
    rows.forEach((r, i) => {
      const gx = pad + i * groupW + (groupW - (barW * 2 + 4)) / 2;
      const costH = (r.annualCost / maxV) * (H - pad - 12);
      const oopH = (r.oop / maxV) * (H - pad - 12);
      bars += `<rect x="${gx.toFixed(1)}" y="${(H - pad - costH).toFixed(1)}" width="${barW.toFixed(1)}" height="${costH.toFixed(1)}" fill="#4fae8b"/>`;
      bars += `<rect x="${(gx + barW + 4).toFixed(1)}" y="${(H - pad - oopH).toFixed(1)}" width="${barW.toFixed(1)}" height="${oopH.toFixed(1)}" fill="#0c3b36"/>`;
    });

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = maxV * f; const y = yOf(v);
      return `<line class="axis" x1="${pad}" y1="${y.toFixed(1)}" x2="${W - 8}" y2="${y.toFixed(1)}"/><text x="2" y="${(y + 3).toFixed(1)}">${fmt0(v)}</text>`;
    }).join("");

    const xLabels = rows.map((r, i) => {
      const cx = pad + i * groupW + groupW / 2;
      return `<text x="${(cx - 14).toFixed(1)}" y="${H - pad + 14}">Yr ${r.careYear} (${r.age})</text>`;
    }).join("");

    $("charts").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
        ${yTicks}${bars}${xLabels}
      </svg>
      <div class="legend">
        <span style="--c:#4fae8b"><i style="background:#4fae8b"></i>Annual care cost</span>
        <span style="--c:#0c3b36"><i style="background:#0c3b36"></i>Out-of-pocket</span>
      </div>`;
  }

  function renderDisclaimer(input) {
    $("disclaimer").innerHTML = `
      <strong>Assumptions &amp; limitations.</strong> Default monthly costs are
      <em>2024 Genworth national median</em> figures and vary widely by region, provider and level of
      care &mdash; treat them as estimates, not quotes. All projected figures are shown in future
      (nominal) dollars at the year care is received, except the &ldquo;lump sum needed today,&rdquo;
      which is the present value of your out-of-pocket stream discounted at your assumed investment
      return (${(input.returnRate * 100).toFixed(1)}%). Insurance modeling is simplified: the benefit
      pool, inflation protection (${(input.insInflation * 100).toFixed(0)}% compound) and a
      ${input.insElimDays}-day elimination period are applied as approximations and do not capture every
      policy rider, waiver or limitation. This tool is for educational planning only and is not
      financial, insurance, tax, or legal advice. Consult a qualified professional before acting.`;
  }

  function renderAll() {
    if (!LAST) return;
    renderSummary(LAST.res, LAST.input);
    renderCharts(LAST.res);
    renderProjTable(LAST.res);
    postHeight();
  }

  /* ------------------------------ wiring ------------------------------ */
  function readInputs() {
    return {
      currentAge: num("currentAge"),
      careStartAge: num("careStartAge"),
      duration: num("duration"),
      monthlyCost: num("monthlyCost"),
      costInflation: pct("costInflation"),
      returnRate: pct("returnRate"),
      insBenefit: num("insBenefit"),
      insYears: num("insYears"),
      insLifetime: $("insLifetime").checked,
      insInflation: (parseFloat($("insInflation").value) || 0) / 100,
      insElimDays: num("insElim"),
    };
  }

  function run() {
    const input = readInputs();
    if (input.careStartAge < input.currentAge) {
      alert("Age care begins must be on or after current age.");
      return;
    }
    const res = project(input);
    LAST = { res, input };
    renderDisclaimer(input);
    renderAll();
    if (!EMBEDDED) {
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function initSettings() {
    const sel = $("setting");
    sel.innerHTML = SETTINGS
      .map((s) => `<option value="${s.key}">${s.label} — ${fmt0(s.cost)}/mo</option>`)
      .join("");
    sel.value = DEFAULT_SETTING;
  }

  function init() {
    if (HIDE_CHROME) document.body.classList.add("embed");
    initSettings();

    $("runBtn").addEventListener("click", run);
    $("resetBtn").addEventListener("click", () => location.reload());

    // Selecting a care setting fills the editable monthly-cost field.
    $("setting").addEventListener("change", () => {
      const s = SETTINGS.find((x) => x.key === $("setting").value);
      if (s) $("monthlyCost").value = s.cost;
      run();
    });

    run(); // run once with defaults

    // Keep the iframe sized to its content as the layout reflows.
    if (EMBEDDED) {
      window.addEventListener("resize", postHeight);
      window.addEventListener("load", postHeight);
      if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
      document.querySelectorAll("details.sec").forEach((d) => d.addEventListener("toggle", postHeight));
      setTimeout(postHeight, 300);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
