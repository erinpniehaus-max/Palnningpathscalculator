/* =====================================================================
   Planning Paths — Retirement, RMD & Tax-Bracket Planning Calculator
   Self-contained vanilla JS. No build step, no runtime dependencies.

   All tax figures are 2026 estimates and are inflation-indexed forward
   for the federal system. State rates are simplified (see STATES note).
   This is an educational planning tool, not tax advice.
   ===================================================================== */
(function () {
  "use strict";

  const BASE_YEAR = 2026;

  /* ---------- 2026 (estimated) federal ordinary-income brackets ----------
     Stored as [lowerBound, rate]. Thresholds are indexed for inflation
     each projection year. Figures reflect post-OBBBA TCJA rate structure. */
  const FED_BRACKETS = {
    single: [
      [0, 0.10], [12400, 0.12], [50400, 0.22], [105700, 0.24],
      [201775, 0.32], [256225, 0.35], [640600, 0.37],
    ],
    mfj: [
      [0, 0.10], [24800, 0.12], [100800, 0.22], [211400, 0.24],
      [403550, 0.32], [512450, 0.35], [768700, 0.37],
    ],
  };

  /* 2026 (estimated) standard deduction + age-65 add-ons */
  const STD_DEDUCTION = { single: 16100, mfj: 32200 };
  const ADDL_65 = { single: 2050, mfj: 1650 }; // per qualifying person (mfj = per spouse 65+)
  // OBBBA "senior bonus" deduction: $6,000 per person 65+, phases out 6%
  // above MAGI $75k (single) / $150k (mfj). Available 2025–2028.
  const SENIOR_BONUS = { amount: 6000, phaseStart: { single: 75000, mfj: 150000 }, phaseRate: 0.06, lastYear: 2028 };

  /* Qualified Charitable Distribution annual limit (2026 estimate, indexed).
     QCDs are available at 70½+, count toward the RMD, and are excluded from
     taxable income (so they lower AGI/MAGI, your bracket AND your IRMAA tier). */
  const QCD_LIMIT_2026 = 111000;
  const QCD_AGE = 70;       // 70½, approximated to 70 for annual modeling
  const MEDICARE_AGE = 65;  // IRMAA / Medicare premiums begin

  /* Medicare IRMAA (2026 estimate). Part B base premium is monthly; surcharges
     are driven by MAGI (AGI + tax-exempt interest). IRMAA actually uses MAGI
     from 2 years prior — we apply the same year as a planning simplification.
     tier = [singleMin, mfjMin, partB_multiplier, partD_surcharge_monthly].
     Part B total = base * multiplier; the *surcharge* is base*(multiplier-1). */
  const IRMAA = {
    partBBase: 206.5,
    tiers: [
      [0, 0, 1.0, 0],
      [109000, 218000, 1.4, 14.5],
      [137000, 274000, 2.0, 37.5],
      [171000, 342000, 2.6, 60.4],
      [205000, 410000, 3.2, 83.3],
      [500000, 750000, 3.4, 90.9],
    ],
  };

  /* Social Security taxation thresholds — NOT inflation indexed by law */
  const SS_THRESHOLDS = {
    single: { base: 25000, second: 34000, cap: 4500 },
    mfj: { base: 32000, second: 44000, cap: 6000 },
  };

  /* IRS Uniform Lifetime Table (2022+) — divisor by age */
  const ULT = {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
    79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0,
    86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8,
    93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
    100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3,
    107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
    114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
  };

  /* State income tax — simplified to a representative MARGINAL rate.
     type: none|flat|graduated. rate = flat rate or top marginal rate (%).
     taxesSS = state still taxes Social Security to some degree (2025/26).
     For graduated states the rate is the TOP marginal rate; the engine
     applies it as an approximation and clearly flags it. Users can
     override with an exact rate in the inputs. */
  const STATES = {
    AL: { n: "Alabama", t: "graduated", r: 5.0, ss: false },
    AK: { n: "Alaska", t: "none", r: 0, ss: false },
    AZ: { n: "Arizona", t: "flat", r: 2.5, ss: false },
    AR: { n: "Arkansas", t: "graduated", r: 3.9, ss: false },
    CA: { n: "California", t: "graduated", r: 13.3, ss: false },
    CO: { n: "Colorado", t: "flat", r: 4.4, ss: false },
    CT: { n: "Connecticut", t: "graduated", r: 6.99, ss: true },
    DE: { n: "Delaware", t: "graduated", r: 6.6, ss: false },
    DC: { n: "District of Columbia", t: "graduated", r: 10.75, ss: false },
    FL: { n: "Florida", t: "none", r: 0, ss: false },
    GA: { n: "Georgia", t: "flat", r: 5.39, ss: false },
    HI: { n: "Hawaii", t: "graduated", r: 11.0, ss: false },
    ID: { n: "Idaho", t: "flat", r: 5.695, ss: false },
    IL: { n: "Illinois", t: "flat", r: 4.95, ss: false, retExempt: true },
    IN: { n: "Indiana", t: "flat", r: 3.0, ss: false },
    IA: { n: "Iowa", t: "flat", r: 3.8, ss: false, retExempt: true },
    KS: { n: "Kansas", t: "graduated", r: 5.58, ss: false },
    KY: { n: "Kentucky", t: "flat", r: 4.0, ss: false },
    LA: { n: "Louisiana", t: "flat", r: 3.0, ss: false },
    ME: { n: "Maine", t: "graduated", r: 7.15, ss: false },
    MD: { n: "Maryland", t: "graduated", r: 5.75, ss: false },
    MA: { n: "Massachusetts", t: "flat", r: 5.0, ss: false },
    MI: { n: "Michigan", t: "flat", r: 4.25, ss: false },
    MN: { n: "Minnesota", t: "graduated", r: 9.85, ss: true },
    MS: { n: "Mississippi", t: "flat", r: 4.7, ss: false, retExempt: true },
    MO: { n: "Missouri", t: "graduated", r: 4.7, ss: false },
    MT: { n: "Montana", t: "graduated", r: 5.9, ss: true },
    NE: { n: "Nebraska", t: "graduated", r: 5.2, ss: false },
    NV: { n: "Nevada", t: "none", r: 0, ss: false },
    NH: { n: "New Hampshire", t: "none", r: 0, ss: false },
    NJ: { n: "New Jersey", t: "graduated", r: 10.75, ss: false },
    NM: { n: "New Mexico", t: "graduated", r: 5.9, ss: true },
    NY: { n: "New York", t: "graduated", r: 10.9, ss: false },
    NC: { n: "North Carolina", t: "flat", r: 4.25, ss: false },
    ND: { n: "North Dakota", t: "graduated", r: 2.5, ss: false },
    OH: { n: "Ohio", t: "graduated", r: 3.5, ss: false },
    OK: { n: "Oklahoma", t: "graduated", r: 4.75, ss: false },
    OR: { n: "Oregon", t: "graduated", r: 9.9, ss: false },
    PA: { n: "Pennsylvania", t: "flat", r: 3.07, ss: false, retExempt: true },
    RI: { n: "Rhode Island", t: "graduated", r: 5.99, ss: true },
    SC: { n: "South Carolina", t: "graduated", r: 6.2, ss: false },
    SD: { n: "South Dakota", t: "none", r: 0, ss: false },
    TN: { n: "Tennessee", t: "none", r: 0, ss: false },
    TX: { n: "Texas", t: "none", r: 0, ss: false },
    UT: { n: "Utah", t: "flat", r: 4.55, ss: true },
    VT: { n: "Vermont", t: "graduated", r: 8.75, ss: true },
    VA: { n: "Virginia", t: "graduated", r: 5.75, ss: false },
    WA: { n: "Washington", t: "none", r: 0, ss: false },
    WV: { n: "West Virginia", t: "graduated", r: 5.12, ss: false },
    WI: { n: "Wisconsin", t: "graduated", r: 7.65, ss: false },
    WY: { n: "Wyoming", t: "none", r: 0, ss: false },
  };

  /* ----------------------------- helpers ----------------------------- */
  const $ = (id) => document.getElementById(id);
  const num = (id) => parseFloat($(id).value) || 0;
  const pct = (id) => (parseFloat($(id).value) || 0) / 100;
  const fmt0 = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  const fmtPct = (r) => (r * 100).toFixed(1) + "%";

  /** Inflate a base-year bracket/threshold to projection year. */
  const indexAmt = (amt, yearsFromBase, inflation) => amt * Math.pow(1 + inflation, yearsFromBase);

  /** Compute tax owed and marginal rate for taxable income against a
      set of [lowerBound, rate] brackets (already inflation-indexed). */
  function bracketTax(taxable, brackets) {
    if (taxable <= 0) return { tax: 0, marginal: brackets[0][1] };
    let tax = 0, marginal = brackets[0][1];
    for (let i = 0; i < brackets.length; i++) {
      const lo = brackets[i][0];
      const rate = brackets[i][1];
      const hi = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
      if (taxable > lo) {
        tax += (Math.min(taxable, hi) - lo) * rate;
        marginal = rate;
      } else break;
    }
    return { tax, marginal };
  }

  /** Taxable portion of Social Security via the IRS provisional-income test. */
  function taxableSocialSecurity(ssBenefit, otherIncome, filing) {
    if (ssBenefit <= 0) return 0;
    const t = SS_THRESHOLDS[filing];
    const provisional = otherIncome + 0.5 * ssBenefit;
    if (provisional <= t.base) return 0;
    if (provisional <= t.second) {
      return Math.min(0.5 * ssBenefit, 0.5 * (provisional - t.base));
    }
    const lower = Math.min(0.5 * ssBenefit, 0.5 * (t.second - t.base));
    return Math.min(0.85 * ssBenefit, 0.85 * (provisional - t.second) + Math.min(lower, t.cap));
  }

  /** RMD divisor for an age (clamped to table). */
  const rmdDivisor = (age) => (age >= 120 ? ULT[120] : ULT[age]);

  /** RMD start age per SECURE 2.0, from birth year. */
  const rmdStartAge = (birthYear) => (birthYear >= 1960 ? 75 : 73);

  /** Medicare IRMAA for a given MAGI. Returns the annual *surcharge* (the cost
      above the base Part B/D premium), total annual premium, and tier index. */
  function computeIRMAA(magi, filing, persons, yearsFromNow, infl) {
    const col = filing === "mfj" ? 1 : 0;
    let tierIdx = 0;
    for (let i = IRMAA.tiers.length - 1; i >= 1; i--) {
      if (magi > indexAmt(IRMAA.tiers[i][col], yearsFromNow, infl)) { tierIdx = i; break; }
    }
    const t = IRMAA.tiers[tierIdx];
    const base = indexAmt(IRMAA.partBBase, yearsFromNow, infl);
    const partBMonthly = base * t[2];
    const partDSurchargeMonthly = indexAmt(t[3], yearsFromNow, infl);
    const surchargeMonthly = base * (t[2] - 1) + partDSurchargeMonthly;
    return {
      tierIdx,
      surchargeAnnual: surchargeMonthly * 12 * persons,
      totalPremiumAnnual: (partBMonthly + partDSurchargeMonthly) * 12 * persons,
      persons,
    };
  }

  /* ------------------------- core projection ------------------------- */
  function project(input) {
    const rows = [];
    const infl = input.inflation;
    const birthYear = BASE_YEAR - input.currentAge;
    const startRMD = rmdStartAge(birthYear);
    const filing = input.filing;
    const spouseCount65 = filing === "mfj" ? 2 : 1;

    // running nominal balances
    let td = input.tdBal, roth = input.rothBal, taxable = input.taxBal;
    let re = input.reVal, other = input.otherVal;
    let depleted = false, depletedAge = null;

    for (let age = input.currentAge; age <= input.endAge; age++) {
      const yearsFromNow = age - input.currentAge;
      const calYear = BASE_YEAR + yearsFromNow;
      const inflFactor = Math.pow(1 + infl, yearsFromNow);

      // --- guaranteed / external income (nominal) ---
      const ss1 = age >= input.ssAge ? input.ssAnnual * inflFactor : 0;
      const ss2 = filing === "mfj" && age >= input.ssAge ? input.ssSpouse * inflFactor : 0;
      const ssTotal = ss1 + ss2;
      const pension = age >= input.penAge ? input.penAnnual * Math.pow(1 + input.penCola, yearsFromNow) : 0;
      const rental = input.rentInc * inflFactor;
      const otherInc = input.otherInc * inflFactor;

      // --- RMD (based on start-of-year / prior 12/31 balance) ---
      let rmd = 0;
      if (age >= startRMD && td > 0) rmd = td / rmdDivisor(age);

      // --- grow balances for the year ---
      const taxableYield = taxable * input.taxYield; // taxed as ordinary-ish each year
      td *= 1 + input.tdRet;
      roth *= 1 + input.rothRet;
      taxable *= 1 + input.taxRet;
      re *= 1 + input.reRet;
      other *= 1 + input.otherRet;

      // --- charitable giving & QCDs ---
      const charitable = input.charitable * inflFactor;
      let qcd = 0;
      if (input.useQCD && age >= QCD_AGE && charitable > 0 && td > 0) {
        qcd = Math.min(charitable, indexAmt(QCD_LIMIT_2026, yearsFromNow, infl), td);
      }
      // The RMD is satisfied first by the QCD (which is tax-free); any remainder
      // is a taxable cash distribution to the household. Total leaving the IRA is
      // max(rmd, qcd) — a QCD above the RMD still reduces the balance tax-free.
      const taxableRMD = Math.max(0, rmd - qcd);   // taxable cash RMD to household
      const tdOut = Math.max(rmd, qcd);
      td -= tdOut;
      if (td < 0) td = 0;
      const cashCharitable = charitable - qcd;      // giving funded with cash (not QCD)

      // --- spending gap (living expenses + cash charitable giving) ---
      const spendNeed = input.spending * inflFactor;
      const guaranteedCash = ssTotal + pension + rental + otherInc + taxableRMD;
      let gap = (spendNeed + cashCharitable) - guaranteedCash;

      let wTaxable = 0, wTD = 0, wRoth = 0, surplus = 0;
      if (gap > 0) {
        // 1) taxable/bank first
        wTaxable = Math.min(taxable, gap); taxable -= wTaxable; gap -= wTaxable;
        // 2) extra tax-deferred
        if (gap > 0) { wTD = Math.min(td, gap); td -= wTD; gap -= wTD; }
        // 3) Roth last (tax-free)
        if (gap > 0) { wRoth = Math.min(roth, gap); roth -= wRoth; gap -= wRoth; }
        if (gap > 0 && !depleted) { depleted = true; depletedAge = age; }
      } else {
        surplus = -gap;            // reinvest leftover income into taxable
        taxable += surplus;
      }

      // --- taxes ---
      const ordinaryNonSS = pension + rental + otherInc + taxableRMD + wTD + taxableYield;
      const taxSS = taxableSocialSecurity(ssTotal, ordinaryNonSS, filing);
      const grossOrdinary = ordinaryNonSS + taxSS; // ~AGI, also the MAGI proxy for IRMAA

      // standard deduction (indexed) + age add-ons (apply at 65+)
      let stdDed = indexAmt(STD_DEDUCTION[filing], yearsFromNow, infl);
      if (age >= 65) {
        stdDed += indexAmt(ADDL_65[filing], yearsFromNow, infl) * (filing === "mfj" ? 2 : 1);
        if (calYear <= SENIOR_BONUS.lastYear) {
          // senior bonus with phaseout on MAGI (approximate MAGI = grossOrdinary)
          const ps = SENIOR_BONUS.phaseStart[filing];
          let bonus = SENIOR_BONUS.amount * spouseCount65;
          const over = Math.max(0, grossOrdinary - ps);
          bonus = Math.max(0, bonus - over * SENIOR_BONUS.phaseRate);
          stdDed += bonus;
        }
      }
      // Itemize cash charitable gifts if they beat the standard deduction
      // (QCDs are already excluded above, so they are not deducted again).
      const charDeductible = Math.min(cashCharitable, 0.6 * grossOrdinary); // 60%-of-AGI cash limit
      const fedDeduction = Math.max(stdDed, charDeductible);

      const fedTaxable = Math.max(0, grossOrdinary - fedDeduction);
      const idxBrackets = FED_BRACKETS[filing].map(([lo, r]) => [indexAmt(lo, yearsFromNow, infl), r]);
      const fed = bracketTax(fedTaxable, idxBrackets);

      // state tax (approximate — see STATES note)
      const st = input.stateData;
      const stRate = input.stateOverride != null ? input.stateOverride : st.r / 100;
      let stateBase = ordinaryNonSS + (st.ss ? taxSS : 0);
      if (st.retExempt) stateBase = Math.max(0, stateBase - taxableRMD - pension - wTD); // retirement income exempt
      const stateTax = Math.max(0, stateBase) * stRate;

      // --- Medicare IRMAA surcharge (paid from liquid assets) ---
      let irmaa = 0, irmaaTier = 0;
      if (input.includeIRMAA && age >= MEDICARE_AGE) {
        const persons = filing === "mfj" ? 2 : 1;
        const info = computeIRMAA(grossOrdinary, filing, persons, yearsFromNow, infl);
        irmaa = info.surchargeAnnual;
        irmaaTier = info.tierIdx;
        let pay = irmaa;
        const a = Math.min(taxable, pay); taxable -= a; pay -= a;
        if (pay > 0) { const b = Math.min(td, pay); td -= b; pay -= b; }
        if (pay > 0) { const c = Math.min(roth, pay); roth -= c; pay -= c; }
      }

      const totalTax = fed.tax + stateTax;
      const totalIncome = ssTotal + pension + rental + otherInc + taxableRMD + wTaxable + wTD + wRoth;
      const netWorth = td + roth + taxable + re + other;

      rows.push({
        age, calYear, yearsFromNow, inflFactor,
        ss: ssTotal, pension, rental, otherInc, rmd, taxableRMD,
        wTaxable, wTD, wRoth, surplus, spendNeed,
        charitable, qcd, cashCharitable, irmaa, irmaaTier, magi: grossOrdinary,
        td, roth, taxable, re, other, netWorth,
        ordinary: grossOrdinary, taxSS, fedTaxable, stdDed: fedDeduction,
        fedTax: fed.tax, marginal: fed.marginal, stateTax, totalTax,
        idxBrackets, totalIncome,
        effRate: grossOrdinary > 0 ? totalTax / (totalIncome || 1) : 0,
        isFirstRMD: age === startRMD,
      });
    }

    return { rows, startRMD, depletedAge };
  }

  /* ------------------------ bracket-fill math ------------------------ */
  /** For a projection row, compute room to the top of each federal bracket
      and the incremental tax to fill it (for Roth conversion / RMD harvest). */
  function headroom(row) {
    const out = [];
    const base = row.fedTaxable; // current taxable income after deductions
    let cumTax = 0;
    for (let i = 0; i < row.idxBrackets.length; i++) {
      const lo = row.idxBrackets[i][0];
      const rate = row.idxBrackets[i][1];
      const hi = i + 1 < row.idxBrackets.length ? row.idxBrackets[i + 1][0] : Infinity;
      const roomToTop = Math.max(0, (isFinite(hi) ? hi : base) - base);
      out.push({
        rate, lo, hi,
        filledByYou: Math.max(0, Math.min(base, hi) - lo),
        roomToTop: isFinite(hi) ? roomToTop : null,
        taxToFill: isFinite(hi) ? roomToTop * rate : null,
      });
    }
    // cumulative additional realize-able amount & tax up to top of each bracket
    let cumRoom = 0; cumTax = 0;
    for (const b of out) {
      if (b.hi && b.hi > base) {
        const add = b.hi - Math.max(base, b.lo);
        if (add > 0) { cumRoom += add; cumTax += add * b.rate; }
        b.cumRoom = cumRoom; b.cumTax = cumTax;
      }
    }
    return out;
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
  let LAST = null;            // last projection result
  let DOLLAR_MODE = "real";   // real | nominal
  const BRACKET_COLORS = {
    0.10: "#9fd3bf", 0.12: "#6fc0a0", 0.22: "#4fae8b", 0.24: "#2f8d6c",
    0.32: "#1f6f57", 0.35: "#155544", 0.37: "#0c3b36",
  };

  function adj(row, val) { return DOLLAR_MODE === "real" ? val / row.inflFactor : val; }

  function renderSummary(res, input) {
    const rows = res.rows;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const firstRMDRow = rows.find((r) => r.rmd > 0);
    const peak = rows.reduce((a, r) => (r.netWorth > a.netWorth ? r : a), rows[0]);
    const totalTax = rows.reduce((s, r) => s + adj(r, r.totalTax), 0);
    const totalIRMAA = rows.reduce((s, r) => s + adj(r, r.irmaa), 0);
    const totalGiving = rows.reduce((s, r) => s + adj(r, r.charitable), 0);
    const totalQCD = rows.reduce((s, r) => s + adj(r, r.qcd), 0);

    const cards = [
      { k: "Net worth today", v: fmt0(first.netWorth), s: "All assets, age " + first.age },
      { k: "Net worth at age " + last.age, v: fmt0(adj(last, last.netWorth)), s: DOLLAR_MODE === "real" ? "today's dollars" : "future dollars" },
      { k: "Peak net worth", v: fmt0(adj(peak, peak.netWorth)), s: "at age " + peak.age },
      { k: "First RMD", v: firstRMDRow ? fmt0(adj(firstRMDRow, firstRMDRow.rmd)) : "—", s: firstRMDRow ? "age " + firstRMDRow.age + " (" + firstRMDRow.calYear + ")" : "no tax-deferred RMD" },
      { k: "Lifetime taxes", v: fmt0(totalTax), s: "fed + state, " + (DOLLAR_MODE === "real" ? "today's $" : "nominal") },
      { k: "Plan status", v: res.depletedAge ? "Shortfall" : "Funded", s: res.depletedAge ? "assets run low at age " + res.depletedAge : "assets last through age " + last.age },
    ];
    if (totalIRMAA > 0) cards.push({ k: "Lifetime IRMAA", v: fmt0(totalIRMAA), s: "Medicare surcharges" });
    if (totalGiving > 0) cards.push({ k: "Lifetime giving", v: fmt0(totalGiving), s: totalQCD > 0 ? fmt0(totalQCD) + " via QCD (tax-free)" : "from after-tax cash" });
    $("summaryCards").innerHTML = cards
      .map((c) => `<div class="stat"><div class="k">${c.k}</div><div class="v" style="${c.k === "Plan status" && res.depletedAge ? "color:var(--pp-red)" : ""}">${c.v}</div><div class="s">${c.s}</div></div>`)
      .join("");
  }

  function renderProjTable(res) {
    const cols = [
      ["Age", (r) => r.age], ["Year", (r) => r.calYear],
      ["Tax-def.", (r) => fmt0(adj(r, r.td))],
      ["Roth", (r) => fmt0(adj(r, r.roth))],
      ["Taxable", (r) => fmt0(adj(r, r.taxable))],
      ["Real est.", (r) => fmt0(adj(r, r.re))],
      ["Soc. Sec.", (r) => fmt0(adj(r, r.ss))],
      ["Pension", (r) => fmt0(adj(r, r.pension))],
      ["Rental", (r) => fmt0(adj(r, r.rental))],
      ["RMD", (r) => fmt0(adj(r, r.rmd))],
      ["QCD", (r) => fmt0(adj(r, r.qcd))],
      ["Taxable inc.", (r) => fmt0(adj(r, r.fedTaxable))],
      ["Fed tax", (r) => fmt0(adj(r, r.fedTax))],
      ["State tax", (r) => fmt0(adj(r, r.stateTax))],
      ["IRMAA", (r) => fmt0(adj(r, r.irmaa))],
      ["Marginal", (r) => `<span class="pill" style="background:${BRACKET_COLORS[r.marginal]};color:#fff">${fmtPct(r.marginal)}</span>`],
      ["Net worth", (r) => fmt0(adj(r, r.netWorth))],
    ];
    const head = "<thead><tr>" + cols.map((c) => `<th>${c[0]}</th>`).join("") + "</tr></thead>";
    const body = "<tbody>" + res.rows.map((r) => {
      return `<tr class="${r.rmd > 0 && r.age === res.startRMD ? "rmd-start" : ""}">` +
        cols.map((c) => `<td>${c[1](r)}</td>`).join("") + "</tr>";
    }).join("") + "</tbody>";
    $("projTable").innerHTML = head + body;
  }

  function renderBracketSelector(res) {
    const sel = $("bracketYear");
    const firstRMD = res.rows.findIndex((r) => r.rmd > 0);
    sel.innerHTML = res.rows
      .map((r, i) => `<option value="${i}">Age ${r.age} — ${r.calYear}${r.rmd > 0 ? " (RMD)" : ""}</option>`)
      .join("");
    sel.value = firstRMD >= 0 ? firstRMD : 0;
  }

  function renderBracket(res, input) {
    const idx = parseInt($("bracketYear").value, 10) || 0;
    const row = res.rows[idx];
    const st = input.stateData;
    const stRate = input.stateOverride != null ? input.stateOverride : st.r / 100;

    // summary line
    const stNote = st.t === "graduated" && input.stateOverride == null ? " (top marginal — approx.)" : "";
    const qcdRow = row.qcd > 0
      ? `<tr><td>&nbsp;&nbsp;QCD (counts toward RMD, tax-free)</td><td>−${fmt0(adj(row, row.qcd))}</td></tr>` : "";
    const irmaaRow = row.irmaa > 0
      ? `<tr><td>Medicare IRMAA surcharge (tier ${row.irmaaTier})</td><td>${fmt0(adj(row, row.irmaa))}</td></tr>` : "";
    $("bracketSummary").innerHTML = `
      <table class="kvtable">
        <tr><td>Federal taxable income (after deductions)</td><td>${fmt0(adj(row, row.fedTaxable))}</td></tr>
        <tr><td>&nbsp;&nbsp;of which taxable RMD</td><td>${fmt0(adj(row, row.taxableRMD))}</td></tr>
        ${qcdRow}
        <tr><td>Taxable Social Security</td><td>${fmt0(adj(row, row.taxSS))}</td></tr>
        <tr><td>Deduction used</td><td>${fmt0(adj(row, row.stdDed))}</td></tr>
        <tr><td>Federal marginal bracket</td><td><span class="pill" style="background:${BRACKET_COLORS[row.marginal]};color:#fff">${fmtPct(row.marginal)}</span></td></tr>
        <tr><td>Federal tax</td><td>${fmt0(adj(row, row.fedTax))}</td></tr>
        <tr><td>${st.n} state tax @ ${fmtPct(stRate)}${stNote}</td><td>${fmt0(adj(row, row.stateTax))}</td></tr>
        ${irmaaRow}
        <tr><td><strong>Total tax${row.irmaa > 0 ? " + IRMAA" : ""} / effective rate</strong></td><td><strong>${fmt0(adj(row, row.totalTax + row.irmaa))} &middot; ${fmtPct(row.effRate)}</strong></td></tr>
      </table>`;

    // ladder — show each bracket the income reaches, plus one bracket of headroom
    const hr = headroom(row);
    const topBracketIdx = Math.min(
      row.idxBrackets.length - 1,
      row.idxBrackets.filter((x) => x[0] <= row.fedTaxable).length // first empty bracket above income
    );
    const scaleTop = Math.max(
      isFinite(hr[topBracketIdx].hi) ? hr[topBracketIdx].hi : row.fedTaxable * 1.3,
      row.fedTaxable * 1.15,
      1
    );

    $("bracketLadder").innerHTML = hr.slice(0, topBracketIdx + 1).map((b) => {
      const segHi = isFinite(b.hi) ? b.hi : scaleTop;
      const filledFrac = Math.max(0, Math.min(row.fedTaxable, segHi) - b.lo) / Math.max(1, segHi - b.lo);
      const fillW = Math.max(0, Math.min(1, filledFrac)) * 100;
      const label = isFinite(b.hi) ? `${fmt0(adj(row, b.lo))}–${fmt0(adj(row, b.hi))}` : `${fmt0(adj(row, b.lo))}+`;
      const room = b.roomToTop != null && b.roomToTop > 0
        ? `room ${fmt0(adj(row, b.roomToTop))}` : (b.filledByYou > 0 ? "in this bracket" : "—");
      return `
        <div class="rung">
          <div><span class="pill" style="background:${BRACKET_COLORS[b.rate]};color:#fff">${fmtPct(b.rate)}</span></div>
          <div class="bar" title="${label}">
            <div class="fill" style="width:${fillW}%;background:${BRACKET_COLORS[b.rate]}"></div>
          </div>
          <div class="meta">${label}<br>${room}</div>
        </div>`;
    }).join("");

    // headroom table — realize/convert up to top of each bracket
    const rowsH = hr.filter((b) => isFinite(b.hi) && b.hi > row.fedTaxable);
    const head = `<thead><tr><th>Fill up to top of</th><th>Additional you can realize</th><th>Extra tax</th><th>Avg rate on extra</th></tr></thead>`;
    const body = "<tbody>" + rowsH.map((b) => {
      const target = b.rate;
      const highlight = Math.abs(target - input.fillTarget) < 1e-6;
      return `<tr style="${highlight ? "background:#fff7ea;font-weight:600" : ""}">
        <td>${fmtPct(b.rate)} bracket (${fmt0(adj(row, b.hi))})</td>
        <td>${fmt0(adj(row, b.cumRoom || 0))}</td>
        <td>${fmt0(adj(row, b.cumTax || 0))}</td>
        <td>${b.cumRoom ? fmtPct((b.cumTax || 0) / b.cumRoom) : "—"}</td>
      </tr>`;
    }).join("") + "</tbody>";
    $("headroomTable").innerHTML = head + body;

    // headline takeaway for the chosen fill target
    const targetRung = rowsH.find((b) => Math.abs(b.rate - input.fillTarget) < 1e-6);
    if (targetRung) {
      const tip = `<div class="note" style="margin-top:12px">At age ${row.age} you can realize about <strong>${fmt0(adj(row, targetRung.cumRoom || 0))}</strong> more ordinary income (RMD + Roth conversions) before crossing out of the <strong>${fmtPct(input.fillTarget)}</strong> bracket — costing roughly <strong>${fmt0(adj(row, targetRung.cumTax || 0))}</strong> in additional federal tax.</div>`;
      $("bracketSummary").insertAdjacentHTML("beforeend", tip);
    }
  }

  function renderRoth(res, input) {
    const el = $("rothAnalysis");
    if (!el) return;
    const rows = res.rows;
    const nowRow = rows[0];                         // current / pre-RMD bracket
    const rmdRow = rows.find((r) => r.rmd > 0) || rows[rows.length - 1];
    const peakMarginal = rows.reduce((m, r) => Math.max(m, r.marginal), 0);
    const nowRate = nowRow.marginal;
    const rmdRate = rmdRow.marginal;

    // How much could you convert now to fill your target bracket, and at what avg rate?
    const hr = headroom(nowRow);
    const targetRung = hr.find((b) => isFinite(b.hi) && b.hi > nowRow.fedTaxable && Math.abs(b.rate - input.fillTarget) < 1e-6);
    let convAmt = targetRung && targetRung.cumRoom ? targetRung.cumRoom : 50000;
    convAmt = Math.min(convAmt, input.tdBal);       // can't convert more than you have
    const nowAvgRate = targetRung && targetRung.cumRoom ? targetRung.cumTax / targetRung.cumRoom : nowRate;

    const n = Math.max(1, res.startRMD - input.currentAge);
    const r = input.tdRet;
    const grow = Math.pow(1 + r, n);
    // Pay-the-tax-from-the-account break-even (the standard Roth comparison)
    const tradAfterTax = convAmt * grow * (1 - rmdRate);
    const rothAfterTax = convAmt * (1 - nowAvgRate) * grow;
    const advantage = rothAfterTax - tradAfterTax;

    let verdict, vColor;
    if (rmdRate - nowRate > 0.001) { verdict = "Converting now looks favorable"; vColor = "var(--pp-green-dk)"; }
    else if (nowRate - rmdRate > 0.001) { verdict = "Converting now looks unfavorable on rates"; vColor = "var(--pp-warn)"; }
    else { verdict = "Roughly rate-neutral"; vColor = "var(--pp-ink-2)"; }

    el.innerHTML = `
      <div class="note">Compares paying tax on tax-deferred dollars <strong>now</strong> (Roth conversion) versus
        later, when RMDs are forced out. Uses your current bracket, your projected bracket once RMDs begin,
        your expected return (${fmtPct(r)}), and ${n} year${n === 1 ? "" : "s"} until RMDs at age ${res.startRMD}.</div>
      <table class="kvtable">
        <tr><td>Your marginal rate now (age ${nowRow.age})</td><td><span class="pill" style="background:${BRACKET_COLORS[nowRate]};color:#fff">${fmtPct(nowRate)}</span></td></tr>
        <tr><td>Projected rate once RMDs begin (age ${rmdRow.age})</td><td><span class="pill" style="background:${BRACKET_COLORS[rmdRate]};color:#fff">${fmtPct(rmdRate)}</span></td></tr>
        <tr><td>Highest marginal rate in your plan</td><td><span class="pill" style="background:${BRACKET_COLORS[peakMarginal]};color:#fff">${fmtPct(peakMarginal)}</span></td></tr>
      </table>
      <h3 style="margin-top:16px;">If you convert ${fmt0(convAmt)} now (fills your ${fmtPct(input.fillTarget)} target)</h3>
      <table class="proj" style="font-size:13px;">
        <thead><tr><th>&nbsp;</th><th>Keep Traditional</th><th>Convert to Roth</th><th>Roth advantage</th></tr></thead>
        <tbody>
          <tr><td>Tax paid now</td><td>$0</td><td>${fmt0(convAmt * nowAvgRate)}</td><td>−${fmt0(convAmt * nowAvgRate)}</td></tr>
          <tr><td>Grows ${n} yr @ ${fmtPct(r)} to</td><td>${fmt0(convAmt * grow)}</td><td>${fmt0(convAmt * (1 - nowAvgRate) * grow)}</td><td>&nbsp;</td></tr>
          <tr><td>Tax at withdrawal (@ ${fmtPct(rmdRate)})</td><td>${fmt0(convAmt * grow * rmdRate)}</td><td>$0</td><td>&nbsp;</td></tr>
          <tr style="font-weight:700;background:#eef4f1"><td>After-tax value</td><td>${fmt0(tradAfterTax)}</td><td>${fmt0(rothAfterTax)}</td><td style="color:${advantage >= 0 ? "var(--pp-green-dk)" : "var(--pp-red)"}">${advantage >= 0 ? "+" : "−"}${fmt0(Math.abs(advantage))}</td></tr>
        </tbody>
      </table>
      <div class="note" style="border-left-color:${vColor};margin-top:12px;">
        <strong style="color:${vColor}">${verdict}.</strong>
        ${advantage >= 0
          ? "At these rates, converting now and paying tax at " + fmtPct(nowAvgRate) + " beats leaving the money to be taxed at " + fmtPct(rmdRate) + " later — by about " + fmt0(Math.abs(advantage)) + " per " + fmt0(convAmt) + " converted."
          : "At these rates, leaving the money in the Traditional account is better by about " + fmt0(Math.abs(advantage)) + " per " + fmt0(convAmt) + " converted."}
        Conversions also <strong>shrink future RMDs</strong> (lower forced income, bracket and ${input.includeIRMAA ? "IRMAA" : "Medicare"} pressure later) — but a large conversion <strong>raises your MAGI now</strong>, which can itself trigger IRMAA two years later. Filling only up to a target bracket each year is the usual approach.
      </div>`;
  }

  function renderCharts(res) {
    const W = 560, H = 220, pad = 38;
    const rows = res.rows;
    const xs = (i) => pad + (i / (rows.length - 1)) * (W - pad - 8);
    const maxNW = Math.max(...rows.map((r) => adj(r, r.netWorth)), 1);
    const yNW = (v) => H - pad - (v / maxNW) * (H - pad - 10);

    // net worth line + stacked-ish area for account types
    const nwPath = rows.map((r, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${yNW(adj(r, r.netWorth)).toFixed(1)}`).join(" ");
    const tdPath = rows.map((r, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${yNW(adj(r, r.td)).toFixed(1)}`).join(" ");

    // income composition (RMD vs SS vs pension vs withdrawals) — bars of total income
    const maxInc = Math.max(...rows.map((r) => adj(r, r.totalIncome)), 1);
    const yInc = (v) => H - pad - (v / maxInc) * (H - pad - 10);
    const barW = Math.max(2, (W - pad - 8) / rows.length - 2);
    const incBars = rows.map((r, i) => {
      const x = xs(i) - barW / 2;
      const segs = [
        [adj(r, r.ss), "#9fd3bf"],
        [adj(r, r.pension + r.rental + r.otherInc), "#6fc0a0"],
        [adj(r, r.rmd), "#2f8d6c"],
        [adj(r, r.wTaxable + r.wTD + r.wRoth), "#0c3b36"],
      ];
      let acc = 0; let html = "";
      for (const [val, c] of segs) {
        if (val <= 0) continue;
        const h = (val / maxInc) * (H - pad - 10);
        const y = H - pad - acc - h;
        html += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}"/>`;
        acc += h;
      }
      return html;
    }).join("");

    const yTicks = (ymax, yfn) => [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = ymax * f; const y = yfn(v);
      return `<line class="axis" x1="${pad}" y1="${y}" x2="${W - 8}" y2="${y}"/><text x="2" y="${y + 3}">${fmt0(v)}</text>`;
    }).join("");
    const xTicks = rows.filter((_, i) => i % Math.ceil(rows.length / 8) === 0).map((r, k, arr) => {
      const i = rows.indexOf(r); return `<text x="${xs(i) - 8}" y="${H - pad + 14}">${r.age}</text>`;
    }).join("");

    $("charts").innerHTML = `
      <h3>Net worth (line) &amp; tax-deferred balance (dashed)</h3>
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
        ${yTicks(maxNW, yNW)}${xTicks}
        <path d="${nwPath}" fill="none" stroke="#0c3b36" stroke-width="2.5"/>
        <path d="${tdPath}" fill="none" stroke="#4fae8b" stroke-width="2" stroke-dasharray="5 4"/>
      </svg>
      <h3 style="margin-top:18px;">Annual income by source</h3>
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
        ${yTicks(maxInc, yInc)}${xTicks}${incBars}
      </svg>
      <div class="legend">
        <span style="--c:#9fd3bf"><i style="background:#9fd3bf"></i>Social Security</span>
        <span style="--c:#6fc0a0"><i style="background:#6fc0a0"></i>Pension / rental / other</span>
        <span style="--c:#2f8d6c"><i style="background:#2f8d6c"></i>RMD</span>
        <span style="--c:#0c3b36"><i style="background:#0c3b36"></i>Other withdrawals</span>
      </div>`;
  }

  function renderDisclaimer(input) {
    $("disclaimer").innerHTML = `
      <strong>Assumptions &amp; limitations.</strong> Federal brackets, standard deduction and the
      age-65 / OBBBA senior add-ons are <em>2026 estimates</em> indexed forward at your inflation
      assumption (${fmtPct(input.inflation)}). Social Security taxation uses the IRS provisional-income
      test (thresholds are not inflation-indexed by law). RMDs use the IRS Uniform Lifetime Table with a
      start age of ${rmdStartAge(BASE_YEAR - input.currentAge)} (SECURE 2.0). <strong>QCDs</strong> (age 70½+)
      count toward the RMD and are excluded from income; cash gifts are itemized when they beat the standard
      deduction. <strong>Medicare IRMAA</strong> surcharges are 2026 estimates applied to that year's MAGI
      (the real rules use MAGI from two years prior). The Roth analysis is a simplified break-even at the rates
      shown. <em>State income tax is
      simplified to a single representative marginal rate</em> — for graduated states this is the top
      marginal rate and may overstate tax at lower incomes; flat- and no-tax states are exact. Some
      states fully or partly exempt Social Security and retirement income (handled where flagged). You
      can override the state rate above. This tool is for educational planning only and is not tax,
      legal, or investment advice. Consult a qualified professional before acting.`;
  }

  function renderAll() {
    if (!LAST) return;
    renderSummary(LAST.res, LAST.input);
    renderBracket(LAST.res, LAST.input);
    renderRoth(LAST.res, LAST.input);
    renderCharts(LAST.res);
    renderProjTable(LAST.res);
    postHeight();
  }

  /* ------------------------------ wiring ------------------------------ */
  function readInputs() {
    const stateCode = $("state").value;
    const ov = $("stateOverride").value;
    return {
      currentAge: num("currentAge"), endAge: num("endAge"),
      filing: $("filing").value, stateData: STATES[stateCode], stateCode,
      stateOverride: ov === "" ? null : (parseFloat(ov) || 0) / 100,
      spending: num("spending"),
      tdBal: num("tdBal"), tdRet: pct("tdRet"),
      rothBal: num("rothBal"), rothRet: pct("rothRet"),
      taxBal: num("taxBal"), taxRet: pct("taxRet"), taxYield: pct("taxYield"),
      reVal: num("reVal"), reRet: pct("reRet"), rentInc: num("rentInc"),
      otherVal: num("otherVal"), otherRet: pct("otherRet"),
      ssAnnual: num("ssAnnual"), ssAge: num("ssAge"), ssSpouse: num("ssSpouse"),
      penAnnual: num("penAnnual"), penAge: num("penAge"), penCola: pct("penCola"),
      otherInc: num("otherInc"),
      charitable: num("charitable"), useQCD: $("useQCD").checked, includeIRMAA: $("includeIRMAA").checked,
      inflation: pct("inflation"), fillTarget: parseFloat($("fillTarget").value),
    };
  }

  function run() {
    const input = readInputs();
    if (input.endAge <= input.currentAge) { alert("Plan-through age must be greater than current age."); return; }
    const res = project(input);
    LAST = { res, input };
    renderBracketSelector(res);
    renderDisclaimer(input);
    renderAll();
    // Only self-scroll when standalone; in an auto-resized iframe there is no
    // inner scroll and this could jump the parent page.
    if (!EMBEDDED) {
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function initStates() {
    const sel = $("state");
    sel.innerHTML = Object.keys(STATES)
      .sort((a, b) => STATES[a].n.localeCompare(STATES[b].n))
      .map((k) => `<option value="${k}">${STATES[k].n}${STATES[k].t === "none" ? " (no income tax)" : ""}</option>`)
      .join("");
    sel.value = "FL";
  }

  function init() {
    if (HIDE_CHROME) document.body.classList.add("embed");
    initStates();
    $("runBtn").addEventListener("click", run);
    $("resetBtn").addEventListener("click", () => location.reload());
    $("bracketYear").addEventListener("change", () => renderBracket(LAST.res, LAST.input));
    $("filing").addEventListener("change", () => {
      $("ss2wrap").style.display = $("filing").value === "mfj" ? "" : "none";
    });
    document.querySelectorAll("#dollarMode button").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#dollarMode button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        DOLLAR_MODE = b.dataset.mode;
        renderAll();
      })
    );
    run(); // run once with defaults

    // Keep the iframe sized to its content as the layout reflows.
    if (EMBEDDED) {
      window.addEventListener("resize", postHeight);
      window.addEventListener("load", postHeight);
      if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
      // also collapse/expand of the <details> input sections changes height
      document.querySelectorAll("details.sec").forEach((d) => d.addEventListener("toggle", postHeight));
      setTimeout(postHeight, 300);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
