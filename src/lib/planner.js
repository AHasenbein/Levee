// "How much do I really need to own a rental?" Compares four routes for a first-time buyer.
// Pure and deterministic. Every figure comes from engine.js plus the labeled assumptions in data.js (PLAN_ASSUMPTIONS);
// nothing here invents a number. Money is computed in integer cents. Educational estimates, not financial advice.
import { debtServiceFromLoan, evaluate } from "./engine.js"
import { ASSUMPTIONS, PLAN_ASSUMPTIONS, scenarioFromAssumptions } from "./data.js"

export class PlanInputError extends Error {}

const cents = (usd) => Math.round(usd * 100)
const usd = (c) => c / 100
const A = (k) => PLAN_ASSUMPTIONS[k].value

export const ROUTES = [
  { id: "reit", name: "Real-estate funds (REITs)", effort: "None", kind: "fund",
    what: "Buy shares of companies that own rentals. No tenants, no repairs, no deed in your name." },
  { id: "househack", name: "House hack (live in one unit)", effort: "Medium",
    downPaymentFraction: () => A("houseHackDownPaymentFraction"), mortgageRate: () => A("houseHackMortgageRate"),
    managementShareOfRent: () => 0, ownerOccupiedShare: () => A("houseHackOwnerShareOfRent"), priceMarkup: () => 0,
    what: "Buy a duplex with a small owner-occupant loan, live in one side, rent the other." },
  { id: "managed", name: "Rental + property manager", effort: "Low",
    downPaymentFraction: () => A("rentalDownPaymentFraction"), mortgageRate: () => A("mortgageRate"),
    managementShareOfRent: () => A("managementFeeShareOfRent"), ownerOccupiedShare: () => 0, priceMarkup: () => 0,
    what: "Buy a rental and pay a manager a share of rent to handle tenants and repairs." },
  { id: "turnkey", name: "Turnkey rental", effort: "Very low",
    downPaymentFraction: () => A("rentalDownPaymentFraction"), mortgageRate: () => A("mortgageRate"),
    managementShareOfRent: () => A("managementFeeShareOfRent"), ownerOccupiedShare: () => 0, priceMarkup: () => A("turnkeyPriceMarkup"),
    what: "Buy an already renovated, rented and managed home. Costs more upfront." },
]

// Price + (optional) rent + financing -> an engine Deal. collectedRentShare < 1 when you live in part of the property.
export function estimateDeal({ priceUsd, monthlyRentUsd, downPaymentFraction = A("rentalDownPaymentFraction"), mortgageRate = A("mortgageRate"),
  managementShareOfRent = 0, collectedRentShare = 1 }) {
  if (!(priceUsd > 0)) throw new PlanInputError("priceUsd must be positive")
  const priceC = cents(priceUsd)
  const rentEstimated = !(monthlyRentUsd > 0)
  const fullMonthlyRentC = rentEstimated ? Math.round(priceC * A("rentToPriceMonthly")) : cents(monthlyRentUsd)
  const collectedMonthlyC = Math.round(fullMonthlyRentC * collectedRentShare)
  const { annualDebtServiceUsd, monthlyPaymentUsd } = debtServiceFromLoan({ priceUsd, downPaymentFraction, annualRate: mortgageRate, termYears: A("termYears") })
  const deal = {
    annualRentUsd: usd(Math.round(12 * collectedMonthlyC * (1 - A("vacancyShareOfRent")))),
    otherOperatingCostsUsdPerYear: usd(Math.round(priceC * A("propertyTaxRate")) + Math.round(12 * collectedMonthlyC * (A("maintenanceShareOfRent") + managementShareOfRent))),
    insuranceUsdPerYear: usd(Math.round(priceC * A("landlordInsuranceRate"))),
    debtServiceUsdPerYear: annualDebtServiceUsd,
    holdYears: ASSUMPTIONS.holdYears.value,
  }
  return { deal, rentEstimated, monthlyRentUsd: usd(fullMonthlyRentC), monthlyPaymentUsd, downPaymentUsd: usd(Math.round(priceC * downPaymentFraction)) }
}

// The deal for one owned route at a given price and (optional) stated rent. Used by plan() and by "check a real home".
function routeDeal(r, { priceUsd, monthlyRentUsd }) {
  const markup = r.priceMarkup()
  const price = usd(Math.round(cents(priceUsd) * (1 + markup)))
  // A markup on price also lifts the rent a renovated, managed home can ask; only a stated rent is scaled, never an estimate.
  const rent = monthlyRentUsd > 0 ? usd(Math.round(cents(monthlyRentUsd) * (1 + markup / 2))) : undefined
  const downPaymentFraction = r.downPaymentFraction()
  const ownerOccupiedShare = r.ownerOccupiedShare()
  const est = estimateDeal({ priceUsd: price, monthlyRentUsd: rent, downPaymentFraction, mortgageRate: r.mortgageRate(),
    managementShareOfRent: r.managementShareOfRent(), collectedRentShare: 1 - ownerOccupiedShare })
  return { est, price, downPaymentFraction, ownerOccupiedShare }
}

/** Deal for a chosen route and a real home. Throws PlanInputError for an unknown or non-property route. */
export function dealForRoute(routeId, { priceUsd, monthlyRentUsd }) {
  const r = ROUTES.find((x) => x.id === routeId && x.kind !== "fund")
  if (!r) throw new PlanInputError("Unknown route")
  bounded(priceUsd, "priceUsd", { min: 1, max: 1e8 })
  bounded(monthlyRentUsd, "monthlyRentUsd", { min: 1, max: 1e6, allowUndefined: true })
  return routeDeal(r, { priceUsd, monthlyRentUsd }).est.deal
}

function routeResult(r, { savingsUsd, priceUsd, monthlyRentUsd }) {
  const { what, effort, id, name, kind } = r
  if (kind === "fund") {
    return { id, name, effort, what, kind, cashNeededUsd: 0, ready: true, shortfallUsd: 0,
      monthlyUsd: usd(Math.round((cents(savingsUsd) * A("reitYield")) / 12)), monthlyLabel: "income", floodYear: null, ownerOccupied: false }
  }
  const { est, price, downPaymentFraction, ownerOccupiedShare } = routeDeal(r, { priceUsd, monthlyRentUsd })
  const d = est.deal
  const base = evaluate(d, null)
  const flood = evaluate(d, scenarioFromAssumptions())
  const monthlyCostsC = Math.round((cents(d.otherOperatingCostsUsdPerYear) + cents(d.insuranceUsdPerYear) + cents(d.debtServiceUsdPerYear)) / 12)
  const upfrontC = Math.round(cents(price) * (downPaymentFraction + A("closingCostShare") + A("repairBufferShare")))
  const cashNeededUsd = usd(upfrontC + A("reserveMonths") * monthlyCostsC)
  const monthlyC = Math.round((cents(base.noiUsd) - cents(d.debtServiceUsdPerYear)) / 12)
  // House hack: a negative number is what you pay to live there, not a loss on an investment.
  const hack = ownerOccupiedShare > 0
  const owes = hack && monthlyC < 0
  return {
    id, name, effort, what, kind, priceUsd: price, cashNeededUsd, ready: savingsUsd >= cashNeededUsd,
    shortfallUsd: Math.max(0, usd(cents(cashNeededUsd) - cents(savingsUsd))),
    monthlyUsd: usd(owes ? -monthlyC : monthlyC), monthlyLabel: owes ? "cost to live there" : "income",
    baseDscr: base.dscr, floodYear: { dscr: flood.dscr, outOfPocketUsd: flood.outOfPocketUsd },
    rentEstimated: est.rentEstimated, deal: d,
    ownerOccupied: hack,
  }
}

const bounded = (v, name, { min, max, allowUndefined = false }) => {
  if (v === undefined && allowUndefined) return undefined
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new PlanInputError(`${name} must be a number between ${min} and ${max}`)
  return v
}

/** @param {{ savingsUsd?: number, priceUsd?: number, monthlyRentUsd?: number }} [args] */
export function plan({ savingsUsd = 0, priceUsd = 300000, monthlyRentUsd = undefined } = {}) {
  const input = {
    savingsUsd: bounded(savingsUsd, "savingsUsd", { min: 0, max: 1e9 }),
    priceUsd: bounded(priceUsd, "priceUsd", { min: 1, max: 1e8 }),
    monthlyRentUsd: bounded(monthlyRentUsd, "monthlyRentUsd", { min: 1, max: 1e6, allowUndefined: true }),
  }
  const routes = ROUTES.map((r) => routeResult(r, input))
  const owned = routes.filter((r) => r.kind !== "fund")
  const cheapest = owned.reduce((a, b) => (a.cashNeededUsd <= b.cashNeededUsd ? a : b))
  const priciest = owned.reduce((a, b) => (a.cashNeededUsd >= b.cashNeededUsd ? a : b))
  return {
    input, routes,
    cheapest: { id: cheapest.id, name: cheapest.name, cashNeededUsd: cheapest.cashNeededUsd },
    priciestCashNeededUsd: priciest.cashNeededUsd,
    assumptions: Object.entries(PLAN_ASSUMPTIONS).map(([name, a]) => ({ name, value: a.value, basis: a.basis })),
    disclaimer: "Educational estimates, not financial advice.",
  }
}
