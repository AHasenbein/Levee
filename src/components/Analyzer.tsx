import { useEffect, useMemo, useState } from "react"
import { Download, Droplets, Loader2, RotateCcw } from "lucide-react"
import { ApiError, buildRequest, getMemo, getPacks, PaymentRequired, startCheckout, stressPaid, type Pack } from "@/lib/client"
import { pickSeed, samplePath } from "@/lib/path"
import { cn } from "@/lib/utils"
import { usd, usd2 } from "@/lib/format"
import type { MemoResponse, Scenario, StressResult, Subject } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Metric, ScenarioPanel, HoldPanel } from "./ResultPanels"

interface Props { subject: Subject; defaultScenario: Scenario; priceUsd: number; autoRun?: boolean }

export default function Analyzer({ subject, defaultScenario, priceUsd, autoRun }: Props) {
  const [packs, setPacks] = useState<Pack[]>([])
  const [buying, setBuying] = useState<string | null>(null)
  const [scenario, setScenario] = useState(defaultScenario)
  const [result, setResult] = useState<StressResult | null>(null)
  const [ranScenario, setRanScenario] = useState<Scenario | null>(null)
  const [flood, setFlood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roll, setRoll] = useState(0)
  const [memo, setMemo] = useState<{ loading: boolean; data?: MemoResponse; error?: string }>({ loading: false })

  const stale = !!result && !!ranScenario && JSON.stringify(ranScenario) !== JSON.stringify(scenario)
  const seed = useMemo(() => pickSeed(subject.flood.probPerYear, subject.deal.holdYears), [subject])

  async function run(thenFlood: boolean) {
    setBusy(true); setError(null)
    const sc = scenario
    try {
      const r = await stressPaid(buildRequest(subject, sc))
      setResult(r); setRanScenario(sc); setFlood(thenFlood); setRoll(0)
      setMemo({ loading: true })
      getMemo(buildRequest(subject, sc), subject.address)
        .then((data) => setMemo({ loading: false, data }))
        .catch((e) => setMemo({ loading: false, error: e.message }))
    } catch (e) {
      if (e instanceof PaymentRequired) { setError("NEED_PAYMENT"); getPacks().then((p) => setPacks(p.enabled ? p.packs : [])).catch(() => {}) }
      else setError(e instanceof ApiError ? e.message : "Something went wrong")
    } finally { setBusy(false) }
  }

  useEffect(() => { if (autoRun) void run(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const view = result ? (flood ? result.stressed : result.base) : subject.quick ? { noiUsd: subject.quick.baseNoiUsd, dscr: subject.quick.baseDscr } : null
  const failing = !!view && flood && !!result && view.dscr < 1
  const baseFails = !!result && !flood && result.base.dscr < 1
  const tone = !result || !flood ? undefined : failing ? "fail" : "ok"
  const path = useMemo(
    () => (result ? samplePath(result.base.dscr, result.stressed.dscr, subject.flood.probPerYear, subject.deal.holdYears, seed + roll) : []),
    [result, subject, seed, roll],
  )

  const download = () => {
    const blob = new Blob([JSON.stringify({ subject: { address: subject.address, flood: subject.flood, deal: subject.deal }, scenario: ranScenario, result, memo: memo.data }, null, 2)], { type: "application/json" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `levee-analysis-${subject.id}.json`; a.click()
  }

  const action = !result
    ? <Button onClick={() => run(!subject.custom)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Droplets />} {subject.custom ? "Analyze deal" : "Trigger flood year"} <span className="opacity-70">· {usd2(priceUsd)}</span></Button>
    : stale
      ? <Button onClick={() => run(true)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Droplets />} Re-run analysis <span className="opacity-70">· {usd2(priceUsd)}</span></Button>
      : flood
        ? <Button variant="outline" onClick={() => setFlood(false)}><RotateCcw /> Back to average year</Button>
        : <Button onClick={() => setFlood(true)}><Droplets /> Trigger flood year</Button>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{subject.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subject.address}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">FEMA zone {subject.flood.zone}{subject.flood.subtype ? `, ${subject.flood.subtype.toLowerCase()}` : ""}</Badge>
            <Badge variant="outline">{subject.flood.probPerYear} annual flood probability</Badge>
            <Badge variant="outline">{subject.custom ? "Your deal inputs" : "Demo deal inputs"}</Badge>
          </div>
        </div>
        {action}
      </div>

      {error === "NEED_PAYMENT" ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm"><b>You're out of analyses.</b> Each one costs {usd2(priceUsd)}. Pay with a card to continue (test mode: card 4242 4242 4242 4242, any future date, any 3 digits).</p>
          <div className="flex flex-wrap gap-3">
            {packs.map((k) => (
              <Button key={k.id} onClick={() => { setBuying(k.id); startCheckout(k.id).catch((e) => { setError(e.message); setBuying(null) }) }} disabled={buying !== null}>
                {buying === k.id && <Loader2 className="animate-spin" />} Pay ${(k.priceCents / 100).toFixed(2)} for {k.analyses} analyses
              </Button>
            ))}
            {packs.length === 0 && <p className="text-sm text-muted-foreground">Card payments are not set up on this server.</p>}
          </div>
        </div>
      ) : error && <div className="rounded-md border border-fail/40 bg-fail/10 px-3 py-2 text-sm text-fail">{error}</div>}

      <section>
        <div className={cn("grid divide-y rounded-lg border sm:grid-cols-4 sm:divide-x sm:divide-y-0", stale && "opacity-60")}>
          <Metric label={result && flood ? "DSCR, flood year" : "DSCR, average year"} value={view ? view.dscr.toFixed(2) : "–"} tone={tone} sub="Break-even is 1.00" />
          <Metric label="Net operating income" value={view ? usd(view.noiUsd) : "–"} sub={`Rent ${usd(subject.deal.annualRentUsd)}`} />
          <Metric label="Debt service" value={usd(subject.deal.debtServiceUsdPerYear)} sub="Per year" />
          <Metric label="Out of pocket" value={result ? usd(flood ? result.stressed.outOfPocketUsd : result.base.outOfPocketUsd) : "–"} tone={failing || baseFails ? "fail" : undefined} sub={flood ? "Shortfall in that year" : "Average year"} />
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <span className={cn("size-2 rounded-full", failing || baseFails ? "bg-fail" : !result ? "bg-muted-foreground" : "bg-ok")} />
          {stale ? "Scenario changed. Re-run the analysis to update these numbers."
            : failing ? "Fails. Income after costs no longer covers the mortgage."
            : flood ? "Survives the flood year."
            : baseFails ? "Does not cover the mortgage even in an average year. A flood year makes it worse."
            : result ? "Approved on an average year. Nobody tested the bad one."
            : subject.custom ? "Run the analysis to see how this deal behaves in a flood year."
            : "Approved on an average year. Nobody tested the bad one."}
        </p>
      </section>

      {flood && result && (
        <>
          <ScenarioPanel scenario={scenario} onChange={setScenario} />
          <HoldPanel result={result} path={path} holdYears={subject.deal.holdYears} probPerYear={subject.flood.probPerYear} onResample={() => setRoll((r) => r + 1)} />
        </>
      )}

      <section className="rounded-lg border p-5">
        <Tabs defaultValue="memo">
          <TabsList>
            <TabsTrigger value="memo">Memo</TabsTrigger>
            <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
          </TabsList>
          <TabsContent value="memo" className="pt-4">
            {!result ? <p className="text-sm text-muted-foreground">Run the analysis to generate the memo. It only restates engine output.</p>
              : memo.loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Writing memo...</p>
              : memo.error ? <p className="text-sm text-fail">{memo.error}</p>
              : memo.data && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{memo.data.source === "bedrock" ? `Written by ${memo.data.model}` : "Template (no model call)"}</Badge>
                    <Badge variant="outline" className={memo.data.validation.ok ? "text-ok" : "text-fail"}>
                      {memo.data.validation.ok ? `${memo.data.validation.numbersChecked} numbers verified against the engine` : "Unverified numbers found"}
                    </Badge>
                  </div>
                  {memo.data.text.split("\n\n").map((t, i) => <p key={i} className="text-sm leading-relaxed">{t}</p>)}
                  {memo.data.fallbackReason && <p className="text-xs text-muted-foreground">Fallback reason: {memo.data.fallbackReason}</p>}
                </div>
              )}
          </TabsContent>
          <TabsContent value="assumptions" className="pt-4">
            {result ? (
              <>
                <Table>
                  <TableHeader><TableRow><TableHead>Assumption</TableHead><TableHead>Value</TableHead><TableHead>Basis</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.assumptions.map((a) => (
                      <TableRow key={a.name}><TableCell className="font-mono text-xs">{a.name}</TableCell><TableCell className="tnum">{String(a.value)}</TableCell><TableCell className="text-muted-foreground">{a.basis}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button variant="outline" size="sm" className="mt-4" onClick={download}><Download /> Download analysis JSON</Button>
              </>
            ) : <p className="text-sm text-muted-foreground">Assumptions are returned with every analysis and shown here.</p>}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}
