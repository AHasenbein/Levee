// Builds data/properties.json from live FEMA NFHL + Census geocoder lookups.
// Run once at build time: `npm run build-cache`. The demo reads only the cache.
import { writeFileSync, mkdirSync } from "node:fs"
import { floodProbability, inAustinScope } from "../src/lib/zones.js"
import { geocode, femaZone } from "../server/lookup.js"
import { rng } from "../src/lib/engine.js"

// Hand-set deals for the featured five so the demo story is stable. All deal inputs are demo values.
const FEATURED = [
  { address: "6900 Onion Creek Dr, Austin, TX", label: "Duplex, Onion Creek", deal: [30000, 7000, 2000, 16000] },
  { address: "900 Barton Springs Rd, Austin, TX", label: "Bungalow, Zilker", deal: [36000, 8000, 2400, 15000] },
  { address: "7800 Shoal Creek Blvd, Austin, TX", label: "Condo, Allandale", deal: [28000, 6500, 1800, 14000] },
  { address: "1300 E 7th St, Austin, TX", label: "House, East Austin", deal: [48000, 9000, 2800, 12000] },
  { address: "2900 Montopolis Dr, Austin, TX", label: "Fourplex, Montopolis", deal: [33000, 7500, 2200, 17500] },
]

// More candidates for the Deal Finder's pool. Anything that fails to geocode is skipped.
const POOL = [
  "5600 Burleson Rd, Austin, TX", "3500 Manchaca Rd, Austin, TX", "1800 E Riverside Dr, Austin, TX",
  "4700 E Riverside Dr, Austin, TX", "1100 Shoal Creek Blvd, Austin, TX", "2700 Hemphill Park, Austin, TX",
  "1900 E Oltorf St, Austin, TX", "5300 Ed Bluestein Blvd, Austin, TX", "3300 S Congress Ave, Austin, TX",
  "1200 W 6th St, Austin, TX", "1405 Old Bastrop Hwy, Austin, TX", "9200 Brodie Ln, Austin, TX",
  "6700 Onion Creek Dr, Austin, TX", "7100 Onion Creek Dr, Austin, TX", "1500 Barton Springs Rd, Austin, TX",
  "800 Barton Springs Rd, Austin, TX", "2200 Barton Springs Rd, Austin, TX", "1000 Barton Springs Rd, Austin, TX",
  "4200 Williamson Creek Dr, Austin, TX", "2800 Slaughter Ln, Austin, TX",
]
const MAX_POOL = 15
const rand = rng(2026)
const between = (a, b) => a + (b - a) * rand()
const round50 = (n) => Math.round(n / 50) * 50

async function lookup(address, label, dealTuple) {
  const g = await geocode(address)
  if (!g || !inAustinScope(g.lat, g.lon)) return null
  const f = await femaZone(g.lat, g.lon)
  if (!f) return null
  const flood = { ...f, ...floodProbability({ zone: f.zone, subtype: f.subtype, sfha: f.sfha }) }
  let [rent, other, ins, debt] = dealTuple ?? []
  if (!dealTuple) {
    rent = round50(between(24000, 52000))
    other = round50(rent * between(0.2, 0.27))
    ins = round50(between(1400, 2600) * (flood.inFloodZone ? 1.3 : 1))
    debt = round50(rent * between(0.4, 0.62))
  }
  return {
    address: g.matchedAddress, label: label ?? g.matchedAddress, lat: g.lat, lon: g.lon, flood,
    deal: { annualRentUsd: rent, otherOperatingCostsUsdPerYear: other, insuranceUsdPerYear: ins, debtServiceUsdPerYear: debt, holdYears: 30 },
    dealBasis: "Demo deal inputs, not real listing data",
  }
}

const out = []
for (const f of FEATURED) {
  const r = await lookup(f.address, f.label, f.deal)
  if (!r) throw new Error("Featured address failed lookup: " + f.address)
  out.push({ id: "p" + (out.length + 1), featured: true, ...r })
  console.log("featured", r.address, r.flood.zone, r.flood.probPerYear)
}
for (const a of POOL) {
  if (out.length >= FEATURED.length + MAX_POOL) break
  try {
    const r = await lookup(a)
    if (r && !out.some((o) => o.address === r.address)) {
      out.push({ id: "p" + (out.length + 1), featured: false, ...r })
      console.log("pool    ", r.address, r.flood.zone, r.flood.probPerYear)
    }
  } catch (e) { console.log("skip", a, e.message) }
}
mkdirSync("data", { recursive: true })
writeFileSync("data/properties.json", JSON.stringify({
  builtAt: new Date().toISOString(),
  sources: ["US Census Geocoder (Public_AR_Current)", "FEMA NFHL MapServer layer 28 (S_FLD_HAZ_AR)"],
  properties: out,
}, null, 2))
console.log("wrote", out.length, "properties;", out.filter((o) => o.flood.inFloodZone).length, "in a flood zone")
