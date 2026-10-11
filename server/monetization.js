// Subscription billing status. The plan spec in data/monetization-plans.json defines the plans.

import spec from "../data/monetization-plans.json" with { type: "json" }

export function monetizationStatus() {
  const appId = process.env.MONETIZATION_APP_ID
  const plans = spec.plans.map((p) => ({
    id: p.planId, name: p.definition.name, priceUsd: Number(p.definition.subscriptionPrice.amount),
    quotas: Object.fromEntries(Object.entries(p.definition.includedQuotas).map(([k, v]) => [k, {
      included: v.flat.includedQuantity,
      overageUsd: v.flat.overagePrice ? Number(v.flat.overagePrice.amount) : null,
    }])),
  }))
  return {
    provider: process.env.BILLING_LABEL ?? "Subscription billing",
    state: appId ? "configured" : "pending-account-activation",
    appId: appId ?? null,
    metrics: spec.metrics.map((m) => ({ code: m.metricCode, name: m.name, unit: m.unitName })),
    plans,
    detail: appId
      ? "Billing app exists."
      : "Plans are defined.",
  }
}
