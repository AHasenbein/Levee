// Maps a FEMA NFHL flood zone to an annual flood probability and states the basis.
// Probabilities are 0-1, never percents.
const SFHA_ZONES = new Set(["A", "AE", "AH", "AO", "AR", "A99", "V", "VE"]);

export function floodProbability({ zone, subtype, sfha }) {
  const z = String(zone || "").toUpperCase();
  const inSfha = sfha === true || sfha === "T" || SFHA_ZONES.has(z);
  if (inSfha) {
    return { inFloodZone: true, probPerYear: 0.01, basis: "FEMA definition: Special Flood Hazard Area is the 1-percent annual chance floodplain" };
  }
  if (String(subtype || "").toUpperCase().includes("0.2 PCT")) {
    return { inFloodZone: false, probPerYear: 0.002, basis: "FEMA definition: 0.2-percent annual chance flood hazard" };
  }
  return { inFloodZone: false, probPerYear: 0.002, basis: "Placeholder assumption for minimal-hazard areas (not a FEMA figure)" };
}

// Austin-only scope: rough bounding box around Travis County.
export const AUSTIN_BBOX = { minLat: 30.0, maxLat: 30.65, minLon: -98.1, maxLon: -97.5 };
export const inAustinScope = (lat, lon) =>
  lat >= AUSTIN_BBOX.minLat && lat <= AUSTIN_BBOX.maxLat && lon >= AUSTIN_BBOX.minLon && lon <= AUSTIN_BBOX.maxLon;
