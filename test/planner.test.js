import test from "node:test"
import assert from "node:assert/strict"
import { plan, estimateDeal, dealForRoute, PlanInputError } from "../src/lib/planner.js"
import { addressFromInput } from "../src/lib/zillow.js"
import { PLAN_ASSUMPTIONS, ASSUMPTIONS } from "../src/lib/data.js"
import { debtServiceFromLoan, evaluate } from "../src/lib/engine.js"

const P = (k) => PLAN_ASSUMPTIONS[k].value
const route = (r, id) => r.routes.find((x) => x.id === id)

test("every planner assumption lives in data.js, is labeled, and fractions are 0-1 (never percents)", () => {
  const r = plan({ savingsUsd: 60000, priceUsd: 300000 })
  assert.deepEqual(r.assumptions.map((a) => a.name), Object.keys(PLAN_ASSUMPTIONS))
  for (const [name, a] of Object.entries(PLAN_ASSUMPTIONS)) {
    assert.ok(typeof a.basis === "string" && a.basis.length > 5, name)
    assert.ok(Number.isFinite(a.value), name)
    if (/(Rate|Fraction|Share|Markup|Yield)$/.test(name) || name === "rentToPriceMonthly") assert.ok(a.value >= 0 && a.value <= 1, name)
  }
  assert.equal(r.disclaimer, "Educational estimates, not financial advice.")
})

test("estimateDeal: exact figures for a managed rental ($300k, $2,600/mo rent, 25% down)", () => {
  const e = estimateDeal({ priceUsd: 300000, monthlyRentUsd: 2600, downPaymentFraction: 0.25, mortgageRate: 0.065, managementShareOfRent: 0.10 })
  // rent: 12 * 2600 * (1 - 5% vacancy); costs: 1.9% tax + 12 * 2600 * (8% repairs + 10% management); insurance 0.7%
  assert.equal(e.deal.annualRentUsd, 29640)
  assert.equal(e.deal.otherOperatingCostsUsdPerYear, 5700 + 5616)
  assert.equal(e.deal.insuranceUsdPerYear, 2100)
  const ref = debtServiceFromLoan({ priceUsd: 300000, downPaymentFraction: 0.25, annualRate: 0.065, termYears: P("termYears") })
  assert.equal(e.deal.debtServiceUsdPerYear, ref.annualDebtServiceUsd)
  assert.equal(e.deal.holdYears, ASSUMPTIONS.holdYears.value)
  assert.equal(e.rentEstimated, false)
  assert.equal(e.downPaymentUsd, 75000)
})

test("estimateDeal: unknown rent is estimated from price and flagged", () => {
  const e = estimateDeal({ priceUsd: 300000 })
  assert.equal(e.rentEstimated, true)
  assert.equal(e.monthlyRentUsd, 2250) // 0.75% of price per month
})

test("estimateDeal: money lands on whole cents", () => {
  const e = estimateDeal({ priceUsd: 287654.32, monthlyRentUsd: 2431.17 })
  for (const v of [e.deal.annualRentUsd, e.deal.otherOperatingCostsUsdPerYear, e.deal.insuranceUsdPerYear, e.deal.debtServiceUsdPerYear]) {
    assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, String(v))
  }
})

test("plan: cash needed is down payment + closing + repair buffer + reserve months of costs", () => {
  const r = plan({ savingsUsd: 90000, priceUsd: 300000, monthlyRentUsd: 2600 })
  const m = route(r, "managed")
  const monthly = (m.deal.otherOperatingCostsUsdPerYear + m.deal.insuranceUsdPerYear + m.deal.debtServiceUsdPerYear) / 12
  const expected = 300000 * (P("rentalDownPaymentFraction") + P("closingCostShare") + P("repairBufferShare")) + P("reserveMonths") * monthly
  assert.ok(Math.abs(m.cashNeededUsd - expected) <= 0.06, `${m.cashNeededUsd} vs ${expected}`) // monthly cost is rounded to a cent, six times
  assert.equal(m.ready, 90000 >= m.cashNeededUsd)
  assert.equal(m.shortfallUsd, Math.max(0, Math.round((m.cashNeededUsd - 90000) * 100) / 100))
})

test("plan: REIT needs no cash and income is savings * yield / 12", () => {
  const r = plan({ savingsUsd: 60000, priceUsd: 300000 })
  const reit = route(r, "reit")
  assert.equal(reit.cashNeededUsd, 0)
  assert.equal(reit.monthlyUsd, Math.round((60000 * P("reitYield")) / 12))
  assert.equal(reit.floodYear, null)
})

test("plan: house hack needs the least cash to own, and counts only the tenant's share of rent", () => {
  const r = plan({ savingsUsd: 60000, priceUsd: 300000, monthlyRentUsd: 3000 })
  assert.equal(r.cheapest.id, "househack")
  assert.ok(r.cheapest.cashNeededUsd < r.priciestCashNeededUsd)
  const full = estimateDeal({ priceUsd: 300000, monthlyRentUsd: 3000 })
  const half = estimateDeal({ priceUsd: 300000, monthlyRentUsd: 3000, collectedRentShare: 0.5 })
  assert.equal(half.deal.annualRentUsd * 2, full.deal.annualRentUsd)
})

test("plan: turnkey costs more than a plain managed rental", () => {
  const r = plan({ savingsUsd: 90000, priceUsd: 300000 })
  assert.ok(route(r, "turnkey").priceUsd > route(r, "managed").priceUsd)
  assert.ok(route(r, "turnkey").cashNeededUsd > route(r, "managed").cashNeededUsd)
})

test("plan: flood year uses the engine and is never better than a normal year", () => {
  const r = plan({ savingsUsd: 80000, priceUsd: 350000 })
  for (const x of r.routes.filter((q) => q.floodYear)) {
    assert.ok(x.floodYear.dscr < x.baseDscr, x.id)
    const again = evaluate(x.deal, { vacantMonths: ASSUMPTIONS.vacantMonths.value, deductibleUsd: ASSUMPTIONS.deductibleUsd.value, uninsuredRepairUsd: ASSUMPTIONS.uninsuredRepairUsd.value, premiumMultiplier: ASSUMPTIONS.premiumMultiplier.value })
    assert.equal(x.floodYear.dscr, again.dscr)
    assert.equal(x.floodYear.outOfPocketUsd, again.outOfPocketUsd)
  }
})

test("plan: same input, same output", () => {
  const a = { savingsUsd: 50000, priceUsd: 280000, monthlyRentUsd: 2400 }
  assert.deepEqual(plan(a), plan({ ...a }))
})

test("plan: bad input is rejected, not silently replaced with a default", () => {
  assert.throws(() => plan({ savingsUsd: -1, priceUsd: 300000 }), PlanInputError)
  assert.throws(() => plan({ savingsUsd: 1000, priceUsd: 0 }), PlanInputError)
  assert.throws(() => plan({ savingsUsd: 1000, priceUsd: NaN }), PlanInputError)
  assert.throws(() => plan({ savingsUsd: 1000, priceUsd: 300000, monthlyRentUsd: -5 }), PlanInputError)
  assert.throws(() => plan({ savingsUsd: 1e12, priceUsd: 300000 }), PlanInputError)
  assert.doesNotThrow(() => plan({ savingsUsd: 0, priceUsd: 300000 }))
})

test("dealForRoute: checking a real home gives the same deal the plan showed for that route and inputs", () => {
  const input = { savingsUsd: 90000, priceUsd: 310000, monthlyRentUsd: 2700 }
  const r = plan(input)
  for (const id of ["househack", "managed", "turnkey"]) {
    assert.deepEqual(dealForRoute(id, { priceUsd: input.priceUsd, monthlyRentUsd: input.monthlyRentUsd }), route(r, id).deal, id)
  }
})

test("dealForRoute: REIT and unknown routes are rejected, and so is a bad price", () => {
  assert.throws(() => dealForRoute("reit", { priceUsd: 300000 }), PlanInputError)
  assert.throws(() => dealForRoute("nope", { priceUsd: 300000 }), PlanInputError)
  assert.throws(() => dealForRoute("managed", { priceUsd: 0 }), PlanInputError)
  assert.throws(() => dealForRoute("managed", { priceUsd: 300000, monthlyRentUsd: -1 }), PlanInputError)
})

test("zillow link -> address from the URL text; other input is unchanged; malformed links do not throw", () => {
  assert.equal(addressFromInput("https://www.zillow.com/homedetails/6900-Onion-Creek-Dr-Austin-TX-78744/29491234_zpid/"), "6900 Onion Creek Dr Austin, TX 78744")
  assert.equal(addressFromInput("  900 Barton Springs Rd "), "900 Barton Springs Rd")
  assert.equal(addressFromInput("https://www.zillow.com/homedetails/%E0%A4%A-Austin-TX-78744/1_zpid/"), "https://www.zillow.com/homedetails/%E0%A4%A-Austin-TX-78744/1_zpid/")
  assert.equal(addressFromInput(undefined), "")
})
