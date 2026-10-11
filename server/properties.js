import * as Engine from "../src/lib/engine.js"
import { scenarioFromAssumptions } from "../src/lib/data.js"

import raw from "../data/properties.json" with { type: "json" }

export const cacheInfo = { builtAt: raw.builtAt, sources: raw.sources }

// Cheap screening numbers computed by the engine (default scenario), for list views.
export const properties = raw.properties.map((p) => {
  const base = Engine.evaluate(p.deal, null)
  const flood = Engine.evaluate(p.deal, scenarioFromAssumptions())
  return { ...p, quick: { baseDscr: base.dscr, baseNoiUsd: base.noiUsd, floodDscr: flood.dscr, floodOutOfPocketUsd: flood.outOfPocketUsd } }
})
export const byId = (id) => properties.find((p) => p.id === id)
export const byAddress = (a) => properties.find((p) => p.address.toLowerCase() === String(a).trim().toLowerCase())
