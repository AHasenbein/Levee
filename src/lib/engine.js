// Pure stress engine. No model call touches a number. Money is integer cents internally.
  const cents = (usd) => Math.round(usd * 100);
  const usd = (c) => c / 100;

  function noiCents(deal, scenario) {
    const vacant = scenario ? scenario.vacantMonths : 0;
    const rentCollected = Math.round(cents(deal.annualRentUsd) * (1 - vacant / 12));
    let opCosts = cents(deal.otherOperatingCostsUsdPerYear);
    if (scenario) {
      opCosts +=
        Math.round(cents(deal.insuranceUsdPerYear) * scenario.premiumMultiplier) +
        cents(scenario.deductibleUsd) +
        cents(scenario.uninsuredRepairUsd);
    } else {
      opCosts += cents(deal.insuranceUsdPerYear);
    }
    return rentCollected - opCosts;
  }

  function evaluate(deal, scenario) {
    const debt = cents(deal.debtServiceUsdPerYear);
    const noi = noiCents(deal, scenario);
    return {
      noiUsd: usd(noi),
      dscr: noi / debt,
      outOfPocketUsd: usd(Math.max(0, debt - noi)),
    };
  }

  // Seeded PRNG (mulberry32): same seed, same output.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function percentile(sorted, q) {
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
    return sorted[i];
  }

  function simulate(deal, scenario, probPerYear, { paths = 10000, seed = 42 } = {}) {
    const rand = rng(seed);
    const base = evaluate(deal, null).dscr;
    const flood = evaluate(deal, scenario).dscr;
    const mins = new Array(paths);
    let failing = 0;
    for (let i = 0; i < paths; i++) {
      let min = Infinity;
      for (let y = 0; y < deal.holdYears; y++) {
        const d = rand() < probPerYear ? flood : base;
        if (d < min) min = d;
      }
      mins[i] = min;
      if (min < 1) failing++;
    }
    mins.sort((a, b) => a - b);
    return {
      paths,
      seed,
      shareOfPathsWithFailingYear: failing / paths,
      minDscrPercentiles: {
        p5: percentile(mins, 0.05),
        p50: percentile(mins, 0.5),
        p95: percentile(mins, 0.95),
      },
    };
  }

  // One illustrative path: per-year DSCR and whether a flood hit that year.
  function samplePath(deal, scenario, probPerYear, seed) {
    const rand = rng(seed);
    const base = evaluate(deal, null).dscr;
    const flood = evaluate(deal, scenario).dscr;
    const years = [];
    for (let y = 0; y < deal.holdYears; y++) {
      const hit = rand() < probPerYear;
      years.push({ year: y + 1, flood: hit, dscr: hit ? flood : base });
    }
    return years;
  }

  const closedFormShare = (p, years) => 1 - Math.pow(1 - p, years);

// Fixed-rate amortized loan payment. Returns annual debt service in USD (integer cents inside).
function debtServiceFromLoan({ priceUsd, downPaymentFraction, annualRate, termYears }) {
  const principal = cents(priceUsd) * (1 - downPaymentFraction);
  const n = termYears * 12;
  const r = annualRate / 12;
  const monthly = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  return { monthlyPaymentUsd: usd(Math.round(monthly)), annualDebtServiceUsd: usd(Math.round(monthly) * 12) };
}

export { debtServiceFromLoan, evaluate, simulate, samplePath, closedFormShare, rng };
