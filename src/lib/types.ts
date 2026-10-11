export interface Deal {
  annualRentUsd: number
  otherOperatingCostsUsdPerYear: number
  insuranceUsdPerYear: number
  debtServiceUsdPerYear: number
  holdYears: number
}
export interface Flood {
  zone: string
  subtype?: string | null
  sfha?: boolean
  inFloodZone: boolean
  probPerYear: number
  basis: string
  source?: string
  queriedAt?: string
}
export interface Scenario {
  vacantMonths: number
  deductibleUsd: number
  uninsuredRepairUsd: number
  premiumMultiplier: number
}
export interface Subject {
  id: string
  label: string
  address: string
  deal: Deal
  flood: Flood
  quick?: { baseDscr: number; baseNoiUsd: number; floodDscr: number; floodOutOfPocketUsd: number }
  custom?: boolean
  featured?: boolean
}
export interface StressResult {
  base: { noiUsd: number; dscr: number }
  stressed: { noiUsd: number; dscr: number; outOfPocketUsd: number }
  simulation: {
    paths: number; seed: number; shareOfPathsWithFailingYear: number
    minDscrPercentiles: { p5: number; p50: number; p95: number }
    closedFormShare: number | null; closedFormValid: boolean
  }
  assumptions: { name: string; value: unknown; basis: string }[]
  payment: { mode: string; receiptId: string | null }
}
export interface Health {
  ok: boolean; paymentsMode: string; priceUsd: number
  livePayments: { available: boolean; reason: string }
  memoModel: string; memoSource: string
  flood: { cacheBuiltAt: string; sources: string[]; properties: number }
}
export interface MemoResponse {
  text: string; source: "bedrock" | "template"; model?: string; fallbackReason?: string
  validation: { ok: boolean; numbersChecked: number; rejected: number[] }
}
export interface AgentRun {
  capUsd: number; spentUsd: number; sessionId: string | null; stopReason: string
  analyzed: { propertyId: string; label: string; address: string; zone: string; baseDscr: number; stressedDscr: number; outOfPocketUsd: number; shareFailing: number; fails: boolean; receiptId: string | null; amountUsd: number }[]
  unanalyzed: string[]
  trace: { t: number; type: string; text: string; status?: number; priceUsd?: number; spentUsd?: number }[]
}
export interface LedgerRow { receiptId: string; amountUsd: number; resource: string; sessionId: string; at: number }
export interface Ledger { mode: string; testMode: boolean; count: number; revenueUsd: number; sessions: number; recent: LedgerRow[] }
export interface PaymentEvent { t: number; kind: "402" | "paid" | "ok" | "refused" | "bypass"; text: string }

export interface MonetizationStatus {
  provider: string; state: "not-configured" | "connected" | "active" | "plans-unpublished"; appId: string | null; detail: string
  billing: { enabled: boolean; identity: "live" | "sandbox" | null; appIdSuffix: string | null; entitlementChecks: number; eventsAccepted: number; eventsFailed: number; subscribed: number; subscribeBlocked: string | null; lastError: string | null }
  metrics: { code: string; name: string; unit: string }[]
  plans: { id: string; name: string; priceUsd: number; quotas: Record<string, { included: number; overageUsd: number | null }> }[]
}
