/* =====================================================================
   Planning Paths — 2026 Contributions & Gifting Calculator
   Self-contained vanilla JS. No build step, no runtime dependencies.

   2026 figures: IRS Notice 2025-67, SECURE 2.0 Act, OBBBA (2025).
   Educational planning tool — not tax, legal, or investment advice.
   ===================================================================== */
(function () {
  "use strict";

  /* ---- 2026 contribution limits ---- */
  const L = {
    defer401k: 24500,
    catchup401k_50: 8000,      // age 50–59 and 64+
    catchup401k_60_63: 11250,  // SECURE 2.0 "super" catch-up
    total415: 72000,           // employee + employer + after-tax (catch-up is on top)
    ira: 7500,
    iraCatchup: 1100,          // age 50+
    simple: 17000,
    simpleCatchup: 4000,
    simpleSuper: 5250,
    hsaSelf: 4400,
    hsaFamily: 8750,
    hsaCatchup: 1000,          // age 55+
  };

  /* ---- 2026 gift & estate ---- */
  const G = {
    annualExclusion: 19000,
    nonCitizenSpouse: 194000,
    lifetimeExemption: 15000000, // OBBBA 2025 (per person)
    gstExemption: 15000000,
    topRate: 0.40,
  };

  /* ---- 2026 (estimated) federal brackets [lowerBound, rate] ---- */
  const BR = {
    single: [[0, .10], [12400, .12], [50400, .22], [105700, .24], [201775, .32], [256225, .35], [640600, .37]],
    mfj: [[0, .10], [24800, .12], [100800, .22], [211400, .24], [403550, .32], [512450, .35], [768700, .37]],
    hoh: [[0, .10], [17700, .12], [67450, .22], [105700, .24], [201775, .32], [256200, .35], [640600, .37]],
  };
  // MFS thresholds are half of MFJ
  BR.mfs = BR.mfj.map(([lo, r]) => [lo / 2, r]);
  const STD = { single: 16100, mfj: 32200, hoh: 24150, mfs: 16100 };

  const $ = (id) => document.getElementById(id);
  const num = (id) => parseFloat($(id).value) || 0;
  const fmt0 = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  const fmtPct = (r) => (r * 100).toFixed(1) + "%";

  /* embedding glue (mirrors the retirement calculator) */
  const EMBEDDED = window.self !== window.top;
  const PARAMS = new URLSearchParams(window.location.search);
  const HIDE_CHROME = PARAMS.get("embed") === "1" || PARAMS.get("chrome") === "0";
  function postHeight() {
    if (!EMBEDDED) return;
    const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    window.parent.postMessage({ type: "pp-calc-height", height: h }, "*");
  }

  /** Marginal rate at a given taxable income for a filing status. */
  function marginalRate(taxable, filing) {
    const b = BR[filing] || BR.single;
    let rate = b[0][1];
    for (let i = 0; i < b.length; i++) { if (taxable > b[i][0]) rate = b[i][1]; else break; }
    return rate;
  }

  const cu401k = (age, on) => (!on ? 0 : age >= 60 && age <= 63 ? L.catchup401k_60_63 : age >= 50 ? L.catchup401k_50 : 0);
  const cuIRA = (age, on) => (on && age >= 50 ? L.iraCatchup : 0);
  const cuHSA = (age, on) => (on && age >= 55 ? L.hsaCatchup : 0);

  function compute() {
    const filing = $("filing").value;
    const married = filing === "mfj" || filing === "mfs";
    const age = num("age");
    const magi = num("magi");
    const salary = num("salary");
    const useCU = $("incCatchUp").checked;
    const iraType = $("iraType").value;       // trad | roth
    const hsa = $("hsa").value;               // none | self | family

    const taxable = Math.max(0, magi - STD[filing]);
    const marginal = marginalRate(taxable, filing);

    // 401(k)
    const d401 = L.defer401k;
    const c401 = cu401k(age, useCU);
    const t401 = d401 + c401;
    // employer match: matchRate% of dollars contributed, up to matchCap% of salary
    const matchCap = num("matchCap") / 100;
    const matchRate = num("matchRate") / 100;
    let match = salary * matchCap * matchRate;
    match = Math.min(match, Math.max(0, L.total415 - d401)); // keep employee+employer within §415
    const benefit401 = t401 * marginal;

    // IRA (combined Traditional/Roth limit)
    const dIRA = L.ira;
    const cIRA = cuIRA(age, useCU);
    const tIRA = dIRA + cIRA;
    const iraDeductible = iraType === "trad";
    const benefitIRA = iraDeductible ? tIRA * marginal : 0;

    // HSA
    let dHSA = 0;
    if (hsa === "self") dHSA = L.hsaSelf; else if (hsa === "family") dHSA = L.hsaFamily;
    const cHSA = hsa === "none" ? 0 : cuHSA(age, useCU);
    const tHSA = dHSA + cHSA;
    const benefitHSA = tHSA * marginal;

    const rows = [
      { name: "401(k) / 403(b)", limit: d401, cu: c401, total: t401, match, benefit: benefit401, btext: null },
      { name: (iraDeductible ? "Traditional" : "Roth") + " IRA", limit: dIRA, cu: cIRA, total: tIRA, match: 0,
        benefit: benefitIRA, btext: iraDeductible ? null : "Tax-Free Growth" },
      { name: "HSA" + (hsa === "none" ? " (not eligible)" : ""), limit: dHSA, cu: cHSA, total: tHSA, match: 0,
        benefit: benefitHSA, btext: tHSA > 0 ? "Triple Tax Advantage" : null },
    ];
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    const totals = {
      limit: sum("limit"), cu: sum("cu"), total: sum("total"), match: sum("match"),
      benefit: sum("benefit") + sum("match"), // tax savings on contributions + free employer match
    };

    return { filing, married, age, magi, salary, taxable, marginal, rows, totals, iraDeductible };
  }

  function render() {
    const r = compute();

    // summary cards
    $("summaryCards").innerHTML = [
      { k: "Total tax-advantaged capacity", v: fmt0(r.totals.total), s: "incl. catch-up" },
      { k: "Employer match (free)", v: fmt0(r.totals.match), s: "401(k) match" },
      { k: "Est. current-year tax benefit", v: fmt0(r.totals.benefit), s: "savings + match" },
      { k: "Your marginal rate", v: fmtPct(r.marginal), s: r.filing.toUpperCase() + " · taxable " + fmt0(r.taxable) },
    ].map((c) => `<div class="stat"><div class="k">${c.k}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");

    // contribution table
    const head = `<thead><tr><th>Account</th><th>Base limit</th><th>Catch-up</th><th>Total capacity</th><th>Employer match</th><th>Tax benefit</th></tr></thead>`;
    const body = r.rows.map((row) =>
      `<tr><td>${row.name}</td><td>${fmt0(row.limit)}</td><td>${fmt0(row.cu)}</td><td>${fmt0(row.total)}</td><td>${fmt0(row.match)}</td><td>${row.btext ? `<span class="green">${row.btext}</span>` : fmt0(row.benefit)}</td></tr>`
    ).join("");
    const totalRow = `<tr class="total"><td>TOTAL</td><td>${fmt0(r.totals.limit)}</td><td>${fmt0(r.totals.cu)}</td><td>${fmt0(r.totals.total)}</td><td>${fmt0(r.totals.match)}</td><td>${fmt0(r.totals.benefit)}</td></tr>`;
    $("contribTable").innerHTML = head + "<tbody>" + body + totalRow + "</tbody>";

    $("contribNote").innerHTML =
      `<div class="note" style="margin-top:12px;">Catch-up at age ${r.age}: ${cu401k(r.age, true) === L.catchup401k_60_63 ? "<strong>super catch-up</strong> (60–63)" : r.age >= 50 ? "standard 50+ catch-up" : "none (under 50)"}. ` +
      `Tax benefit = pre-tax contributions × your ${fmtPct(r.marginal)} marginal rate, plus the employer match. ` +
      (r.iraDeductible ? "Traditional IRA deductibility phases out at higher MAGI when you're covered by a workplace plan — confirm eligibility. " : "Roth IRA has income limits and grows tax-free. ") +
      `The §415 limit caps employee + employer 401(k) at ${fmt0(L.total415)} (catch-up is on top).</div>`;

    // gift & estate table
    const per = G.annualExclusion;
    const perSplit = r.married ? per * 2 : per;
    const recipients = num("recipients");
    const annualCapacity = perSplit * recipients;
    const exemption = r.married ? G.lifetimeExemption * 2 : G.lifetimeExemption;
    const used = num("lifetimeUsed");
    const remaining = Math.max(0, exemption - used);
    const gHead = `<thead><tr><th>Provision</th><th>Per person</th><th>${r.married ? "Married (split)" : "—"}</th><th>Annual total</th><th>Remaining</th></tr></thead>`;
    const gBody = [
      `<tr><td>Annual gift exclusion / recipient</td><td>${fmt0(per)}</td><td>${r.married ? fmt0(perSplit) : "—"}</td><td>—</td><td>—</td></tr>`,
      `<tr><td>${recipients} recipient${recipients === 1 ? "" : "s"} — annual gift capacity</td><td>—</td><td>—</td><td><strong>${fmt0(annualCapacity)}</strong></td><td>—</td></tr>`,
      `<tr><td>Lifetime estate &amp; gift exemption</td><td>${fmt0(G.lifetimeExemption)}</td><td>${r.married ? fmt0(exemption) : "—"}</td><td>used ${fmt0(used)}</td><td><strong>${fmt0(remaining)}</strong></td></tr>`,
      `<tr><td>GST exemption</td><td>${fmt0(G.gstExemption)}</td><td>${r.married ? fmt0(G.gstExemption * 2) : "—"}</td><td>—</td><td>—</td></tr>`,
      `<tr><td>Non-citizen spouse annual limit</td><td>${fmt0(G.nonCitizenSpouse)}</td><td>—</td><td>—</td><td>—</td></tr>`,
      `<tr><td>Direct tuition / medical payments</td><td colspan="4"><span class="green">Unlimited — paid directly to the institution, excluded from gift limits</span></td></tr>`,
    ].join("");
    $("giftTable").innerHTML = gHead + "<tbody>" + gBody + "</tbody>";
    $("giftNote").innerHTML = `<div class="note" style="margin-top:12px;">You can gift up to <strong>${fmt0(annualCapacity)}</strong> across ${recipients} recipient${recipients === 1 ? "" : "s"} this year with no gift-tax return or lifetime-exemption use${r.married ? " (gift-splitting with your spouse)" : ""}. Gifts above the annual exclusion draw down your <strong>${fmt0(remaining)}</strong> remaining lifetime exemption; amounts over that are taxed up to ${fmtPct(G.topRate)}.</div>`;

    // reference limits table
    const ref = [
      ["401(k) / 403(b) / 457 deferral", L.defer401k, "Employee elective deferral"],
      ["401(k) catch-up (50–59, 64+)", L.catchup401k_50, "SECURE 2.0"],
      ["401(k) super catch-up (60–63)", L.catchup401k_60_63, "SECURE 2.0 enhanced"],
      ["401(k) + employer total (§415)", L.total415, "All sources, catch-up on top"],
      ["Traditional / Roth IRA", L.ira, "Combined limit"],
      ["IRA catch-up (50+)", L.iraCatchup, "Indexed for 2026"],
      ["SIMPLE IRA deferral", L.simple, "Employee contribution"],
      ["SIMPLE catch-up (50–59, 64+)", L.simpleCatchup, "Standard catch-up"],
      ["SIMPLE super catch-up (60–63)", L.simpleSuper, "SECURE 2.0 enhanced"],
      ["HSA (self-only)", L.hsaSelf, "If HDHP-enrolled"],
      ["HSA (family)", L.hsaFamily, "If HDHP-enrolled"],
      ["HSA catch-up (55+)", L.hsaCatchup, "Additional"],
    ];
    $("limitsTable").innerHTML = `<thead><tr><th>Account / provision</th><th>2026 limit</th><th>Notes</th></tr></thead><tbody>` +
      ref.map((x) => `<tr><td>${x[0]}</td><td>${fmt0(x[1])}</td><td style="text-align:left;color:var(--pp-muted)">${x[2]}</td></tr>`).join("") + `</tbody>`;

    $("disclaimer").innerHTML = `<strong>Sources &amp; notes.</strong> 2026 figures from IRS Notice 2025-67, the SECURE 2.0 Act, and OBBBA (2025). Marginal rate is computed from MAGI less the standard deduction using 2026 estimated brackets; MFS uses half of the MFJ thresholds and is approximate. Tax benefit assumes pre-tax (deductible) contributions and does not model IRA-deduction or Roth income phase-outs, state tax, or the saver's credit. This is an educational planning tool, not tax, legal, or investment advice.`;

    postHeight();
  }

  function init() {
    if (HIDE_CHROME) document.body.classList.add("embed");
    $("runBtn").addEventListener("click", render);
    $("resetBtn").addEventListener("click", () => location.reload());
    render();
    if (EMBEDDED) {
      window.addEventListener("resize", postHeight);
      window.addEventListener("load", postHeight);
      if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
      setTimeout(postHeight, 300);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
