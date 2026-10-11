// Tiny key-value store. Netlify Blobs when deployed on Netlify (state survives between serverless invocations),
// otherwise memory. Not transactional: fine for demo-scale mock payments, not for real money.
const mem = new Map()
let blobs
async function remote() {
  if (blobs !== undefined) return blobs
  blobs = null
  if (process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY) {
    try { blobs = (await import("@netlify/blobs")).getStore({ name: "levee", consistency: "strong" }) } catch { blobs = null }
  }
  return blobs
}
export const store = {
  async get(key) { const b = await remote(); return b ? b.get(key, { type: "json" }) : (mem.get(key) ?? null) },
  async set(key, value) { const b = await remote(); if (b) await b.setJSON(key, value); else mem.set(key, value) },
  async list(prefix) {
    const b = await remote()
    if (b) return (await b.list({ prefix })).blobs.map((x) => x.key)
    return [...mem.keys()].filter((k) => k.startsWith(prefix))
  },
}
