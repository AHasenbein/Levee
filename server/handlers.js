// Pure engine-facing handlers. No model call touches a number.
import * as Engine from "../src/lib/engine.js"
import { ASSUMPTIONS } from "../src/lib/data.js"

export function assumptionsList(req) {
  const list = Object.entries(ASSUMPTIONS).map(([name, a]) => ({ name, value: a.value, basis: a.basis }))
  const used = [
    { name: "hazard.annualProbability", value: req.hazard.annualProbability, basis: req.hazard.basis ?? "supplied by caller" },
    { name: "hazard.zone", value: req.hazard.zone, basis: "FEMA NFHL lookup or caller" },
    { name: "scenario.vacantMonths", value: req.scenario.vacantMonths, basis: "scenario input" },
    { name: "scenario.deductibleUsd", value: req.scenario.deductibleUsd, basis: "scenario input" },
    { name: "scenario.uninsuredRepairUsd", value: req.scenario.uninsuredRepairUsd, basis: "scenario input" },
    { name: "scenario.premiumMultiplier", value: req.scenario.premiumMultiplier, basis: "scenario input; v1 has no premium model" },
    { name: "simulation.paths", value: req.simulation.paths, basis: "request" },
    { name: "simulation.seed", value: req.simulation.seed, basis: "request" },
  ]
  return [...used, ...list.filter((a) => !["vacantMonths", "deductibleUsd", "uninsuredRepairUsd", "premiumMultiplier", "paths", "seed", "holdYears"].includes(a.name))]
}

export function runStress(req) {
  const base = Engine.evaluate(req.deal, null)
  const stressed = Engine.evaluate(req.deal, req.scenario)
  const simulation = Engine.simulate(req.deal, req.scenario, req.hazard.annualProbability, req.simulation)
  // The closed form only equals the simulation when the base year passes and a flood always breaks it.
  const closedFormValid = base.dscr >= 1 && stressed.dscr < 1
  return {
    base: { noiUsd: base.noiUsd, dscr: base.dscr },
    stressed,
    simulation: {
      ...simulation,
      closedFormShare: closedFormValid ? Engine.closedFormShare(req.hazard.annualProbability, req.deal.holdYears) : null,
      closedFormValid,
    },
    assumptions: assumptionsList(req),
  }
}
