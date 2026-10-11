// Accounts via Google Sign-In. The browser gets a signed Google ID token; we verify it here (RS256 signature against
// Google's published keys, audience, issuer, expiry, verified email) and map the Google account (`sub`) to the same userId
// the API key carries, so credits, plan quota, the free trial and metering keep working unchanged.
// No passwords are stored. Not included: key revocation (keys are derived from the userId).
import crypto from "node:crypto"
import { store } from "./store.js"
import { keyFor } from "./billing.js"

export class AccountError extends Error {
  constructor(message, status = 401) { super(message); this.status = status }
}

export const googleClientId = () => process.env.GOOGLE_CLIENT_ID || null
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"])
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"

let certCache = { keys: null, at: 0 }
async function googleKeys() {
  if (certCache.keys && Date.now() - certCache.at < 3600e3) return certCache.keys
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error("Google keys unavailable")
  certCache = { keys: (await res.json()).keys, at: Date.now() }
  return certCache.keys
}

const b64json = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"))

// Returns { sub, email, name } or throws AccountError. `getKeys` and `now` are injectable for tests.
export async function verifyGoogleToken(idToken, { clientId = googleClientId(), getKeys = googleKeys, now = Date.now() } = {}) {
  if (!clientId) throw new AccountError("Google sign-in is not configured on this server", 503)
  const parts = typeof idToken === "string" && idToken.length < 4096 ? idToken.split(".") : []
  if (parts.length !== 3) throw new AccountError("Invalid Google credential")
  let header, claims
  try { header = b64json(parts[0]); claims = b64json(parts[1]) } catch { throw new AccountError("Invalid Google credential") }
  if (header.alg !== "RS256") throw new AccountError("Invalid Google credential")
  let keys
  try { keys = await getKeys() } catch { throw new AccountError("Could not reach Google to verify sign-in", 502) }
  const jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new AccountError("Invalid Google credential")
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))
  if (!ok) throw new AccountError("Invalid Google credential")
  if (claims.aud !== clientId || !ISSUERS.has(claims.iss) || !(claims.exp * 1000 > now) || !claims.sub) throw new AccountError("Invalid Google credential")
  if (claims.email_verified !== true || typeof claims.email !== "string") throw new AccountError("Your Google email is not verified")
  return { sub: String(claims.sub), email: claims.email.toLowerCase(), name: typeof claims.name === "string" ? claims.name.slice(0, 100) : null }
}

// `claimUserId` is the caller's anonymous identity, if any, so what they already have carries over (first sign-in only).
export async function signInWithGoogle(profile, { claimUserId, newUserId }) {
  const existing = await store.get("gsub:" + profile.sub)
  if (existing) return { userId: existing.userId, email: profile.email, apiKey: keyFor(existing.userId) }
  const userId = claimUserId && !(await store.get("useracct:" + claimUserId)) ? claimUserId : newUserId
  await store.set("gsub:" + profile.sub, { userId, createdAt: Date.now() })
  await store.set("useracct:" + userId, { email: profile.email, name: profile.name })
  return { userId, email: profile.email, apiKey: keyFor(userId) }
}

export const accountFor = async (userId) => (await store.get("useracct:" + userId)) ?? null
