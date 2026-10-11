// x402-shaped paywall with a mock facilitator.
// Modes: "mock" (default; real HTTP 402 flow, mock settlement), "bypass" (skip the check, record a fake receipt),
// "live" (AgentCore Payments; not available in this project's region, see README).
import crypto from "node:crypto"

export const PAYMENTS_MODE = process.env.PAYMENTS_MODE ?? "mock"
export const PRICE_USD = Number(process.env.PRICE_USD ?? 0.5)
const SECRET = process.env.PAYMENT_SECRET ?? crypto.randomBytes(32).toString("hex")
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
const PAY_TO_DEMO = "0x000000000000000000000000000000000000dEaD" // placeholder, no real funds

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const sign = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url")
const atomic = (usd) => String(Math.round(usd * 1e6)) // USDC has 6 decimals

export function makeChallenge(resource, priceUsd = PRICE_USD) {
  return {
    x402Version: 1,
    error: "X-PAYMENT header is required",
    accepts: [{
      scheme: "exact", network: "base-sepolia", maxAmountRequired: atomic(priceUsd), resource,
      description: "One flood stress analysis (deal + scenario + simulation)", mimeType: "application/json",
      payTo: PAY_TO_DEMO, maxTimeoutSeconds: 60, asset: USDC_BASE_SEPOLIA, extra: { name: "USDC", version: "2", demo: true },
    }],
  }
}

// Mock facilitator: sessions with a hard budget enforced here, not by the client. State lives in the store.
import { store } from "./store.js"

export async function createSession(budgetUsd) {
  if (!(budgetUsd > 0 && budgetUsd <= 100)) throw new Error("budgetUsd must be between 0 and 100")
  const id = "sess_" + crypto.randomBytes(6).toString("hex")
  await store.set("sess:" + id, { budgetAtomic: atomic(budgetUsd), spentAtomic: "0", payments: [] })
  return { sessionId: id, budgetUsd }
}
export async function sessionInfo(id) {
  const s = await store.get("sess:" + id)
  return s && { budgetUsd: Number(s.budgetAtomic) / 1e6, spentUsd: Number(s.spentAtomic) / 1e6, payments: s.payments }
}

// Aggregate view over every settled payment (what a revenue dashboard reads).
export async function ledger() {
  const rows = (await store.get("ledger")) ?? []
  const sessions = (await store.list("sess:")).length
  const revenueUsd = rows.reduce((t, r) => t + r.amountUsd, 0)
  return { mode: PAYMENTS_MODE, testMode: true, count: rows.length, revenueUsd, sessions, recent: rows.slice(0, 25) }
}

export async function pay({ sessionId, resource, amountAtomic }) {
  const s = await store.get("sess:" + sessionId)
  if (!s) return { ok: false, status: 404, error: "Unknown payment session" }
  const amt = BigInt(amountAtomic), budget = BigInt(s.budgetAtomic), spent = BigInt(s.spentAtomic)
  if (spent + amt > budget) return { ok: false, status: 403, error: "Session budget exceeded", remainingUsd: Number(budget - spent) / 1e6 }
  const receiptId = "rcpt_" + crypto.randomBytes(5).toString("hex")
  const row = { receiptId, amountUsd: Number(amt) / 1e6, resource, at: Date.now() }
  s.spentAtomic = String(spent + amt); s.payments.push(row)
  await store.set("sess:" + sessionId, s)
  await store.set("ledger", [{ ...row, sessionId }, ...(((await store.get("ledger")) ?? []).slice(0, 199))])
  const body = b64({ receiptId, resource, amountAtomic: String(amt), sessionId, iat: Date.now() })
  const token = `${body}.${sign(body)}`
  const header = Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network: "base-sepolia", payload: { mock: true, token } })).toString("base64")
  return { ok: true, receiptId, amountUsd: Number(amt) / 1e6, header, remainingUsd: Number(budget - spent - amt) / 1e6 }
}

// Server-side check of an X-PAYMENT header. Receipts are single use.
export async function verifyPayment(header, { resource, minAtomic }) {
  try {
    const parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8"))
    const [body, mac] = String(parsed?.payload?.token ?? "").split(".")
    if (!body || !mac || sign(body) !== mac) return { ok: false, reason: "bad signature" }
    const r = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    if (r.resource !== resource) return { ok: false, reason: "receipt is for a different resource" }
    if (BigInt(r.amountAtomic) < BigInt(minAtomic)) return { ok: false, reason: "amount too low" }
    if (await store.get("used:" + r.receiptId)) return { ok: false, reason: "receipt already used" }
    await store.set("used:" + r.receiptId, 1)
    return { ok: true, receiptId: r.receiptId }
  } catch {
    return { ok: false, reason: "malformed payment header" }
  }
}

export const requiredAtomic = (priceUsd = PRICE_USD) => atomic(priceUsd)

// Client-side payer interface. Mock pays through the facilitator; live is intentionally unconfigured.
export const livePayerStatus = {
  available: false,
  reason: "AgentCore Payments runs in us-east-1, us-west-2, eu-central-1 and ap-southeast-2 only; this project is pinned to us-east-2, and it needs Coinbase CDP or Stripe Privy credentials.",
}
