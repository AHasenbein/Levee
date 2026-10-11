import assert from "node:assert/strict";
import test from "node:test";
import * as Engine from "../src/lib/engine.js";
import { floodProbability, inAustinScope } from "../src/lib/zones.js";

test("loan payment: 300k price, 20% down, 6%, 30y => 1438.92/mo", () => {
  const r = Engine.debtServiceFromLoan({ priceUsd: 300000, downPaymentFraction: 0.2, annualRate: 0.06, termYears: 30 });
  assert.equal(r.monthlyPaymentUsd, 1438.92);
  assert.equal(r.annualDebtServiceUsd, 17267.04);
});

test("loan payment: zero rate is straight-line", () => {
  const r = Engine.debtServiceFromLoan({ priceUsd: 120000, downPaymentFraction: 0, annualRate: 0, termYears: 10 });
  assert.equal(r.monthlyPaymentUsd, 1000);
});

test("zone mapping", () => {
  assert.deepEqual(floodProbability({ zone: "AE", sfha: "T" }).probPerYear, 0.01);
  assert.equal(floodProbability({ zone: "AE" }).inFloodZone, true);
  assert.equal(floodProbability({ zone: "X", subtype: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", sfha: "F" }).probPerYear, 0.002);
  const min = floodProbability({ zone: "X", subtype: "AREA OF MINIMAL FLOOD HAZARD", sfha: "F" });
  assert.equal(min.inFloodZone, false);
  assert.match(min.basis, /Placeholder/);
});

test("austin scope box", () => {
  assert.equal(inAustinScope(30.2672, -97.7431), true);
  assert.equal(inAustinScope(29.7604, -95.3698), false); // Houston
});

test("closed form is only valid when base passes and a flood always breaks it", () => {
  const deal = { annualRentUsd: 30000, otherOperatingCostsUsdPerYear: 7000, insuranceUsdPerYear: 2000, debtServiceUsdPerYear: 16000, holdYears: 30 };
  const sc = { vacantMonths: 0, deductibleUsd: 0, uninsuredRepairUsd: 0, premiumMultiplier: 1 };
  assert.ok(Engine.evaluate(deal, sc).dscr >= 1); // mild flood does not break it
});
