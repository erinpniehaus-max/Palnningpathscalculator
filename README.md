# Planning Paths — Retirement Planning Calculators

A Planning Paths–branded suite of single-page financial planning calculators.
Each is a static, **embeddable** widget (plain HTML + CSS + vanilla JS, **no
build step and no runtime dependencies**) that can be hosted on GitHub Pages or
any static host and dropped into a dashboard (GoHighLevel, Lovable, Webflow,
WordPress, …) via an auto-resizing `<iframe>`.

## Calculators

| Page | What it does |
|---|---|
| `index.html` | **Retirement, RMD & Tax-Bracket calculator** — full year-by-year projection with RMDs, taxes, IRMAA, charitable/QCD giving, and a Roth-conversion analysis. |
| `long-term-care.html` | **Long-Term Care cost & funding calculator** — projects care costs, LTC-insurance coverage, the out-of-pocket gap, and the lump sum needed today. |
| `contributions-gifting.html` | **2026 Contributions & Gifting calculator** — contribution limits, SECURE 2.0 catch-up by age, employer match, current-year tax benefit, and gift/estate exemption planning. |

---

## Retirement, RMD & Tax-Bracket calculator (`index.html`)

Projects your full financial picture year by year and shows how Required
Minimum Distributions (RMDs) interact with the federal tax brackets, your
state's marginal rate, Medicare IRMAA, and charitable giving — so you can plan
bracket-filling, QCDs, and Roth conversions.

## What it does

**Inputs**
- Household & timeline: current age, life-expectancy (plan-through) age, filing
  status, state of residence, annual spending need.
- Balances & expected returns (each grows at its own rate):
  - Tax-deferred 401(k)/Traditional IRA (subject to RMDs)
  - Roth (no RMD)
  - Taxable brokerage / bank (with an annually-taxed yield)
  - Real estate / rental property (appreciation + net rental income)
  - Other assets / property
- Income: Social Security (you + spouse, with claiming age and COLA), pension
  (start age + optional COLA), and other taxable income.
- Charitable giving (with optional QCD funding) and a Medicare IRMAA toggle.
- Assumptions & levers: inflation rate, a bracket-fill target, and an optional
  state marginal-rate override.

**Outputs**
- **Summary** — net worth today / at end of plan / peak, first RMD, lifetime
  taxes, and whether the plan is funded or runs short.
- **RMD & tax-bracket analysis** for any year:
  - Federal taxable income, the RMD portion, taxable Social Security, deductions.
  - A visual ladder of where income lands across the brackets.
  - A **headroom table**: how much more you can realize/convert before crossing
    out of each bracket, and the extra tax to do so (Roth-conversion planning).
  - **Medicare IRMAA** tier and surcharge for the year, and the **QCD** amount
    (which lowers taxable RMD, your bracket, and your IRMAA MAGI).
- **Should you convert to a Roth?** — compares your current marginal rate to
  your projected RMD-era rate, with an after-tax break-even on converting up to
  your target bracket, plus the IRMAA trade-offs.
- **Charts** — net worth & tax-deferred balance over time; annual income by
  source (Social Security, pension/rental/other, RMD, other withdrawals).
- **Your Planning Path** — a full year-by-year table (the "calendar"), with the
  first RMD year highlighted.
- A **Today's-dollars ↔ future-dollars** toggle on every figure.

## Modeling details

- **Federal tax**: 2026 estimated brackets and standard deduction (post-OBBBA
  TCJA structure), including the age-65 additional deduction and the temporary
  OBBBA senior bonus deduction with its MAGI phase-out. Brackets and deductions
  are inflation-indexed forward each year.
- **Social Security taxation**: IRS provisional-income test (thresholds are not
  inflation-indexed, by law).
- **RMDs**: IRS Uniform Lifetime Table, with a start age of 73 or 75 per
  SECURE 2.0 based on birth year.
- **QCDs**: available at 70½+, capped at the (indexed) annual limit, counted
  toward the RMD and excluded from income. Cash gifts are itemized when they
  beat the standard deduction (60%-of-AGI cash limit).
- **Medicare IRMAA**: 2026-estimated Part B/D tiers applied to the year's MAGI
  (the real rules use MAGI from two years prior — a planning simplification),
  inflation-indexed forward, charged per Medicare-age person.
- **Roth analysis**: a simplified pay-the-tax-from-the-account break-even using
  your current vs projected marginal rates and expected return.
- **State tax**: a simplified single representative marginal rate per state.
  Flat- and no-tax states are exact; graduated states use the **top** marginal
  rate (may overstate at lower incomes) — override it in the inputs for
  precision. Social Security / retirement-income exemptions are applied where
  flagged.

## Running it

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Embedding it in a dashboard (iframe widget)

The calculator is designed to drop into a dashboard (GoHighLevel, Lovable,
Webflow, WordPress, etc.) as an auto-resizing `<iframe>`.

1. **Host it.** Publish this repo (e.g. GitHub Pages) so `index.html` has a
   public URL, e.g. `https://<user>.github.io/Palnningpathscalculator/`.
2. **Embed it.** Paste this into your dashboard's custom-HTML / code block,
   swapping in your hosted URL. Keep `?embed=1` to hide the duplicate header:

   ```html
   <iframe id="pp-calc"
           src="https://<user>.github.io/Palnningpathscalculator/?embed=1"
           title="Planning Paths Retirement Calculator"
           style="width:100%;border:0;" scrolling="no" loading="lazy"
           height="2200"></iframe>
   <script>
     window.addEventListener("message", function (e) {
       if (e.data && e.data.type === "pp-calc-height") {
         var f = document.getElementById("pp-calc");
         if (f) f.style.height = e.data.height + "px";
       }
     });
   </script>
   ```

The page posts its height to the parent (`postMessage`) so the iframe resizes
to its content with no inner scrollbar. `embed-example.html` is a working demo
and test harness. URL params: `?embed=1` (or `?chrome=0`) hides the top header.

> GoHighLevel: use a **Custom HTML / Code** element on a page or a Custom Menu
> Link (iframe). If the auto-resize script can't run in a given GHL context,
> the static `height="2200"` fallback keeps it usable.

## Disclaimer

This is an educational planning tool, **not tax, legal, or investment advice**.
Tax figures are estimates and simplifications. Consult a qualified professional
before making decisions.

## Files

- `index.html` — retirement calculator UI and styling
- `assets/app.js` — retirement projection engine, tax/RMD/IRMAA/QCD/Roth logic
- `long-term-care.html` — long-term care calculator UI
- `assets/ltc.js` — long-term care cost/funding engine
- `contributions-gifting.html` — 2026 contributions & gifting calculator UI
- `assets/contrib.js` — contribution-limit, match, tax-benefit & gifting engine
- `embed-example.html` — iframe embed demo / test harness
- `assets/planning-paths-logo-DPjQ3yIa.jpg` — brand logo

Both calculators embed the same way — just point the iframe `src` at the page
you want (`index.html` or `long-term-care.html`) with `?embed=1`.
