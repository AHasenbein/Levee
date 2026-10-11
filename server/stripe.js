// Stripe (test mode): one-time credit packs bought through hosted Checkout. Credits are spent before pay-per-call.
// The Checkout Session is verified server-side with the secret key; no card data touches this server.

export const PACKS = {
  pack10: { analyses: 10, priceCents: 400, name: "10 analyses" },
  pack40: { analyses: 40, priceCents: 1400, name: "40 analyses" },
}

// Credit ledger on the shared store. Grants are idempotent per Checkout Session.
import { store } from "./store.js"
import spec from "../data/monetization-plans.json" with { type: "json" }

// Monthly plans, from the same spec as the billing app: id -> { name, priceCents, analyses }.
export const PLANS = Object.fromEntries(spec.plans.map((p) => [p.planId, {
  name: p.definition.name,
  priceCents: Math.round(Number(p.definition.subscriptionPrice.amount) * 100),
  analyses: p.definition.includedQuotas.stress_analysis.flat.includedQuantity,
}]))

export function createCredits() {
  return {
    balance: async (u) => (await store.get("credits:" + u)) ?? 0,
    async grantOnce(sessionId, u, n) {
      if (await store.get("granted:" + sessionId)) return { granted: false, balance: (await store.get("credits:" + u)) ?? 0 }
      await store.set("granted:" + sessionId, u)
      const balance = ((await store.get("credits:" + u)) ?? 0) + n
      await store.set("credits:" + u, balance)
      return { granted: true, balance }
    },
    async add(u, n) { const b = ((await store.get("credits:" + u)) ?? 0) + n; await store.set("credits:" + u, b); return b },
    async consume(u) {
      const b = (await store.get("credits:" + u)) ?? 0
      if (b < 1) return false
      await store.set("credits:" + u, b - 1); return true
    },
  }
}

const ALLOWED_ORIGIN = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/

export function safeOrigin(origin, env = process.env) {
  if (env.APP_URL && origin === env.APP_URL.replace(/\/$/, "")) return origin
  if (origin && ALLOWED_ORIGIN.test(origin)) return origin
  return env.APP_URL ? env.APP_URL.replace(/\/$/, "") : null
}

const monthKey = () => new Date().toISOString().slice(0, 7)

export async function createStripeBilling({ client, credits = createCredits(), env = process.env } = {}) {
  let stripe = client
  if (!stripe && env.STRIPE_SECRET_KEY) {
    const { default: Stripe } = await import("stripe")
    stripe = new Stripe(env.STRIPE_SECRET_KEY)
  }
  const enabled = !!stripe

  // The customer's active paid plan, re-checked against Stripe at most every 10 minutes (so cancellations take effect).
  async function activeSub(userId) {
    const sub = await store.get("sub:" + userId)
    if (!sub) return null
    if (Date.now() - (sub.checkedAt ?? 0) > 10 * 60 * 1000 && stripe && sub.stripeSubId) {
      try {
        const s = await stripe.subscriptions.retrieve(sub.stripeSubId)
        sub.status = s.status; sub.checkedAt = Date.now()
        await store.set("sub:" + userId, sub)
      } catch { /* keep last known status */ }
    }
    return ["active", "trialing"].includes(sub.status) ? sub : null
  }

  return {
    enabled, credits, activeSub,

    async checkout(userId, packId, origin) {
      const pack = PACKS[packId]
      if (!pack) throw new Error("Unknown pack")
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: pack.priceCents, product_data: { name: `Levee: ${pack.name}` } } }],
        success_url: `${origin}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?stripe=cancel`,
        client_reference_id: userId,
        metadata: { userId, packId },
      })
      return { url: session.url, id: session.id }
    },

    async subscribe(userId, planId, origin) {
      const plan = PLANS[planId]
      if (!plan || plan.priceCents <= 0) throw new Error("Unknown plan")
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: plan.priceCents, recurring: { interval: "month" }, product_data: { name: `Levee ${plan.name} plan` } } }],
        success_url: `${origin}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?stripe=cancel`,
        client_reference_id: userId,
        metadata: { userId, planId },
      })
      return { url: session.url, id: session.id }
    },

    // Called when the customer returns from Checkout. Trusts only what Stripe says about the session.
    async confirm(userId, sessionId) {
      const s = await stripe.checkout.sessions.retrieve(sessionId)
      if (s.metadata?.userId !== userId) throw new Error("Session belongs to a different customer")
      if (s.mode === "subscription") {
        if (s.status !== "complete") return { paid: false, kind: "plan", balance: await credits.balance(userId) }
        const plan = PLANS[s.metadata.planId]
        if (!plan) throw new Error("Unknown plan on session")
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id
        await store.set("sub:" + userId, { planId: s.metadata.planId, stripeSubId: subId, customer: s.customer ?? null, status: "active", checkedAt: Date.now(), since: Date.now() })
        return { paid: true, kind: "plan", plan: plan.name, balance: await credits.balance(userId) }
      }
      if (s.payment_status !== "paid") return { paid: false, kind: "pack", balance: await credits.balance(userId) }
      const pack = PACKS[s.metadata.packId]
      if (!pack) throw new Error("Unknown pack on session")
      return { paid: true, kind: "pack", ...(await credits.grantOnce(sessionId, userId, pack.analyses)) }
    },

    // Spend one analysis from the plan's monthly quota, if the customer has an active paid plan with quota left.
    async consumePlan(userId) {
      const sub = await activeSub(userId)
      if (!sub) return null
      const plan = PLANS[sub.planId]
      const key = `use:${userId}:${monthKey()}`
      const used = (await store.get(key)) ?? 0
      if (used >= plan.analyses) return null
      await store.set(key, used + 1)
      return { planId: sub.planId, plan: plan.name, used: used + 1, quota: plan.analyses }
    },

    async planStatus(userId) {
      const sub = await activeSub(userId)
      if (!sub) return null
      const plan = PLANS[sub.planId]
      const used = (await store.get(`use:${userId}:${monthKey()}`)) ?? 0
      return { planId: sub.planId, plan: plan.name, used, quota: plan.analyses, remaining: Math.max(0, plan.analyses - used) }
    },

    async portal(userId, origin) {
      const sub = await store.get("sub:" + userId)
      if (!sub?.customer) throw new Error("No subscription to manage")
      const s = await stripe.billingPortal.sessions.create({ customer: sub.customer, return_url: origin + "/" })
      return { url: s.url }
    },
  }
}
