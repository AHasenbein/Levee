import { rng } from "./engine.js"

// Illustrative sample path: only the choice of flood years is drawn here (seeded);
// the DSCR values come from the paid engine response.
export function samplePath(baseDscr: number, stressedDscr: number, probPerYear: number, years: number, seed: number) {
  const r = rng(seed)
  return Array.from({ length: years }, (_, i) => {
    const flood = r() < probPerYear
    return { year: i + 1, flood, dscr: flood ? stressedDscr : baseDscr }
  })
}

// First seed whose path shows 1-2 flood years, so in-zone properties show a hit by default.
export function pickSeed(probPerYear: number, years: number): number {
  if (probPerYear < 0.005) return 7
  for (let s = 1; s < 500; s++) {
    const n = samplePath(1, 0, probPerYear, years, s).filter((o) => o.flood).length
    if (n >= 1 && n <= 2) return s
  }
  return 7
}
