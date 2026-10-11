const assert = require("node:assert/strict");
const test = require("node:test");
const Engine = require("../src/engine");
const Api = require("../src/api");
const Data = require("../src/data");

const deal = { annualRentUsd: 30000, otherOperatingCostsUsdPerYear: 7000, insuranceUsdPerYear: 2000, debtServiceUsdPerYear: 16000, holdYears: 30 };
const scenario = { vacantMonths: 3, deductibleUsd: 5000, uninsuredRepairUsd: 1000, premiumMultiplier: 1.0 };

test("golden: base year", () => {
  const r = Engine.evaluate(deal, null);
  assert.equal(r.noiUsd, 21000);
  assert.equal(r.dscr, 1.3125);
});

test("golden: flood year", () => {
  const r = Engine.evaluate(deal, scenario);
  assert.equal(r.noiUsd, 7500);
  assert.equal(r.dscr, 0.46875);
  assert.equal(r.outOfPocketUsd, 8500);
});

test("same seed, same output", () => {
  const a = Engine.simulate(deal, scenario, 0.01, { paths: 10000, seed: 42 });
  const b = Engine.simulate(deal, scenario, 0.01, { paths: 10000, seed: 42 });
  assert.deepEqual(a, b);
});

test("simulated failing share matches closed form within sampling error", () => {
  const sim = Engine.simulate(deal, scenario, 0.01, { paths: 10000, seed: 42 });
  const expected = Engine.closedFormShare(0.01, 30); // ~0.2603
  const se = Math.sqrt((expected * (1 - expected)) / 10000);
  assert.ok(Math.abs(sim.shareOfPathsWithFailingYear - expected) < 4 * se);
});

test("unpaid /v1/stress returns 402", () => {
  const res = Api.stress(Api.requestFor(Data.PROPERTIES[0]));
  assert.equal(res.status, 402);
});

test("agent never exceeds its cap", () => {
  const r = Api.agentScan(5);
  assert.ok(r.spentUsd <= 5);
  assert.equal(r.analyzed.length, 4);
});
