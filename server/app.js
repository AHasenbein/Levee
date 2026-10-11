import { Hono } from "hono"
import { cors } from "hono/cors"
import { bodyLimit } from "hono/body-limit"
import * as Engine from "../src/lib/engine.js"
import { ASSUMPTIONS, scenarioFromAssumptions } from "../src/lib/data.js"
import { floodProbability, inAustinScope } from "../src/lib/zones.js"
import { parseStressRequest, ValidationError } from "./validate.js"
import { runStress } from "./handlers.js"
import { properties, byAddress, cacheInfo } from "./properties.js"
import * as Pay from "./payments.js"
import { generateMemo, MEMO_MODEL_ID } from "./memo.js"
import { runAgent } from "./agent.js"
import { store } from "./store.js"
import { monetizationStatus } from "./monetization.js"
import { createBilling, issueKey } from "./billing.js"
import { createStripeBilling, createCredits, safeOrigin, PACKS, PLANS } from "./stripe.js"
import { geocode, femaZone } from "./lookup.js"

export function createApp({ billing = createBilling(), stripe = { enabled: false, credits: createCredits() } } = {}) {
  const app = new Hono()
  app.use("*", cors())
  // Basic per-IP rate limit (per instance; a speed bump, not a security boundary).
  const hits = new Map()
  app.use("/v1/*", async (c, next) => {
    if (c.req.path === "/v1/health") return next()
    const ip = c.req.header("x-nf-client-connection-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local"
    const now = Date.now(), win = (hits.get(ip) ?? []).filter((t) => now - t < 60000)
    if (win.length >= (Number(process.env.RATE_LIMIT_PER_MIN) || 120)) return c.json({ error: "Too many requests. Slow down." }, 429)
    win.push(now); hits.set(ip, win)
    if (hits.size > 5000) hits.clear()
    return next()
  })
  app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "Body too large" }, 413) }))
  app.onError((e, c) => {
    if (e instanceof ValidationError) return c.json({ error: e.message }, 400)
    console.error(e)
    return c.json({ error: "Internal error" }, 500)
  })

  const parse = async (c) => {
    const body = await c.req.json().catch(() => { throw new ValidationError("Invalid JSON body") })
    return parseStressRequest(body)
  }

  app.get("/v1/health", (c) => c.json({
    ok: true, paymentsMode: Pay.PAYMENTS_MODE, priceUsd: Pay.PRICE_USD,
    livePayments: Pay.livePayerStatus, memoModel: MEMO_MODEL_ID, memoSource: process.env.MEMO_SOURCE ?? "auto",
    flood: { cacheBuiltAt: cacheInfo.builtAt, sources: cacheInfo.sources, properties: properties.length },
  }))

  app.get("/v1/monetization", (c) => {
    const base = monetizationStatus(), b = billing.status()
    const state = !b.enabled ? "not-configured" : b.subscribeBlocked ? "plans-unpublished" : b.subscribed > 0 ? "active" : "connected"
    return c.json({ ...base, state, billing: b, detail: {
      "not-configured": "Subscription billing is not connected on this deployment. Analyses are pay-per-call or prepaid credits.",
      connected: "Connected to the billing service. Usage is metered and entitlements are checked.",
      active: "Subscriptions are live: new customers join the Free plan automatically.",
      "plans-unpublished": "Connected: usage is metered and entitlements are checked. Subscriptions start when the plans are published. Until then analyses are pay-per-call or prepaid credits.",
    }[state] })
  })

  // Anonymous API-key identity. The key is the customer's billing identity.
  // Free trial analyses, granted once per customer the first time we see them (same as the Free plan).
  const FREE_ANALYSES = Number(process.env.FREE_ANALYSES ?? 3)
  const ensureTrial = async (userId) => {
    if (FREE_ANALYSES <= 0 || (await store.get("trial:" + userId))) return
    await store.set("trial:" + userId, 1)
    await stripe.credits.add(userId, FREE_ANALYSES)
  }
  app.post("/v1/keys", async (c) => {
    const k = issueKey()
    await ensureTrial(k.userId)
    return c.json({ ...k, freeAnalyses: FREE_ANALYSES })
  })

  // Stripe credit packs (test mode). Credits are spent before pay-per-call.
  app.get("/v1/stripe/packs", (c) => c.json({ enabled: stripe.enabled, packs: Object.entries(PACKS).map(([id, p]) => ({ id, ...p })), plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })) }))
  app.get("/v1/credits", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    await ensureTrial(userId)
    const balance = await stripe.credits.balance(userId)
    const plan = stripe.planStatus ? await stripe.planStatus(userId) : null
    return c.json({ balance, plan, total: balance + (plan?.remaining ?? 0) })
  })
  app.post("/v1/stripe/subscribe", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    if (!stripe.enabled) return c.json({ error: "Stripe is not configured on this server" }, 503)
    const { planId } = await c.req.json().catch(() => ({}))
    const origin = safeOrigin(c.req.header("Origin"))
    if (!origin) return c.json({ error: "Unrecognized origin" }, 400)
    if (!PLANS[planId] || PLANS[planId].priceCents <= 0) throw new ValidationError("Unknown plan")
    try { return c.json(await stripe.subscribe(userId, planId, origin)) } catch (e) { return c.json({ error: "Could not start checkout", detail: String(e.message).slice(0, 160) }, 502) }
  })
  app.post("/v1/stripe/portal", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    if (!stripe.enabled) return c.json({ error: "Stripe is not configured on this server" }, 503)
    const origin = safeOrigin(c.req.header("Origin"))
    if (!origin) return c.json({ error: "Unrecognized origin" }, 400)
    try { return c.json(await stripe.portal(userId, origin)) } catch (e) { return c.json({ error: "Subscription management is unavailable: " + String(e.message).slice(0, 120) }, 502) }
  })
  app.post("/v1/stripe/checkout", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    if (!stripe.enabled) return c.json({ error: "Stripe is not configured on this server" }, 503)
    const { packId } = await c.req.json().catch(() => ({}))
    const origin = safeOrigin(c.req.header("Origin"))
    if (!origin) return c.json({ error: "Unrecognized origin" }, 400)
    if (!PACKS[packId]) throw new ValidationError("Unknown pack")
    try { return c.json(await stripe.checkout(userId, packId, origin)) } catch (e) { return c.json({ error: "Could not start checkout", detail: String(e.message).slice(0, 160) }, 502) }
  })
  app.post("/v1/stripe/confirm", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    if (!stripe.enabled) return c.json({ error: "Stripe is not configured on this server" }, 503)
    const { sessionId } = await c.req.json().catch(() => ({}))
    if (typeof sessionId !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new ValidationError("Invalid session id")
    try { return c.json(await stripe.confirm(userId, sessionId)) } catch (e) { return c.json({ error: String(e.message).slice(0, 160) }, 400) }
  })

  app.get("/v1/billing/me", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    const gates = {}
    for (const e of ["stress_analysis", "deal_memo", "agent_scan"]) gates[e] = await billing.gate(userId, e)
    return c.json({ userId, gates })
  })
  app.post("/v1/billing/pricing-session", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    try { return c.json({ url: await billing.pricingUrl(userId) }) } catch (e) { return c.json({ error: "Pricing page unavailable", detail: e.message }, 502) }
  })
  app.post("/v1/billing/portal-session", async (c) => {
    const userId = billing.identify(c)
    if (!userId) return c.json({ error: "Missing or invalid API key" }, 401)
    try { return c.json({ url: await billing.portalUrl(userId) }) } catch (e) { return c.json({ error: "Billing portal unavailable", detail: e.message }, 502) }
  })

  app.get("/v1/assumptions", (c) => c.json({
    assumptions: Object.entries(ASSUMPTIONS).map(([name, a]) => ({ name, value: a.value, basis: a.basis })),
    defaultScenario: scenarioFromAssumptions(),
  }))

  app.get("/v1/properties", (c) => c.json({ properties, cache: cacheInfo, defaultScenario: scenarioFromAssumptions() }))

  // Live address lookup (Census geocoder + FEMA NFHL). Cached properties are returned without a network call.
  app.get("/v1/lookup", async (c) => {
    const address = (c.req.query("address") ?? "").trim()
    if (address.length < 5 || address.length > 200) return c.json({ error: "Enter a street address in Austin, TX" }, 400)
    const cached = byAddress(address)
    if (cached) return c.json({ source: "cache", address: cached.address, lat: cached.lat, lon: cached.lon, flood: cached.flood, propertyId: cached.id })
    let g
    try { g = await geocode(/austin/i.test(address) ? address : `${address}, Austin, TX`) }
    catch (e) { return c.json({ error: "Geocoder unavailable. Try a featured property instead.", detail: e.message }, 502) }
    if (!g) return c.json({ error: "Address not found. Check the street number and name." }, 404)
    if (!inAustinScope(g.lat, g.lon)) return c.json({ error: "This demo covers Austin, TX only.", matched: g.matchedAddress }, 422)
    try {
      const f = await femaZone(g.lat, g.lon)
      if (!f) return c.json({ error: "FEMA has no flood map data at this location." }, 404)
      return c.json({ source: "live", address: g.matchedAddress, lat: g.lat, lon: g.lon, flood: { ...f, ...floodProbability({ zone: f.zone, subtype: f.subtype, sfha: f.sfha }) } })
    } catch (e) {
      return c.json({ error: "FEMA flood map service unavailable. Try a featured property instead.", detail: e.message }, 502)
    }
  })

  // Helper: monthly payment calculator (pure engine formula).
  app.post("/v1/loan", async (c) => {
    const b = await c.req.json().catch(() => ({}))
    const { priceUsd, downPaymentFraction, annualRate, termYears } = b
    if (![priceUsd, downPaymentFraction, annualRate, termYears].every(Number.isFinite) || priceUsd <= 0 || termYears < 1 || termYears > 40 || downPaymentFraction < 0 || downPaymentFraction >= 1 || annualRate < 0 || annualRate > 0.3) {
      throw new ValidationError("priceUsd, downPaymentFraction (0 to <1), annualRate (0 to 0.3, not a percent) and termYears are required")
    }
    return c.json(Engine.debtServiceFromLoan({ priceUsd, downPaymentFraction, annualRate, termYears }))
  })

  // The paid endpoint. Unpaid => HTTP 402 with x402 payment instructions.
  app.post("/v1/stress", async (c) => {
    const req = await parse(c)
    const resource = new URL(c.req.url).pathname
    const userId = billing.identify(c)
    let payment, sub
    // 1. A signed-in customer within their plan quota is served from the subscription.
    if (userId) {
      sub = await billing.gate(userId, "stress_analysis")
      if (sub.decision === "ALLOW") payment = { mode: "subscription", receiptId: null, plan: sub.planId ?? null }
    }
    if (userId) await ensureTrial(userId)
    // 2. Paid monthly plan quota (Stripe subscription), then prepaid credits.
    if (!payment && userId && stripe.consumePlan) {
      const p = await stripe.consumePlan(userId)
      if (p) payment = { mode: "plan", receiptId: null, plan: p.plan, used: p.used, quota: p.quota }
    }
    if (!payment && userId && (await stripe.credits.consume(userId))) payment = { mode: "credit", receiptId: null, creditsLeft: await stripe.credits.balance(userId) }
    // 3. Otherwise pay per call over x402.
    if (!payment) {
      if (Pay.PAYMENTS_MODE === "bypass") {
        payment = { mode: "mock-bypass", receiptId: "bypass-" + Date.now().toString(36) }
      } else if (Pay.PAYMENTS_MODE === "live") {
        return c.json({ error: "Live payments are not configured", detail: Pay.livePayerStatus.reason }, 503)
      } else {
        const header = c.req.header("X-PAYMENT")
        if (!header) {
          const challenge = { ...Pay.makeChallenge(resource), ...(sub && sub.decision !== "UNAVAILABLE" ? { subscription: { reason: sub.reason, suggestedPlanId: sub.suggestedPlanId ?? null } } : {}) }
          return c.json(challenge, 402, { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString("base64") })
        }
        const v = await Pay.verifyPayment(header, { resource, minAtomic: Pay.requiredAtomic() })
        if (!v.ok) return c.json({ ...Pay.makeChallenge(resource), error: `Payment rejected: ${v.reason}` }, 402)
        payment = { mode: "mock", receiptId: v.receiptId }
      }
    }
    billing.meter(userId ?? "anonymous", "stress_analysis", { payment: payment.mode })
    return c.json({ ...runStress(req), payment })
  })

  // Memo restates engine output. It recomputes from the request, so the client cannot supply numbers.
  app.post("/v1/memo", async (c) => {
    const raw = await c.req.json().catch(() => { throw new ValidationError("Invalid JSON body") })
    const req = parseStressRequest(raw)
    const result = runStress(req)
    const property = typeof raw.address === "string" ? { address: raw.address.slice(0, 200) } : undefined
    billing.meter(billing.identify(c) ?? "anonymous", "deal_memo", {})
    return c.json({ ...(await generateMemo({ property, req, result })), result })
  })

  // Payments: mock facilitator (sessions with hard budgets) used by the UI and the agent.
  app.post("/v1/payments/sessions", async (c) => {
    if (Pay.PAYMENTS_MODE === "live") return c.json({ error: "Live payments are not configured" }, 503)
    const { budgetUsd } = await c.req.json().catch(() => ({}))
    try { return c.json(await Pay.createSession(Number(budgetUsd))) } catch (e) { throw new ValidationError(e.message) }
  })
  app.get("/v1/payments/ledger", async (c) => c.json(await Pay.ledger()))
  app.get("/v1/payments/sessions/:id", async (c) => {
    const s = await Pay.sessionInfo(c.req.param("id"))
    return s ? c.json(s) : c.json({ error: "Unknown session" }, 404)
  })
  app.post("/v1/payments/pay", async (c) => {
    const b = await c.req.json().catch(() => ({}))
    if (!b.sessionId || !b.resource || !/^\d+$/.test(String(b.amountAtomic))) throw new ValidationError("sessionId, resource and amountAtomic are required")
    const r = await Pay.pay(b)
    return c.json(r.ok ? r : { error: r.error, remainingUsd: r.remainingUsd }, r.ok ? 200 : r.status)
  })

  app.post("/v1/agent/scan", async (c) => {
    const { capUsd = 5 } = await c.req.json().catch(() => ({}))
    if (!(Number(capUsd) > 0 && Number(capUsd) <= 50)) throw new ValidationError("capUsd must be between 0 and 50")
    billing.meter(billing.identify(c) ?? "anonymous", "agent_scan", {})
    return c.json(await runAgent({ app, properties, capUsd: Number(capUsd), scenario: scenarioFromAssumptions() }))
  })

  return app
}
