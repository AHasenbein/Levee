// Subscription billing integration: API-key identity, entitlement gate, usage metering, hosted pricing/portal sessions.
// The billing SDK package and class names come from the environment (BILLING_SDK_PACKAGE / BILLING_SDK_CLASS) and the SDK is loaded lazily and every call degrades safely: if the service (or an unpublished plan) is unavailable,
// the paywall falls back to pay-per-call (x402) instead of failing the request.
import crypto from "node:crypto"

const KEY_SECRET = process.env.API_KEY_SECRET ?? "levee-dev-only-secret"
const mac = (userId) => crypto.createHmac("sha256", KEY_SECRET).update(userId).digest("base64url").slice(0, 22)

export function issueKey() {
  const userId = "u_" + crypto.randomBytes(10).toString("hex")
  return { userId, apiKey: `lev_${userId}.${mac(userId)}` }
}

export function userFromAuth(header) {
  const m = /^Bearer lev_(u_[0-9a-f]{20})\.([A-Za-z0-9_-]{22})$/.exec(header ?? "")
  if (!m) return null
  const a = Buffer.from(m[2]), b = Buffer.from(mac(m[1]))
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null
}

const code = (r) => (typeof r === "string" ? r : r?.code ?? r?.category ?? "UNKNOWN")

export function createBilling({ client, enabled, env = process.env } = {}) {
  const on = enabled ?? (!!env.MONETIZATION_APP_ID && env.BILLING !== "off")
  const appId = env.MONETIZATION_APP_ID ?? null
  let sdk = client
  let freePlanId
  const stats = { entitlementChecks: 0, eventsAccepted: 0, eventsFailed: 0, subscribed: 0, subscribeBlocked: null, lastError: null }
  const subscribed = new Set()
  const get = async () => {
    if (sdk) return sdk
    if (!env.BILLING_SDK_PACKAGE || !env.BILLING_SDK_CLASS) throw new Error("Billing SDK is not configured")
    const mod = await import(env.BILLING_SDK_PACKAGE)
    return (sdk = new mod[env.BILLING_SDK_CLASS]({ appId }))
  }
  const urls = { returnUrl: env.APP_URL ?? "http://localhost:5173/", refreshUrl: env.APP_URL ?? "http://localhost:5173/" }

  async function ensureFree(userId) {
    if (subscribed.has(userId)) return
    const m = await get()
    if (!freePlanId) {
      const { plans } = await m.listPlans()
      const p = plans.find((x) => x.definition.isDefault) ?? plans.find((x) => x.definition.name === "Free")
      if (!p) throw new Error("No free plan found")
      freePlanId = p.planId
    }
    try {
      await m.createSubscriptionCheckoutSession(userId, freePlanId, urls)
      subscribed.add(userId); stats.subscribed++; stats.subscribeBlocked = null
    } catch (e) {
      stats.subscribeBlocked = `${e.name}: ${String(e.message).slice(0, 120)}`
      throw e
    }
  }

  // Returns { decision: 'ALLOW' | 'DENY' | 'UNAVAILABLE', reason, planId?, metrics? }
  async function gate(userId, eventType) {
    if (!on) return { decision: "UNAVAILABLE", reason: "billing disabled" }
    try {
      const m = await get()
      let r = await m.checkEntitlement(userId, { eventType }); stats.entitlementChecks++
      if (r.decision === "DENY" && code(r.reason) === "NO_SUBSCRIPTION") {
        await ensureFree(userId)
        r = await m.checkEntitlement(userId, { eventType }); stats.entitlementChecks++
      }
      return { decision: r.decision, reason: code(r.reason), planId: r.planId, suggestedPlanId: r.suggestedPlanId, metrics: r.metrics }
    } catch (e) {
      stats.lastError = `${e.name}: ${String(e.message).slice(0, 120)}`
      return { decision: "UNAVAILABLE", reason: stats.lastError }
    }
  }

  // Fire-and-forget usage event. Never blocks or fails the request.
  function meter(userId, eventType, properties = {}) {
    if (!on) return
    get().then(async (m) => {
      await m.putEvent(userId, { eventType, quantity: "1", properties })
      await m.flush(); stats.eventsAccepted++
    }).catch((e) => { stats.eventsFailed++; stats.lastError = `${e.name}: ${String(e.message).slice(0, 120)}` })
  }

  const pricingUrl = async (userId) => (await (await get()).createPricingSession(userId, urls)).pricingUrl
  const portalUrl = async (userId) => (await (await get()).createBillingPortalSession(userId, urls)).billingPortalUrl

  const status = () => ({
    enabled: on, identity: appId ? (appId.endsWith("/sandbox") ? "sandbox" : "live") : null,
    appIdSuffix: appId ? appId.split("/").filter((s) => s !== "sandbox").pop().slice(-6) : null,
    ...stats,
  })

  return { enabled: on, gate, meter, pricingUrl, portalUrl, status, identify: (c) => userFromAuth(c.req.header("Authorization")) }
}
