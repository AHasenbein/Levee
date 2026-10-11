// Memo: restates engine output. Bedrock (Claude) writes it when available; every number is then
// validated against the engine output, and any mismatch falls back to a deterministic template.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"

export const MEMO_MODEL_ID = process.env.MEMO_MODEL_ID ?? "us.amazon.nova-pro-v1:0"
// Netlify Functions reserve the AWS_* credential variables, so a deployed key lives in LEVEE_BEDROCK_* and is passed explicitly.
// Anywhere else (local dev, a role) the default AWS credential chain is used.
export function bedrockClientConfig(env = process.env) {
  const cfg = { region: env.BEDROCK_REGION ?? "us-east-2", maxAttempts: 2 }
  if (env.LEVEE_BEDROCK_ACCESS_KEY_ID && env.LEVEE_BEDROCK_SECRET_ACCESS_KEY) {
    cfg.credentials = { accessKeyId: env.LEVEE_BEDROCK_ACCESS_KEY_ID, secretAccessKey: env.LEVEE_BEDROCK_SECRET_ACCESS_KEY }
  }
  return cfg
}
const useBedrock = () => (process.env.MEMO_SOURCE ?? "auto") !== "template"

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US")
const pct = (x) => (x * 100).toFixed(1) + "%"

// Every figure the memo may mention, pre-formatted. The model copies these strings; it never computes.
export function buildFacts({ property, req, result }) {
  const s = result.stressed, b = result.base, sim = result.simulation, q = sim.minDscrPercentiles
  const verdict = s.dscr < 1 ? "fails" : "survives"
  return {
    subject: property?.address ?? "the property",
    zone: req.hazard.zone,
    verdict,
    display: {
      holdYears: String(req.deal.holdYears),
      annualFloodProbability: String(req.hazard.annualProbability),
      baseNoi: usd(b.noiUsd), baseDscr: b.dscr.toFixed(2),
      vacantMonths: String(req.scenario.vacantMonths), deductible: usd(req.scenario.deductibleUsd),
      uninsuredRepair: usd(req.scenario.uninsuredRepairUsd), premiumMultiplier: req.scenario.premiumMultiplier.toFixed(1),
      stressedNoi: usd(s.noiUsd), stressedDscr: s.dscr.toFixed(2), outOfPocket: usd(s.outOfPocketUsd),
      debtService: usd(req.deal.debtServiceUsdPerYear),
      paths: sim.paths.toLocaleString("en-US"), seed: String(sim.seed),
      shareFailing: pct(sim.shareOfPathsWithFailingYear),
      p5: q.p5.toFixed(2), p50: q.p50.toFixed(2), p95: q.p95.toFixed(2),
      breakEven: "1.00",
    },
  }
}

export function templateMemo(f) {
  const d = f.display
  return [
    `${f.subject}: in an average year the deal earns ${d.baseNoi} against ${d.debtService} of debt service, a debt coverage ratio (DSCR) of ${d.baseDscr}.`,
    `In a flood year (${d.vacantMonths} months vacant, ${d.deductible} deductible, ${d.uninsuredRepair} uninsured repair) income falls to ${d.stressedNoi} and DSCR to ${d.stressedDscr}, so the deal ${f.verdict} the stress test (break-even is ${d.breakEven}). Out of pocket in that year: ${d.outOfPocket}.`,
    `Over a ${d.holdYears}-year hold, ${d.shareFailing} of ${d.paths} simulated paths (seed ${d.seed}, independent years, ${d.annualFloodProbability} annual flood probability) include at least one failing year. The worst-year DSCR is ${d.p5} at the 5th percentile, ${d.p50} at the median and ${d.p95} at the 95th.`,
    `Every figure above comes from the stress engine. The flood probability, vacancy, deductible and repair cost are assumptions, and insurance premiums are not modeled.`,
  ].join("\n\n")
}

const NUM = /\d[\d,]*(?:\.\d+)?/g
// Ordinal labels ("5th percentile") are not figures.
const toNums = (text) => (String(text).replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ").match(NUM) ?? []).map((t) => parseFloat(t.replace(/,/g, "")))

// Reject any number in the memo that does not appear in the engine-derived facts.
export function validateMemo(text, facts) {
  const allowed = new Set([0, 1])
  for (const v of Object.values(facts.display)) toNums(v).forEach((n) => allowed.add(n))
  toNums(facts.subject).forEach((n) => allowed.add(n))
  toNums(facts.zone).forEach((n) => allowed.add(n))
  const found = toNums(text)
  const rejected = [...new Set(found.filter((n) => !allowed.has(n)))]
  return { ok: rejected.length === 0, numbersChecked: found.length, rejected }
}

let client
let invoker = null
// Test hook: replace the model call.
export const _setInvoker = (fn) => { invoker = fn }

async function bedrockMemo(facts) {
  if (invoker) return invoker(facts)
  client ??= new BedrockRuntimeClient(bedrockClientConfig())
  const system = [{ text:
    "You write a short underwriting memo for a small landlord, restating stress-test results. " +
    "Use ONLY the figures in the `display` object of the JSON you are given, copied exactly as written. " +
    "Never compute, round, convert or infer any number, and never introduce any other number. " +
    "Four short plain-text paragraphs, no markdown, no bullet points. State clearly whether the deal survives the flood year." }]
  const res = await client.send(
    new ConverseCommand({
      modelId: MEMO_MODEL_ID, system,
      messages: [{ role: "user", content: [{ text: JSON.stringify(facts) }] }],
      inferenceConfig: { maxTokens: 700, temperature: 0.2 },
    }),
    { abortSignal: AbortSignal.timeout(20000) },
  )
  return res.output?.message?.content?.map((c) => c.text ?? "").join("").trim()
}

export async function generateMemo(ctx) {
  const facts = buildFacts(ctx)
  let fallbackReason
  if (useBedrock()) {
    try {
      const text = await bedrockMemo(facts)
      if (!text) throw new Error("empty model response")
      const validation = validateMemo(text, facts)
      if (validation.ok) return { text, source: "bedrock", model: MEMO_MODEL_ID, validation }
      fallbackReason = `model output contained unverified numbers: ${validation.rejected.join(", ")}`
    } catch (e) {
      fallbackReason = `Bedrock unavailable: ${String(e.message).slice(0, 160)}`
    }
  } else fallbackReason = "MEMO_SOURCE=template"
  const text = templateMemo(facts)
  return { text, source: "template", fallbackReason, validation: validateMemo(text, facts) }
}
