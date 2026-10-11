import test from "node:test";
import assert from "node:assert/strict";
import { plan, estimateDeal } from "../src/lib/planner.js";
import { addressFromInput } from "../src/lib/zillow.js";
import { debtServiceFromLoan } from "../src/lib/engine.js";

test("planner: house hack is the cheapest way to own, REIT needs nothing", () => {
  const r = plan({ savingsUsd: 60000, priceUsd: 300000 });
  assert.equal(r.cheapest.id, "househack");
  assert.ok(r.cheapest.cashNeededUsd < r.priciestCashNeededUsd);
  const reit = r.routes.find((x) => x.id === "reit");
  assert.equal(reit.cashNeededUsd, 0);
  assert.equal(reit.monthlyUsd, 200); // 60,000 * 4% / 12
  for (const x of r.routes) assert.ok(Number.isFinite(x.cashNeededUsd));
});

test("planner: same input, same output", () => {
  assert.deepEqual(plan({ savingsUsd: 50000, priceUsd: 280000, monthlyRentUsd: 2400 }), plan({ savingsUsd: 50000, priceUsd: 280000, monthlyRentUsd: 2400 }));
});

test("planner: debt service comes from the engine's loan math", () => {
  const e = estimateDeal({ priceUsd: 300000, monthlyRentUsd: 2600, downPct: 0.25, ratePct: 0.065 });
  const ref = debtServiceFromLoan({ priceUsd: 300000, downPaymentFraction: 0.25, annualRate: 0.065, termYears: 30 });
  assert.equal(e.deal.debtServiceUsdPerYear, ref.annualDebtServiceUsd);
  assert.equal(e.rentEstimated, false);
});

test("planner: flood year is never better than a normal year", () => {
  for (const x of plan({ savingsUsd: 80000, priceUsd: 350000 }).routes.filter((r) => r.floodYear))
    assert.ok(x.floodYear.dscr < x.baseDscr, x.id);
});

test("planner: house hack only counts the tenant's half of the rent", () => {
  const full = estimateDeal({ priceUsd: 300000, monthlyRentUsd: 3000 });
  const half = estimateDeal({ priceUsd: 300000, monthlyRentUsd: 3000, collectedRentShare: 0.5 });
  assert.equal(half.deal.annualRentUsd * 2, full.deal.annualRentUsd);
});

test("zillow link -> address, other input unchanged", () => {
  assert.equal(addressFromInput("https://www.zillow.com/homedetails/6900-Onion-Creek-Dr-Austin-TX-78744/29491234_zpid/"),
    "6900 Onion Creek Dr Austin, TX 78744");
  assert.equal(addressFromInput("  900 Barton Springs Rd "), "900 Barton Springs Rd");
});
