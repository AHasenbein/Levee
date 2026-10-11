import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { confirmCheckout, getCredits, getHealth, getProperties } from "@/lib/client"
import type { Health, Scenario, Subject } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Analyzer from "@/components/Analyzer"
import CustomDeal from "@/components/CustomDeal"
import AgentPage from "@/components/AgentPage"
import PricingPage from "@/components/PricingPage"
import AboutPage from "@/components/AboutPage"
import StartPage from "@/components/StartPage"

type Page = "start" | "analyze" | "agent" | "pricing" | "about"
const NAV: [Page, string][] = [["start", "Start here"], ["analyze", "Analyze"], ["agent", "Deal Finder"], ["pricing", "Pricing"], ["about", "About"]]

function Shell() {
  const [page, setPage] = useState<Page>("start")
  const [health, setHealth] = useState<Health | null>(null)
  const [props, setProps] = useState<Subject[]>([])
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>("p1")
  const [custom, setCustom] = useState<Subject | "form" | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => getCredits().then((r) => setCredits(r.total)).catch(() => {})
    refresh()
    window.addEventListener("levee:refresh", refresh)
    // Returning from Stripe Checkout: confirm the session with the server, which asks Stripe.
    const q = new URLSearchParams(window.location.search)
    if (q.get("stripe") === "success" && q.get("session_id")) {
      confirmCheckout(q.get("session_id")!)
        .then((r) => { setNotice(r.paid ? (r.kind === "plan" ? `You are now on the ${r.plan} plan.` : `Payment received. You have ${r.balance} prepaid analyses.`) : "Payment not completed."); window.dispatchEvent(new Event("levee:refresh")); setPage("pricing") })
        .catch((e) => setNotice(e.message))
      window.history.replaceState({}, "", "/")
    } else if (q.get("stripe") === "cancel") { setNotice("Checkout cancelled. You were not charged."); window.history.replaceState({}, "", "/") }
    return () => window.removeEventListener("levee:refresh", refresh)
  }, [])

  useEffect(() => {
    Promise.all([getHealth(), getProperties()])
      .then(([h, p]) => { setHealth(h); setProps(p.properties); setScenario(p.defaultScenario) })
      .catch((e) => setError(e.message))
  }, [])

  const featured = props.filter((p) => p.featured)
  const more = props.filter((p) => !p.featured)
  const current = custom && custom !== "form" ? custom : props.find((p) => p.id === selected)

  const pick = (id: string) => { setSelected(id); setCustom(null); setPage("analyze") }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-8">
            <span className="text-base font-semibold tracking-tight">Levee</span>
            <nav className="flex gap-1">
              {NAV.map(([id, label]) => (
                <button key={id} onClick={() => setPage(id)} className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground", page === id && "bg-muted text-foreground")}>{label}</button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">Demo data</Badge>
            <button onClick={() => setPage("pricing")} className="tnum rounded-md border px-2.5 py-1 text-muted-foreground hover:text-foreground">{credits ?? 0} analyses left</button>
          </div>
        </div>
      </header>

      {notice && <div className="border-b bg-muted/50 px-6 py-2 text-center text-sm">{notice} <button className="ml-2 underline" onClick={() => setNotice(null)}>Dismiss</button></div>}
      {error ? (
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <p className="font-medium">Cannot reach the Levee API</p>
          <p className="mt-2 text-sm text-muted-foreground">{error} Start it with <code className="font-mono">npm run dev</code>.</p>
        </div>
      ) : !scenario ? (
        <p className="px-6 py-24 text-center text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className={cn("mx-auto max-w-6xl px-6 py-8", page === "analyze" && "grid gap-10 lg:grid-cols-[260px_1fr]")}>
          {page === "analyze" && (
            <nav>
              <Button variant={custom ? "default" : "outline"} size="sm" className="mb-5 w-full" onClick={() => setCustom("form")}>Analyze your own deal</Button>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Featured, Austin</div>
              <ul className="space-y-0.5">
                {(showAll ? props : featured).map((x) => <PropRow key={x.id} p={x} active={!custom && x.id === selected} onClick={() => pick(x.id)} />)}
              </ul>
              {more.length > 0 && <button className="mt-3 px-3 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show featured only" : `Show all ${props.length} listings`}</button>}
              <p className="mt-4 px-3 text-xs leading-relaxed text-muted-foreground">Average-year DSCR, then flood-year DSCR. Flood zones are from FEMA. Deal inputs are demo values.</p>
            </nav>
          )}
          <main className="min-w-0">
            {page === "analyze" && (custom === "form"
              ? <CustomDeal onAnalyze={(s) => setCustom(s)} />
              : current && <Analyzer key={current.id} subject={current} defaultScenario={scenario} priceUsd={health?.priceUsd ?? 0.5} autoRun={!!current.custom} />)}
            {page === "start" && <StartPage onAnalyze={(s) => { setCustom(s); setPage("analyze") }} />}
            {page === "agent" && <AgentPage onOpen={pick} />}
            {page === "pricing" && <PricingPage health={health} />}
            {page === "about" && <AboutPage />}
          </main>
        </div>
      )}
    </div>
  )
}

function PropRow({ p, active, onClick }: { p: Subject; active: boolean; onClick: () => void }) {
  const q = p.quick!
  return (
    <li>
      <button onClick={onClick} className={cn("flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted", active && "bg-muted")}>
        <span className="min-w-0">
          <span className="block truncate font-medium">{p.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.address.split(",")[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} · zone {p.flood.zone}</span>
        </span>
        <span className="tnum shrink-0 text-right text-xs text-muted-foreground">{q.baseDscr.toFixed(2)} <span className="mx-0.5">&rarr;</span><span className={q.floodDscr < 1 ? "text-fail" : "text-ok"}> {q.floodDscr.toFixed(2)}</span></span>
      </button>
    </li>
  )
}

export default function App() {
  return <Shell />
}
