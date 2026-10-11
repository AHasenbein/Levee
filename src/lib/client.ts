import type { AgentRun, Deal, Flood, Health, MemoResponse, Scenario, StressResult, Subject } from "./types"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

// Anonymous API-key identity: the customer's billing identity. Kept in localStorage, with a memory fallback.
let memKey: string | null = null
export async function getApiKey(): Promise<string> {
  try { const k = localStorage.getItem("levee_key"); if (k) return k } catch { /* storage blocked */ }
  if (memKey) return memKey
  const r = await fetch("/v1/keys", { method: "POST" }).then((x) => x.json())
  memKey = r.apiKey
  try { localStorage.setItem("levee_key", r.apiKey) } catch { /* ignore */ }
  return r.apiKey
}
function resetApiKey() {
  memKey = null
  try { localStorage.removeItem("levee_key") } catch { /* ignore */ }
}
// fetch with the API key; if the server rejects the key (e.g. rotated secret), get a fresh one and retry once.
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await fetch(path, await authed(init))
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}))
    if (/API key/i.test(body.error ?? "")) { resetApiKey(); res = await fetch(path, await authed(init)) }
  }
  return res
}
async function authed(init: RequestInit = {}): Promise<RequestInit> {
  const key = await getApiKey().catch(() => null)
  return key ? { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${key}` } } : init
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try { res = await authedFetch(path, init) } catch { throw new ApiError("Cannot reach the Levee API. Is the server running?", 0) }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status)
  return body as T
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
})

export const getHealth = () => call<Health>("/v1/health")
export const getProperties = () =>
  call<{ properties: Subject[]; defaultScenario: Scenario; cache: { builtAt: string; sources: string[] } }>("/v1/properties")
export const lookupAddress = (address: string) =>
  call<{ source: "cache" | "live"; address: string; flood: Flood; propertyId?: string }>(`/v1/lookup?address=${encodeURIComponent(address)}`)
export const loanCalc = (b: { priceUsd: number; downPaymentFraction: number; annualRate: number; termYears: number }) =>
  call<{ monthlyPaymentUsd: number; annualDebtServiceUsd: number }>("/v1/loan", post("/v1/loan", b))
export const getMemo = (req: StressRequest, address: string) => call<MemoResponse>("/v1/memo", post("/v1/memo", { ...req, address }))
export const runAgent = (capUsd: number) => call<AgentRun>("/v1/agent/scan", post("/v1/agent/scan", { capUsd }))

export interface StressRequest {
  deal: Deal
  hazard: { type: "flood"; annualProbability: number; zone: string; basis?: string }
  scenario: Scenario
  simulation: { paths: number; seed: number }
}
export const buildRequest = (s: Subject, scenario: Scenario): StressRequest => ({
  deal: s.deal,
  hazard: { type: "flood", annualProbability: s.flood.probPerYear, zone: s.flood.zone + (s.flood.subtype ? ` (${s.flood.subtype})` : ""), basis: s.flood.basis },
  scenario,
  simulation: { paths: 10000, seed: 42 },
})

export class PaymentRequired extends Error {
  priceUsd: number
  constructor(priceUsd: number) { super("Payment required"); this.priceUsd = priceUsd }
}

// Runs a paid analysis. Prepaid analyses (or a plan quota) are used automatically; otherwise payment is required.
export async function stressPaid(req: StressRequest): Promise<StressResult> {
  const res = await authedFetch("/v1/stress", post("/v1/stress", req)).catch(() => { throw new ApiError("Cannot reach the Levee API. Is the server running?", 0) })
  if (res.status === 402) {
    const ch = await res.json().catch(() => ({}))
    throw new PaymentRequired(Number(ch.accepts?.[0]?.maxAmountRequired ?? 500000) / 1e6)
  }
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`, res.status)
  window.dispatchEvent(new Event("levee:refresh"))
  return res.json()
}

export const getLedger = () => call<import("./types").Ledger>("/v1/payments/ledger")

export const getMonetization = () => call<import("./types").MonetizationStatus>("/v1/monetization")

export const openBillingPage = async (kind: "pricing" | "portal") => {
  const r = await call<{ url: string }>(`/v1/billing/${kind}-session`, { method: "POST" })
  window.open(r.url, "_blank", "noopener")
}

export interface Pack { id: string; analyses: number; priceCents: number; name: string }
export const getPacks = () => call<{ enabled: boolean; packs: Pack[] }>("/v1/stripe/packs")
export interface PlanStatus { planId: string; plan: string; used: number; quota: number; remaining: number }
export const getCredits = () => call<{ balance: number; plan: PlanStatus | null; total: number }>("/v1/credits")
export const subscribe = async (planId: string) => {
  const r = await call<{ url: string }>("/v1/stripe/subscribe", post("/v1/stripe/subscribe", { planId }))
  window.location.href = r.url
}
export const openStripePortal = async () => {
  const r = await call<{ url: string }>("/v1/stripe/portal", post("/v1/stripe/portal", {}))
  window.location.href = r.url
}
export const startCheckout = async (packId: string) => {
  const r = await call<{ url: string }>("/v1/stripe/checkout", post("/v1/stripe/checkout", { packId }))
  window.location.href = r.url
}
export const confirmCheckout = (sessionId: string) =>
  call<{ paid: boolean; balance: number; kind?: "plan" | "pack"; plan?: string }>("/v1/stripe/confirm", post("/v1/stripe/confirm", { sessionId }))
