import assert from "node:assert/strict"
import test from "node:test"
import { createApp } from "../server/app.js"
import { validateMemo, buildFacts, templateMemo, generateMemo, _setInvoker } from "../server/memo.js"
import { screen } from "../server/agent.js"
import { properties } from "../server/properties.js"

process.env.MEMO_SOURCE = "template" // no network in tests
process.env.FREE_ANALYSES = "0" // tests start with no free trial; the trial test below enables it
const app = createApp()
const post = (path, body, headers = {}) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })

const golden = {
  deal: { annualRentUsd: 30000, otherOperatingCostsUsdPerYear: 7000, insuranceUsdPerYear: 2000, debtServiceUsdPerYear: 16000, holdYears: 30 },
  hazard: { type: "flood", annualProbability: 0.01, zone: "AE" },
  scenario: { vacantMonths: 3, deductibleUsd: 5000, uninsuredRepairUsd: 1000, premiumMultiplier: 1.0 },
  simulation: { paths: 10000, seed: 42 },
}

async function paid(body) {
  const first = await post("/v1/stress", body)
  const ch = await first.json()
  const session = await (await post("/v1/payments/sessions", { budgetUsd: 5 })).json()
  const pay = await (await post("/v1/payments/pay", { sessionId: session.sessionId, resource: ch.accepts[0].resource, amountAtomic: ch.accepts[0].maxAmountRequired })).json()
  return { first, pay, session }
}

test("unpaid /v1/stress returns HTTP 402 with x402 instructions", async () => {
  const res = await post("/v1/stress", golden)
  assert.equal(res.status, 402)
  const j = await res.json()
  assert.equal(j.x402Version, 1)
  assert.equal(j.accepts[0].scheme, "exact")
  assert.ok(res.headers.get("PAYMENT-REQUIRED"))
})

test("paid /v1/stress returns the golden numbers and carries assumptions", async () => {
  const { pay } = await paid(golden)
  const res = await post("/v1/stress", golden, { "X-PAYMENT": pay.header })
  assert.equal(res.status, 200)
  const j = await res.json()
  assert.equal(j.base.noiUsd, 21000); assert.equal(j.base.dscr, 1.3125)
  assert.equal(j.stressed.noiUsd, 7500); assert.equal(j.stressed.dscr, 0.46875); assert.equal(j.stressed.outOfPocketUsd, 8500)
  assert.ok(j.assumptions.length > 5)
  assert.equal(j.payment.mode, "mock")
  assert.equal(j.simulation.closedFormValid, true)
  const expected = 1 - Math.pow(0.99, 30)
  assert.ok(Math.abs(j.simulation.shareOfPathsWithFailingYear - expected) < 4 * Math.sqrt(expected * (1 - expected) / 10000))
})

test("a receipt cannot be reused", async () => {
  const { pay } = await paid(golden)
  assert.equal((await post("/v1/stress", golden, { "X-PAYMENT": pay.header })).status, 200)
  assert.equal((await post("/v1/stress", golden, { "X-PAYMENT": pay.header })).status, 402)
})

test("forged payment header is rejected", async () => {
  const forged = Buffer.from(JSON.stringify({ payload: { token: "abc.def" } })).toString("base64")
  assert.equal((await post("/v1/stress", golden, { "X-PAYMENT": forged })).status, 402)
})

test("facilitator enforces the session budget, whatever the client does", async () => {
  const s = await (await post("/v1/payments/sessions", { budgetUsd: 1 })).json()
  const args = { sessionId: s.sessionId, resource: "/v1/stress", amountAtomic: "500000" }
  assert.equal((await post("/v1/payments/pay", args)).status, 200)
  assert.equal((await post("/v1/payments/pay", args)).status, 200)
  assert.equal((await post("/v1/payments/pay", args)).status, 403)
})

test("validation rejects percents, bad types and unsupported hazards", async () => {
  const bad = (patch) => post("/v1/stress", { ...golden, ...patch })
  assert.equal((await bad({ hazard: { ...golden.hazard, annualProbability: 1 + 4 } })).status, 400)
  assert.equal((await bad({ hazard: { ...golden.hazard, type: "wildfire" } })).status, 400)
  assert.equal((await bad({ deal: { ...golden.deal, debtServiceUsdPerYear: 0 } })).status, 400)
  assert.equal((await bad({ deal: { ...golden.deal, annualRentUsd: "30000" } })).status, 400)
})

test("same seed, same output through the API", async () => {
  const run = async () => { const { pay } = await paid(golden); return (await (await post("/v1/stress", golden, { "X-PAYMENT": pay.header })).json()).simulation }
  assert.deepEqual(await run(), await run())
})

test("memo template passes the number validator; invented numbers are rejected", async () => {
  const res = await post("/v1/memo", { ...golden, address: "6900 Onion Creek Dr" })
  const m = await res.json()
  assert.equal(m.source, "template")
  assert.equal(m.validation.ok, true)
  const facts = buildFacts({ property: { address: "6900 Onion Creek Dr" }, req: golden, result: m.result })
  assert.equal(validateMemo(templateMemo(facts), facts).ok, true)
  const tampered = validateMemo(templateMemo(facts) + " The owner could lose $12,345 more.", facts)
  assert.equal(tampered.ok, false)
  assert.deepEqual(tampered.rejected, [12345])
})

test("memo cannot be given client-supplied results", async () => {
  const res = await post("/v1/memo", { ...golden, result: { stressed: { dscr: 9.99 } } })
  const m = await res.json()
  assert.ok(!m.text.includes("9.99"))
})

test("cached data has flood-zone and non-flood-zone properties, all in Austin scope", () => {
  assert.ok(properties.some((p) => p.flood.inFloodZone))
  assert.ok(properties.some((p) => !p.flood.inFloodZone))
  assert.ok(properties.filter((p) => p.featured).length === 5)
})

test("agent never exceeds its cap and stops when the next analysis would", async () => {
  const res = await post("/v1/agent/scan", { capUsd: 2 })
  const j = await res.json()
  assert.ok(j.spentUsd <= 2 + 1e-9)
  assert.equal(j.analyzed.length, 4) // $0.50 each
  assert.match(j.stopReason, /cap reached/)
  assert.ok(j.trace.some((t) => t.type === "http" && t.status === 402))
  assert.ok(j.trace.some((t) => t.type === "http" && t.status === 200))
})

test("screen picks only listings that pass the average-year test", () => {
  const { eligible } = screen(properties)
  assert.ok(eligible.every((p) => p.quick.baseDscr >= 1.2))
})

test("lookup rejects out-of-scope or too-short input without needing the network", async () => {
  assert.equal((await app.request("/v1/lookup?address=x")).status, 400)
})

test("model memo is used when every number checks out, and rejected when it invents one", async () => {
  process.env.MEMO_SOURCE = "auto"
  const { runStress } = await import("../server/handlers.js")
  const { parseStressRequest } = await import("../server/validate.js")
  const req = parseStressRequest(golden)
  const ctx = { property: { address: "6900 Onion Creek Dr" }, req, result: runStress(req) }
  const facts = buildFacts(ctx)
  try {
    _setInvoker(async () => `The deal fails: DSCR falls from ${facts.display.baseDscr} to ${facts.display.stressedDscr}, with ${facts.display.outOfPocket} out of pocket.`)
    const ok = await generateMemo(ctx)
    assert.equal(ok.source, "bedrock")
    _setInvoker(async () => `The deal fails with $9,999 out of pocket.`)
    const bad = await generateMemo(ctx)
    assert.equal(bad.source, "template")
    assert.match(bad.fallbackReason, /9999/)
    _setInvoker(async () => { throw new Error("AccessDenied") })
    assert.equal((await generateMemo(ctx)).source, "template")
  } finally { _setInvoker(null); process.env.MEMO_SOURCE = "template" }
})

test("ledger totals match settled payments", async () => {
  const before = await (await app.request("/v1/payments/ledger")).json()
  const { pay } = await paid(golden)
  const after = await (await app.request("/v1/payments/ledger")).json()
  assert.equal(after.count, before.count + 1)
  assert.ok(Math.abs(after.revenueUsd - before.revenueUsd - pay.amountUsd) < 1e-9)
  assert.equal(after.testMode, true)
})

test("monetization status reflects whether billing is connected", async () => {
  const j = await (await app.request("/v1/monetization")).json()
  assert.equal(j.state, "not-configured") // no MONETIZATION_APP_ID in tests
  assert.equal(j.plans.length, 3)
  assert.equal(j.plans.find((p) => p.id === "investor").priceUsd, 9.5)
  assert.equal(j.plans.find((p) => p.id === "team").quotas.stress_analysis.overageUsd, 0.2)
})

test("API keys verify, and tampered keys are rejected", async () => {
  const { issueKey, userFromAuth } = await import("../server/billing.js")
  const k = issueKey()
  assert.equal(userFromAuth(`Bearer ${k.apiKey}`), k.userId)
  assert.equal(userFromAuth(`Bearer ${k.apiKey.slice(0, -1)}x`), null)
  assert.equal(userFromAuth("Bearer nope"), null)
  assert.equal(userFromAuth(undefined), null)
})

function fakeClient({ decision = "ALLOW", reason = "OK", noSubFirst = false } = {}) {
  const calls = { events: [], ent: 0, subs: 0 }
  let subscribed = !noSubFirst
  return {
    calls,
    listPlans: async () => ({ plans: [{ planId: "plan-free", definition: { name: "Free", isDefault: true } }] }),
    createSubscriptionCheckoutSession: async () => { calls.subs++; subscribed = true; return { outcome: { paymentNotRequired: {} } } },
    checkEntitlement: async () => { calls.ent++; return subscribed ? { decision, reason: { code: reason }, planId: "plan-free" } : { decision: "DENY", reason: { code: "NO_SUBSCRIPTION" } } },
    putEvent: async (u, e) => { calls.events.push([u, e.eventType, e.properties]); return { status: "ACCEPTED" } },
    flush: async () => {},
  }
}

test("subscribed customer within quota is served without payment, and usage is metered", async () => {
  const { createBilling, issueKey } = await import("../server/billing.js")
  const client = fakeClient({ noSubFirst: true })
  const a = createApp({ billing: createBilling({ client, enabled: true }) })
  const { apiKey, userId } = issueKey()
  const res = await a.request("/v1/stress", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(golden) })
  assert.equal(res.status, 200)
  const j = await res.json()
  assert.equal(j.payment.mode, "subscription")
  assert.equal(j.stressed.dscr, 0.46875)
  assert.equal(client.calls.subs, 1) // auto-subscribed to Free on first use
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(client.calls.events[0].slice(0, 2), [userId, "stress_analysis"])
})

test("quota exceeded falls back to HTTP 402 pay-per-call, and payment then works", async () => {
  const { createBilling, issueKey } = await import("../server/billing.js")
  const client = fakeClient({ decision: "DENY", reason: "QUOTA_EXCEEDED" })
  const a = createApp({ billing: createBilling({ client, enabled: true }) })
  const { apiKey } = issueKey()
  const h = { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }
  const first = await a.request("/v1/stress", { method: "POST", headers: h, body: JSON.stringify(golden) })
  assert.equal(first.status, 402)
  const ch = await first.json()
  assert.equal(ch.subscription.reason, "QUOTA_EXCEEDED")
  const s = await (await a.request("/v1/payments/sessions", { method: "POST", headers: h, body: JSON.stringify({ budgetUsd: 5 }) })).json()
  const pay = await (await a.request("/v1/payments/pay", { method: "POST", headers: h, body: JSON.stringify({ sessionId: s.sessionId, resource: ch.accepts[0].resource, amountAtomic: ch.accepts[0].maxAmountRequired }) })).json()
  const paid = await a.request("/v1/stress", { method: "POST", headers: { ...h, "X-PAYMENT": pay.header }, body: JSON.stringify(golden) })
  assert.equal(paid.status, 200)
  assert.equal((await paid.json()).payment.mode, "mock")
})

test("if the billing service is unreachable, requests still work via pay-per-call", async () => {
  const { createBilling, issueKey } = await import("../server/billing.js")
  const client = { ...fakeClient(), checkEntitlement: async () => { throw new Error("network down") } }
  const billing = createBilling({ client, enabled: true })
  const a = createApp({ billing })
  const { apiKey } = issueKey()
  const res = await a.request("/v1/stress", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(golden) })
  assert.equal(res.status, 402) // paywall, not a 500
  const st = await (await a.request("/v1/monetization")).json()
  assert.match(st.billing.lastError, /network down/)
})

test("ledger totals match settled payments", async () => {
  const before = await (await app.request("/v1/payments/ledger")).json()
  const { pay } = await paid(golden)
  const after = await (await app.request("/v1/payments/ledger")).json()
  assert.equal(after.count, before.count + 1)
  assert.ok(Math.abs(after.revenueUsd - before.revenueUsd - pay.amountUsd) < 1e-9)
})

test("stripe: checkout, idempotent credit grant, and credits are spent before pay-per-call", async () => {
  const { createStripeBilling, createCredits } = await import("../server/stripe.js")
  const { createBilling, issueKey } = await import("../server/billing.js")
  const { apiKey, userId } = issueKey()
  const sessions = {}
  const fake = { checkout: { sessions: {
    create: async (p) => { const id = "cs_test_abc123"; sessions[id] = { payment_status: "paid", metadata: p.metadata, url: "https://checkout.stripe.test/" + id }; return { id, url: sessions[id].url } },
    retrieve: async (id) => sessions[id],
  } } }
  const stripe = await createStripeBilling({ client: fake, credits: createCredits() })
  const a = createApp({ billing: createBilling({ enabled: false }), stripe })
  const h = { "content-type": "application/json", Authorization: `Bearer ${apiKey}`, Origin: "http://localhost:5173" }
  const co = await (await a.request("/v1/stripe/checkout", { method: "POST", headers: h, body: JSON.stringify({ packId: "pack10" }) })).json()
  assert.match(co.url, /checkout\.stripe\.test/)
  const c1 = await (await a.request("/v1/stripe/confirm", { method: "POST", headers: h, body: JSON.stringify({ sessionId: co.id }) })).json()
  assert.deepEqual([c1.paid, c1.balance], [true, 10])
  const c2 = await (await a.request("/v1/stripe/confirm", { method: "POST", headers: h, body: JSON.stringify({ sessionId: co.id }) })).json()
  assert.equal(c2.balance, 10) // not granted twice
  const res = await a.request("/v1/stress", { method: "POST", headers: h, body: JSON.stringify(golden) })
  assert.equal(res.status, 200)
  const j = await res.json()
  assert.equal(j.payment.mode, "credit"); assert.equal(j.payment.creditsLeft, 9)
  // another customer cannot claim this session
  const other = issueKey()
  const bad = await a.request("/v1/stripe/confirm", { method: "POST", headers: { ...h, Authorization: `Bearer ${other.apiKey}` }, body: JSON.stringify({ sessionId: co.id }) })
  assert.equal(bad.status, 400)
  // hostile origins are not used for redirects
  const evil = await a.request("/v1/stripe/checkout", { method: "POST", headers: { ...h, Origin: "https://evil.example" }, body: JSON.stringify({ packId: "pack10" }) })
  assert.equal(evil.status, 400)
})

test("stripe plans: subscribe, plan quota is spent first, then credits, then payment is required", async () => {
  const { createStripeBilling, createCredits } = await import("../server/stripe.js")
  const { createBilling, issueKey } = await import("../server/billing.js")
  const { apiKey, userId } = issueKey()
  const sessions = {}
  const fake = {
    checkout: { sessions: {
      create: async (p) => { sessions.cs_test_plan1 = { status: "complete", mode: p.mode, metadata: p.metadata, customer: "cus_1", subscription: "sub_1", payment_status: "paid" }; return { id: "cs_test_plan1", url: "https://checkout.stripe.test/plan" } },
      retrieve: async (id) => sessions[id],
    } },
    subscriptions: { retrieve: async () => ({ status: "active" }) },
  }
  const credits = createCredits()
  const stripe = await createStripeBilling({ client: fake, credits })
  const a = createApp({ billing: createBilling({ enabled: false }), stripe })
  const h = { "content-type": "application/json", Authorization: `Bearer ${apiKey}`, Origin: "http://localhost:5173" }
  const sub = await (await a.request("/v1/stripe/subscribe", { method: "POST", headers: h, body: JSON.stringify({ planId: "investor" }) })).json()
  assert.ok(sub.url)
  const conf = await (await a.request("/v1/stripe/confirm", { method: "POST", headers: h, body: JSON.stringify({ sessionId: sub.id }) })).json()
  assert.deepEqual([conf.paid, conf.kind, conf.plan], [true, "plan", "Investor"])
  const st = await (await a.request("/v1/credits", { headers: h })).json()
  assert.equal(st.plan.quota, 60); assert.equal(st.total, 60)
  await credits.add(userId, 1)
  const r1 = await (await a.request("/v1/stress", { method: "POST", headers: h, body: JSON.stringify(golden) })).json()
  assert.equal(r1.payment.mode, "plan"); assert.equal(r1.payment.used, 1)
  assert.equal((await a.request("/v1/stripe/subscribe", { method: "POST", headers: h, body: JSON.stringify({ planId: "free" }) })).status, 400)
})

test("free trial analyses are granted once per customer, even for keys issued earlier", async () => {
  const { createStripeBilling, createCredits } = await import("../server/stripe.js")
  const { createBilling, issueKey } = await import("../server/billing.js")
  process.env.FREE_ANALYSES = "3"
  const { apiKey } = issueKey() // not issued through /v1/keys
  const a = createApp({ billing: createBilling({ enabled: false }), stripe: await createStripeBilling({ credits: createCredits() }) })
  const h = { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }
  assert.equal((await (await a.request("/v1/credits", { headers: h })).json()).total, 3)
  assert.equal((await (await a.request("/v1/credits", { headers: h })).json()).total, 3) // not granted twice
  const r = await (await a.request("/v1/stress", { method: "POST", headers: h, body: JSON.stringify(golden) })).json()
  assert.equal(r.payment.mode, "credit"); assert.equal(r.payment.creditsLeft, 2)
  process.env.FREE_ANALYSES = "0"
})
