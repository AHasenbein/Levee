// Input validation for /v1/stress. Probabilities are 0-1, never percents.
export class ValidationError extends Error {}

const num = (v, name, { min = -Infinity, max = Infinity, int = false } = {}) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${name} must be a number`)
  if (int && !Number.isInteger(v)) throw new ValidationError(`${name} must be an integer`)
  if (v < min || v > max) throw new ValidationError(`${name} must be between ${min} and ${max}`)
  return v
}

export function parseStressRequest(body) {
  if (!body || typeof body !== "object") throw new ValidationError("JSON body required")
  const { deal, hazard, scenario, simulation } = body
  if (!deal || !hazard || !scenario) throw new ValidationError("deal, hazard and scenario are required")
  return {
    deal: {
      annualRentUsd: num(deal.annualRentUsd, "deal.annualRentUsd", { min: 0, max: 1e7 }),
      otherOperatingCostsUsdPerYear: num(deal.otherOperatingCostsUsdPerYear, "deal.otherOperatingCostsUsdPerYear", { min: 0, max: 1e7 }),
      insuranceUsdPerYear: num(deal.insuranceUsdPerYear, "deal.insuranceUsdPerYear", { min: 0, max: 1e6 }),
      debtServiceUsdPerYear: num(deal.debtServiceUsdPerYear, "deal.debtServiceUsdPerYear", { min: 1, max: 1e7 }),
      holdYears: num(deal.holdYears ?? 30, "deal.holdYears", { min: 1, max: 50, int: true }),
    },
    hazard: {
      type: hazard.type === "flood" ? "flood" : (() => { throw new ValidationError("hazard.type must be 'flood' (v1 supports flood only)") })(),
      annualProbability: num(hazard.annualProbability, "hazard.annualProbability (0 to 1, not a percent)", { min: 0, max: 1 }),
      zone: typeof hazard.zone === "string" ? hazard.zone.slice(0, 120) : "unspecified",
      basis: typeof hazard.basis === "string" ? hazard.basis.slice(0, 200) : undefined,
    },
    scenario: {
      vacantMonths: num(scenario.vacantMonths, "scenario.vacantMonths", { min: 0, max: 12 }),
      deductibleUsd: num(scenario.deductibleUsd, "scenario.deductibleUsd", { min: 0, max: 1e7 }),
      uninsuredRepairUsd: num(scenario.uninsuredRepairUsd, "scenario.uninsuredRepairUsd", { min: 0, max: 1e7 }),
      premiumMultiplier: num(scenario.premiumMultiplier, "scenario.premiumMultiplier", { min: 0.1, max: 10 }),
    },
    simulation: {
      paths: num(simulation?.paths ?? 10000, "simulation.paths", { min: 100, max: 100000, int: true }),
      seed: num(simulation?.seed ?? 42, "simulation.seed", { min: 0, max: 2 ** 31, int: true }),
    },
  }
}
