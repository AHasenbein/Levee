import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { ApiError, runAgent } from "@/lib/client"
import { cn } from "@/lib/utils"
import { usd, usd2 } from "@/lib/format"
import type { AgentRun } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function AgentPage({ onOpen }: { onOpen: (propertyId: string) => void }) {
  const [cap, setCap] = useState("5")
  const [run, setRun] = useState<AgentRun | null>(null)
  const [shown, setShown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  async function start() {
    setBusy(true); setError(null); setRun(null); setShown(0)
    try {
      const r = await runAgent(Number(cap))
      setRun(r)
      let i = 0
      timer.current = window.setInterval(() => { i++; setShown(i); if (i >= r.trace.length) clearInterval(timer.current!) }, 350)
    } catch (e) { setError(e instanceof ApiError ? e.message : "Agent failed") }
    finally { setBusy(false) }
  }

  const lines = run ? run.trace.slice(0, shown) : []
  const spent = lines.filter((l) => l.type === "pay").length ? lines.filter((l) => l.type === "pay").slice(-1)[0].spentUsd ?? 0 : 0
  const finished = !!run && shown >= run.trace.length
  const capN = Number(cap) || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deal Finder agent</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The agent screens the listings, then pays for each stress analysis over HTTP: it calls the endpoint, gets a 402 Payment Required, pays from a budgeted session, and retries. It stops at its cap, and the payment facilitator enforces the budget separately. It is rule-based; every number comes from the engine.
        </p>
      </div>
      <section className="rounded-lg border p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Spending cap ($)</label><Input className="w-28 tnum" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
          <Button onClick={start} disabled={busy || !(capN > 0 && capN <= 50)}>{busy && <Loader2 className="animate-spin" />} Run agent</Button>
        </div>
        {error && <p className="mt-3 text-sm text-fail">{error}</p>}
        {run && (
          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Session budget</span><span className="tnum">{usd2(spent)} / {usd2(run.capUsd)}</span></div>
              <Progress value={(spent / run.capUsd) * 100} />
            </div>
            <div className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-6">
              {lines.map((l, i) => (
                <div key={i} className={cn(l.status === 402 && "text-amber-600 dark:text-amber-400", l.type === "pay" && "text-foreground", l.type === "stop" && "text-amber-600 dark:text-amber-400", l.type === "result" && (l.text.includes("FAILS") ? "text-fail" : "text-ok"), (l.type === "info" || l.type === "done") && "text-muted-foreground")}>
                  {l.status ? `[${l.status}] ` : ""}{l.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      {run && finished && (
        <section className="rounded-lg border p-5">
          <h2 className="text-sm font-semibold">Result</h2>
          <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
            Analyzed {run.analyzed.length}, {run.analyzed.filter((a) => a.fails).length} fail a flood year. Spent {usd2(run.spentUsd)} of {usd2(run.capUsd)}. Stopped: {run.stopReason}.
          </p>
          <Table>
            <TableHeader><TableRow><TableHead>Property</TableHead><TableHead>FEMA zone</TableHead><TableHead className="text-right">On paper</TableHead><TableHead className="text-right">Flood year</TableHead><TableHead className="text-right">Out of pocket</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody className="tnum">
              {run.analyzed.map((a) => (
                <TableRow key={a.propertyId}>
                  <TableCell className="max-w-56 truncate">{a.label}</TableCell>
                  <TableCell>{a.zone}</TableCell>
                  <TableCell className="text-right">{a.baseDscr.toFixed(2)}</TableCell>
                  <TableCell className={cn("text-right", a.fails ? "text-fail" : "text-ok")}>{a.stressedDscr.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{a.fails ? usd(a.outOfPocketUsd) : "–"}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => onOpen(a.propertyId)}>Open</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}
