// Deal Finder agent. Screens listings, then pays the stress endpoint per analysis over real HTTP,
// following the 402 flow. It stops at its own cap; the facilitator also enforces the session budget.
// The policy is rule-based (no LLM in the loop); numbers only ever come from /v1/stress.
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

export function screen(properties) {
  // Worth a stress test: passes a typical lender DSCR test on an average year (>= 1.20).
  // Flood-zone listings first (highest chance a green deal flips), then by base DSCR descending.
  const eligible = properties.filter((p) => p.quick.baseDscr >= 1.2)
  eligible.sort((a, b) => b.flood.probPerYear - a.flood.probPerYear || b.quick.baseDscr - a.quick.baseDscr)
  return { eligible, skipped: properties.filter((p) => !eligible.includes(p)) }
}

export async function runAgent({ app, properties, capUsd, scenario }) {
  const trace = []
  const log = (type, text, extra = {}) => trace.push({ t: Date.now(), type, text, ...extra })
  const sessionRes = await app.request("/v1/payments/sessions", json({ budgetUsd: capUsd }))
  if (sessionRes.status !== 200 && sessionRes.status !== 404) {
    log("error", `Could not open a payment session (HTTP ${sessionRes.status})`)
  }
  const session = sessionRes.status === 200 ? await sessionRes.json() : null
  log("info", `Session started with a $${capUsd.toFixed(2)} budget`, { sessionId: session?.sessionId })

  const { eligible, skipped } = screen(properties)
  log("info", `Screened ${properties.length} listings: ${eligible.length} pass a 1.20 average-year DSCR, ${skipped.length} skipped`)

  const analyzed = []
  let spentUsd = 0, stopReason = "all eligible listings analyzed"
  for (const p of eligible) {
    const body = {
      deal: p.deal,
      hazard: { type: "flood", annualProbability: p.flood.probPerYear, zone: `${p.flood.zone}${p.flood.subtype ? " (" + p.flood.subtype + ")" : ""}`, basis: p.flood.basis },
      scenario, simulation: { paths: 10000, seed: 42 },
    }
    let res = await app.request("/v1/stress", json(body))
    let receiptId = null, amountUsd = 0
    if (res.status === 402) {
      const challenge = await res.json()
      const req = challenge.accepts[0]
      const priceUsd = Number(req.maxAmountRequired) / 1e6
      log("http", `POST /v1/stress ${p.label}`, { status: 402, priceUsd })
      if (spentUsd + priceUsd > capUsd + 1e-9) {
        stopReason = `cap reached: next analysis ($${priceUsd.toFixed(2)}) would exceed $${capUsd.toFixed(2)}`
        log("stop", `Stopping: ${stopReason}`)
        break
      }
      const payRes = await app.request("/v1/payments/pay", json({ sessionId: session?.sessionId, resource: req.resource, amountAtomic: req.maxAmountRequired }))
      const pay = await payRes.json()
      if (!payRes.ok) {
        stopReason = `payment refused (${pay.error})`
        log("stop", `Payment refused with HTTP ${payRes.status}: ${pay.error}`, { status: payRes.status })
        break
      }
      spentUsd += pay.amountUsd; receiptId = pay.receiptId; amountUsd = pay.amountUsd
      log("pay", `Paid $${pay.amountUsd.toFixed(2)} (receipt ${pay.receiptId}), $${pay.remainingUsd.toFixed(2)} left`, { receiptId, spentUsd })
      res = await app.request("/v1/stress", { ...json(body), headers: { "content-type": "application/json", "X-PAYMENT": pay.header } })
    }
    if (res.status !== 200) {
      log("error", `POST /v1/stress ${p.label} failed`, { status: res.status })
      continue
    }
    const out = await res.json()
    log("http", `POST /v1/stress ${p.label} (retry with payment)`, { status: 200 })
    const fails = out.stressed.dscr < 1
    analyzed.push({
      propertyId: p.id, label: p.label, address: p.address, zone: p.flood.zone,
      baseDscr: out.base.dscr, stressedDscr: out.stressed.dscr, outOfPocketUsd: out.stressed.outOfPocketUsd,
      shareFailing: out.simulation.shareOfPathsWithFailingYear, fails, receiptId, amountUsd,
    })
    log("result", `${p.label}: ${out.base.dscr.toFixed(2)} on paper, ${out.stressed.dscr.toFixed(2)} in a flood year (${fails ? "FAILS" : "survives"})`, { fails })
  }
  log("done", `Done. Analyzed ${analyzed.length}, spent $${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)}.`)
  return {
    capUsd, spentUsd, sessionId: session?.sessionId ?? null, stopReason,
    analyzed, unanalyzed: eligible.filter((p) => !analyzed.some((a) => a.propertyId === p.id)).map((p) => p.id),
    trace,
  }
}
