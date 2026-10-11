// In-browser mock of the API contract: /v1/stress (paid, 402), /v1/memo, agent scan.
// Payments sit behind one interface; only a mock implementation exists in this demo.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine"), require("./data"));
  else root.Api = factory(root.Engine, root.Data);
})(typeof self !== "undefined" ? self : this, function (Engine, Data) {
  const PRICE_USD = 1.25;
  let receiptCounter = 0;

  const mockPayments = {
    mode: "mock",
    pay(amountUsd) {
      receiptId = "mock-" + String(++receiptCounter).padStart(4, "0");
      return { receiptId, amountUsd };
    },
  };
  let receiptId;

  // POST /v1/stress. Unpaid + non-mock => 402 with payment instructions.
  function stress(req, { receipt, mockSkipsCheck = false } = {}) {
    if (!receipt && !mockSkipsCheck) {
      return { status: 402, body: { error: "Payment Required", priceUsd: PRICE_USD, protocol: "x402 (mock)" } };
    }
    const base = Engine.evaluate(req.deal, null);
    const stressed = Engine.evaluate(req.deal, req.scenario);
    const simulation = Engine.simulate(req.deal, req.scenario, req.hazard.annualProbability, req.simulation);
    const assumptions = Object.entries(Data.ASSUMPTIONS).map(([name, a]) => ({ name, value: a.value, basis: a.basis }));
    return {
      status: 200,
      body: {
        base: { noiUsd: base.noiUsd, dscr: base.dscr },
        stressed,
        simulation,
        assumptions,
        payment: { mode: mockPayments.mode, receiptId: receipt ? receipt.receiptId : "mock-skipped" },
      },
    };
  }

  function requestFor(p) {
    return {
      deal: p.deal,
      hazard: { type: "flood", annualProbability: p.probPerYear, zone: p.zone },
      scenario: Data.scenarioFromAssumptions(),
      simulation: { paths: Data.ASSUMPTIONS.paths.value, seed: Data.ASSUMPTIONS.seed.value },
    };
  }

  // POST /v1/memo. Template that only restates engine output (stand-in for Bedrock).
  function memo(p, r) {
    const f = (n) => "$" + Math.round(n).toLocaleString("en-US");
    const pct = (x) => (x * 100).toFixed(1) + "%";
    const sim = r.simulation;
    const verdict = r.stressed.dscr < 1 ? "FAILS" : "SURVIVES";
    return [
      `${p.name}: on an average year the deal shows NOI ${f(r.base.noiUsd)} and DSCR ${r.base.dscr.toFixed(2)}.`,
      `In a flood year (${Data.ASSUMPTIONS.vacantMonths.value} months vacant, ${f(Data.ASSUMPTIONS.deductibleUsd.value)} deductible, ${f(Data.ASSUMPTIONS.uninsuredRepairUsd.value)} uncovered) NOI is ${f(r.stressed.noiUsd)} and DSCR ${r.stressed.dscr.toFixed(2)}, so the deal ${verdict} the stress test.`,
      r.stressed.outOfPocketUsd > 0 ? `The owner would pay about ${f(r.stressed.outOfPocketUsd)} out of pocket that year.` : `No out-of-pocket shortfall in the flood year.`,
      `Over ${p.deal.holdYears} years (${sim.paths.toLocaleString()} simulated paths, seed ${sim.seed}, independent years), ${pct(sim.shareOfPathsWithFailingYear)} of paths include at least one failing year. Worst-year DSCR percentiles: p5 ${sim.minDscrPercentiles.p5.toFixed(2)}, p50 ${sim.minDscrPercentiles.p50.toFixed(2)}, p95 ${sim.minDscrPercentiles.p95.toFixed(2)}.`,
      `All figures come from the engine; flood probability ${p.probPerYear} per year is an assumption.`,
    ];
  }

  // Deal Finder: screens by base DSCR (cheap, from seed data), pays per analysis until the cap.
  function agentScan(capUsd) {
    const trace = [];
    let spent = 0;
    const analyzed = [];
    const ranked = Data.PROPERTIES.slice().sort(
      (a, b) => Engine.evaluate(b.deal, null).dscr - Engine.evaluate(a.deal, null).dscr
    );
    trace.push(`Session started, cap $${capUsd.toFixed(2)}, price $${PRICE_USD.toFixed(2)} per analysis`);
    for (const p of ranked) {
      if (spent + PRICE_USD > capUsd) {
        trace.push(`Cap reached: next analysis would bring spend to $${(spent + PRICE_USD).toFixed(2)} > $${capUsd.toFixed(2)}. Stopping.`);
        break;
      }
      trace.push(`POST /v1/stress ${p.name} -> 402 Payment Required ($${PRICE_USD.toFixed(2)})`);
      const receipt = mockPayments.pay(PRICE_USD);
      spent += PRICE_USD;
      trace.push(`Paid $${PRICE_USD.toFixed(2)} (receipt ${receipt.receiptId}), retry -> 200`);
      const res = stress(requestFor(p), { receipt });
      analyzed.push({ property: p, result: res.body });
      trace.push(`${p.name}: stressed DSCR ${res.body.stressed.dscr.toFixed(2)} (${res.body.stressed.dscr < 1 ? "FAIL" : "pass"})`);
    }
    trace.push(`Done. Analyzed ${analyzed.length}, spent $${spent.toFixed(2)} of $${capUsd.toFixed(2)}`);
    return { trace, analyzed, spentUsd: spent };
  }

  return { PRICE_USD, stress, requestFor, memo, agentScan };
});
