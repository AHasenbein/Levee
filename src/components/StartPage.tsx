import { useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { ApiError, getProperties, lookupAddress } from "@/lib/client"
import { usd } from "@/lib/format"
import { cn } from "@/lib/utils"
import { plan, dealForRoute, PlanInputError } from "@/lib/planner.js"
import { addressFromInput } from "@/lib/zillow.js"
import type { Subject } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// First-time buyer flow: 1) how much cash do I need (planner, runs in the browser, free)
// 2) check a real home with the chosen plan (FEMA lookup, then the normal Analyzer).
type PlanResult = ReturnType<typeof plan>
type Route = PlanResult["routes"][number]

const num = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0
const field = (label: string, value: string, set: (v: string) => void, placeholder?: string) => (
  <div className="space-y-1.5">
    <Label className="text-sm">{label}</Label>
    <Input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} className="tnum h-11 text-base" />
  </div>
)

export default function StartPage({ onAnalyze }: { onAnalyze: (s: Subject) => void }) {
  const [savings, setSavings] = useState("60000")
  const [price, setPrice] = useState("300000")
  const [rent, setRent] = useState("")
  const [result, setResult] = useState<PlanResult | null>(null)
  const [planErr, setPlanErr] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Route | null>(null)
  const [query, setQuery] = useState("")
  const [homePrice, setHomePrice] = useState("")
  const [homeRent, setHomeRent] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reserveMonths = result?.assumptions.find((a) => a.name === "reserveMonths")?.value

  function run() {
    try {
      setResult(plan({ savingsUsd: num(savings), priceUsd: num(price), monthlyRentUsd: num(rent) || undefined })); setPlanErr(null)
    } catch (e) { setResult(null); setPlanErr(e instanceof PlanInputError ? e.message : "Could not build a plan from those numbers") }
    setChosen(null)
  }
  const choose = (r: Route) => { setChosen(r); setHomePrice(price); setHomeRent(rent); setErr(null) }

  async function check() {
    if (!chosen) return
    setBusy(true); setErr(null)
    try {
      // Prefer a cached FEMA match (ignoring commas and case) so the demo does not depend on venue wifi;
      // otherwise the server does a live Census + FEMA lookup.
      const typed = addressFromInput(query)
      const key = (a: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "")
      const cached = (await getProperties().catch(() => null))?.properties.find((p) => key(p.address) === key(typed))
      const look = await lookupAddress(cached ? cached.address : typed)
      const deal = dealForRoute(chosen.id, { priceUsd: num(homePrice), monthlyRentUsd: num(homeRent) || undefined })
      onAnalyze({ id: "custom-" + Date.now(), custom: true, label: `Your ${chosen.name.split(" (")[0].toLowerCase()} plan`,
        address: look.address, flood: look.flood, deal })
    } catch (e) { setErr(e instanceof ApiError || e instanceof PlanInputError ? e.message : "Could not check that home. Try a full Austin address.") }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ever thought about owning a rental?</h1>
        <p className="mt-2 text-lg text-muted-foreground">See what it really takes, including the bad year.</p>
      </div>

      <section className="space-y-5 rounded-xl border p-6">
        <h2 className="text-lg font-semibold">1. How much do I need?</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("Money you could invest ($)", savings, setSavings)}
          {field("Home price you're looking at ($)", price, setPrice)}
          {field("Monthly rent, if you know it ($)", rent, setRent, "we'll estimate")}
        </div>
        {planErr && <p className="text-sm text-fail">{planErr}</p>}
        <Button size="lg" className="w-full text-base" onClick={run}>Show me my options</Button>
      </section>

      {result && (
        <section className="space-y-4">
          <div className="rounded-xl border bg-muted/40 p-6">
            <p className="text-2xl font-semibold tracking-tight">You need {usd(result.cheapest.cashNeededUsd)} to own your first rental, not {usd(result.priciestCashNeededUsd)}.</p>
            <p className="mt-2 text-sm text-muted-foreground">{result.cheapest.name}. Includes down payment, closing costs, a fix-up buffer and {reserveMonths} months of costs kept in the bank.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {result.routes.map((r) => (
              <div key={r.id} className={cn("space-y-3 rounded-xl border p-5", chosen?.id === r.id && "ring-2 ring-foreground")}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{r.name}</h3>
                  <Badge variant="outline">Effort: {r.effort}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{r.what}</p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Cash to start</dt><dd className="tnum text-lg font-semibold">{usd(r.cashNeededUsd)}</dd></div>
                  <div><dt className="text-muted-foreground">{r.ready ? "You have enough" : "You're short by"}</dt><dd className={cn("tnum text-lg font-semibold", r.ready ? "text-ok" : "text-fail")}>{r.ready ? "Ready" : usd(r.shortfallUsd)}</dd></div>
                  <div><dt className="text-muted-foreground">Monthly {r.monthlyLabel}</dt><dd className={cn("tnum text-lg font-semibold", r.monthlyLabel === "income" && (r.monthlyUsd < 0 ? "text-fail" : "text-ok"))}>{usd(r.monthlyUsd)}</dd></div>
                  <div><dt className="text-muted-foreground">Bad flood year costs you</dt><dd className="tnum text-lg font-semibold">{r.floodYear ? usd(r.floodYear.outOfPocketUsd) : "Spread out"}</dd></div>
                </dl>
                {r.kind !== "fund" && (
                  <Button variant={chosen?.id === r.id ? "default" : "outline"} className="w-full" onClick={() => choose(r)}>Check a real home with this plan <ArrowRight /></Button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{result.disclaimer} These figures use illustrative assumptions, not quotes or lookups.</p>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-medium">Assumptions behind these numbers</summary>
            <table className="mt-3 w-full text-left text-xs">
              <tbody>
                {result.assumptions.map((a) => (
                  <tr key={a.name} className="border-t">
                    <td className="py-1.5 pr-3 font-mono">{a.name}</td>
                    <td className="tnum py-1.5 pr-3">{a.value}</td>
                    <td className="py-1.5 text-muted-foreground">{a.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      {chosen && (
        <section className="space-y-4 rounded-xl border p-6">
          <h2 className="text-lg font-semibold">2. Check a real home: {chosen.name}</h2>
          <div className="space-y-1.5">
            <Label className="text-sm">Paste a Zillow link or type an Austin address</Label>
            <Input className="h-11 text-base" placeholder="e.g. 6900 Onion Creek Dr, Austin, TX 78744" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && query.trim().length > 4 && check()} />
            {query.includes("zillow.com") && <p className="text-xs text-muted-foreground">Reading the address from the link: {addressFromInput(query)}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Asking price ($)", homePrice, setHomePrice)}
            {field(chosen.ownerOccupied ? "Rent for the whole duplex ($/mo, we count the tenant's half)" : "Monthly rent ($)", homeRent, setHomeRent, "we'll estimate")}
          </div>
          {err && <p className="text-sm text-fail">{err}</p>}
          <Button size="lg" className="w-full text-base" disabled={busy || query.trim().length < 5 || !num(homePrice)} onClick={check}>
            {busy && <Loader2 className="animate-spin" />} Find the flood zone and run the bad year
          </Button>
        </section>
      )}
    </div>
  )
}
