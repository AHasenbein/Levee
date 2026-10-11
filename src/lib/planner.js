// "How much do I really need to own a rental?" Compares four routes for a first-time buyer.
// Pure and deterministic, built on engine.js (no number comes from anywhere else).
// Educational estimates, not financial advice. Every default below is an assumption shown in the UI.
import { debtServiceFromLoan, evaluate } from "./engine.js";
import { ASSUMPTIONS, scenarioFromAssumptions } from "./data.js";

export const PLAN_ASSUMPTIONS = {
  ratePct: { value: 0.065, basis: "Assumed 30-year mortgage rate; replace with your quote" },
  termYears: { value: 30, basis: "Standard mortgage" },
  rentToPriceMonthly: { value: 0.0075, basis: "Rent rule of thumb when rent is unknown (0.75% of price per month)" },
  taxPctOfPrice: { value: 0.019, basis: "Assumed property tax rate (Texas-like)" },
  insurancePctOfPrice: { value: 0.007, basis: "Assumed landlord insurance" },
  maintenancePctOfRent: { value: 0.08, basis: "Repairs set-aside" },
  vacancyPctOfRent: { value: 0.05, basis: "Empty-unit allowance" },
  closingPctOfPrice: { value: 0.03, basis: "Assumed closing costs" },
  repairBufferPctOfPrice: { value: 0.01, basis: "Day-one fix-up money" },
  reserveMonths: { value: 6, basis: "Months of mortgage and costs kept in the bank" },
  reitYield: { value: 0.04, basis: "Assumed REIT dividend yield; varies, not guaranteed" },
};
const A = (k) => PLAN_ASSUMPTIONS[k].value;

export const ROUTES = [
  { id: "reit", name: "Real-estate funds (REITs)", effort: "None", kind: "fund",
    what: "Buy shares of companies that own rentals. No tenants, no repairs, no deed in your name." },
  { id: "househack", name: "House hack (live in one unit)", effort: "Medium", downPct: 0.035, ratePct: 0.0625, management: 0, ownerOccupiedShare: 0.5,
    what: "Buy a duplex with a small owner-occupant loan, live in one side, rent the other." },
  { id: "managed", name: "Rental + property manager", effort: "Low", downPct: 0.25, management: 0.10,
    what: "Buy a rental and pay a manager about 10% of rent to handle tenants and repairs." },
  { id: "turnkey", name: "Turnkey rental", effort: "Very low", downPct: 0.25, management: 0.10, pricePremium: 0.08,
    what: "Buy an already renovated, rented and managed home. Costs more upfront." },
];

// Price + (optional) rent + financing -> an engine Deal. collectedRentShare < 1 for a house hack.
export function estimateDeal({ priceUsd, monthlyRentUsd, downPct = 0.25, ratePct = A("ratePct"), managementPctOfRent = 0, collectedRentShare = 1 }) {
  if (!(priceUsd > 0)) throw new Error("priceUsd must be positive");
  const rentEstimated = !(monthlyRentUsd > 0);
  const fullRent = rentEstimated ? Math.round(priceUsd * A("rentToPriceMonthly")) : monthlyRentUsd;
  const collected = fullRent * collectedRentShare;
  const { annualDebtServiceUsd, monthlyPaymentUsd } = debtServiceFromLoan({
    priceUsd, downPaymentFraction: downPct, annualRate: ratePct, termYears: A("termYears") });
  const deal = {
    annualRentUsd: Math.round(12 * collected * (1 - A("vacancyPctOfRent"))),
    otherOperatingCostsUsdPerYear: Math.round(priceUsd * A("taxPctOfPrice") + 12 * collected * (A("maintenancePctOfRent") + managementPctOfRent)),
    insuranceUsdPerYear: Math.round(priceUsd * A("insurancePctOfPrice")),
    debtServiceUsdPerYear: annualDebtServiceUsd,
    holdYears: ASSUMPTIONS.holdYears.value,
  };
  return { deal, rentEstimated, monthlyRentUsd: fullRent, monthlyPaymentUsd, downPaymentUsd: Math.round(priceUsd * downPct) };
}

function routeResult(r, { savingsUsd, priceUsd, monthlyRentUsd }) {
  if (r.kind === "fund") {
    return { ...r, cashNeededUsd: 0, ready: true, shortfallUsd: 0,
      monthlyUsd: Math.round((Math.max(0, savingsUsd) * A("reitYield")) / 12), monthlyLabel: "income", floodYear: null };
  }
  const price = Math.round(priceUsd * (1 + (r.pricePremium || 0)));
  const rent = monthlyRentUsd > 0 ? monthlyRentUsd * (1 + (r.pricePremium || 0) / 2) : undefined;
  const est = estimateDeal({ priceUsd: price, monthlyRentUsd: rent, downPct: r.downPct, ratePct: r.ratePct,
    managementPctOfRent: r.management, collectedRentShare: 1 - (r.ownerOccupiedShare || 0) });
  const d = est.deal;
  const base = evaluate(d, null);
  const flood = evaluate(d, scenarioFromAssumptions());
  const monthlyCosts = (d.otherOperatingCostsUsdPerYear + d.insuranceUsdPerYear + d.debtServiceUsdPerYear) / 12;
  const cashNeededUsd = Math.round(price * (r.downPct + A("closingPctOfPrice") + A("repairBufferPctOfPrice")) + A("reserveMonths") * monthlyCosts);
  const monthly = Math.round((base.noiUsd - d.debtServiceUsdPerYear) / 12);
  // House hack: a negative number is what you pay to live there, not a loss on an investment.
  const hack = !!r.ownerOccupiedShare;
  return { ...r, priceUsd: price, cashNeededUsd, ready: savingsUsd >= cashNeededUsd, shortfallUsd: Math.max(0, cashNeededUsd - savingsUsd),
    monthlyUsd: hack && monthly < 0 ? -monthly : monthly, monthlyLabel: hack && monthly < 0 ? "your cost to live there" : "income",
    baseDscr: base.dscr, floodYear: { dscr: flood.dscr, outOfPocketUsd: flood.outOfPocketUsd },
    rentEstimated: est.rentEstimated, deal: d };
}

/** @param {{ savingsUsd?: number, priceUsd?: number, monthlyRentUsd?: number }} [args] */
export function plan({ savingsUsd = 0, priceUsd = 300000, monthlyRentUsd = undefined } = {}) {
  const input = { savingsUsd: Number(savingsUsd) || 0, priceUsd: Number(priceUsd) || 300000, monthlyRentUsd: Number(monthlyRentUsd) || undefined };
  const routes = ROUTES.map((r) => routeResult(r, input));
  const owned = routes.filter((r) => r.kind !== "fund");
  const cheapest = owned.reduce((a, b) => (a.cashNeededUsd < b.cashNeededUsd ? a : b));
  const priciest = owned.reduce((a, b) => (a.cashNeededUsd > b.cashNeededUsd ? a : b));
  return { input, routes, cheapest: { id: cheapest.id, name: cheapest.name, cashNeededUsd: cheapest.cashNeededUsd },
    priciestCashNeededUsd: priciest.cashNeededUsd,
    assumptions: Object.entries(PLAN_ASSUMPTIONS).map(([name, a]) => ({ name, value: a.value, basis: a.basis })),
    disclaimer: "Educational estimates, not financial advice." };
}
