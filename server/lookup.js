// Live address -> flood zone lookup via the US Census geocoder and FEMA NFHL. Server-side only (CORS, caching).
const GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
const NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"

async function getJson(url, ms = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
  return res.json()
}

export async function geocode(address) {
  const url = `${GEOCODER}?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`
  const j = await getJson(url)
  const m = j?.result?.addressMatches?.[0]
  if (!m) return null
  return { matchedAddress: m.matchedAddress, lat: m.coordinates.y, lon: m.coordinates.x }
}

export async function femaZone(lat, lon) {
  const url = `${NFHL}?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json`
  const j = await getJson(url, 25000)
  const a = j?.features?.[0]?.attributes
  if (!a) return null
  return { zone: a.FLD_ZONE, subtype: a.ZONE_SUBTY, sfha: a.SFHA_TF === "T", source: "FEMA NFHL", queriedAt: new Date().toISOString() }
}
