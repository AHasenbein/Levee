import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getMonetization, getLedger, getPacks, getCredits, openStripePortal, startCheckout, subscribe, type Pack, type PlanStatus } from "@/lib/client"
import { usd2 } from "@/lib/format"
import type { Health, Ledger, MonetizationStatus } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default function PricingPage({ health }: { health: Health | null }) {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [packs, setPacks] = useState<{ enabled: boolean; packs: Pack[]; plans: { id: string; name: string; priceCents: number; analyses: number }[] } | null>(null)
  const [credits, setCredits] = useState<{ total: number; balance: number; plan: PlanStatus | null } | null>(null)
  const [subErr, setSubErr] = useState<string | null>(null)
  const [subbing, setSubbing] = useState<string | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [mon, setMon] = useState<MonetizationStatus | null>(null)
  const [payErr, setPayErr] = useState<string | null>(null)

  useEffect(() => {
    getPacks().then(setPacks as never).catch(() => {})
    getCredits().then(setCredits).catch(() => {})
    getMonetization().then(setMon).catch(() => {})
  }, [])
  useEffect(() => { getLedger().then(setLedger).catch(() => {}) }, [])

  const price = health?.priceUsd ?? 0.5
  const buy = (id: string) => { setBuying(id); setPayErr(null); startCheckout(id).catch((e) => { setPayErr(e.message); setBuying(null) }) }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pay for analyses</h1>
        <p className="mt-2 text-base text-muted-foreground">Each analysis costs <b className="text-foreground">{usd2(price)}</b>. This is a demo: payments run in test mode and no real money moves.</p>
      </div>

      <section className="rounded-lg border p-5">
        <div className="text-sm text-muted-foreground">You have</div>
        <div className="mt-2 flex flex-wrap gap-x-10 gap-y-3">
          <div><div className="tnum text-3xl font-semibold">{credits?.total ?? 0}</div><div className="text-sm text-muted-foreground">analyses left</div>{credits?.plan && <div className="mt-1 text-xs text-muted-foreground">{credits.plan.plan} plan: {credits.plan.used} of {credits.plan.quota} used this month, plus {credits.balance} prepaid</div>}</div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Every new visitor gets 3 free analyses. Running an analysis uses one.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Buy more analyses with a card</h2>
        <div className="rounded-lg border p-5">
          {packs && !packs.enabled ? (
            <p className="text-sm text-muted-foreground">Card payments are not set up on this server.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Click a button to pay on Stripe's secure page. <b className="text-foreground">Use the test card 4242 4242 4242 4242, any future date, any 3 digits.</b></p>
              <div className="mt-4 flex flex-wrap gap-3">
                {packs?.packs.map((k) => (
                  <Button key={k.id} size="lg" onClick={() => buy(k.id)} disabled={buying !== null}>
                    {buying === k.id && <Loader2 className="animate-spin" />} Pay ${(k.priceCents / 100).toFixed(2)} for {k.analyses} analyses
                  </Button>
                ))}
              </div>
              {payErr && <p className="mt-3 text-sm text-fail">{payErr}</p>}
            </>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Or subscribe to a monthly plan</h2>
        <div className="rounded-lg border p-5">
          <p className="text-sm text-muted-foreground">Billed every month by Stripe. <b className="text-foreground">Use the test card 4242 4242 4242 4242, any future date, any 3 digits.</b> When a plan's analyses run out, any prepaid analyses are used, then you can buy more above.</p>
          {mon && mon.state !== "not-configured" && <p className="mt-2 text-xs text-muted-foreground">Plans, entitlements and usage metering powered by AWS App Monetization.</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[{ id: "free", name: "Free", priceCents: 0, analyses: 3 }, ...(packs?.plans.filter((p) => p.priceCents > 0) ?? [])].map((p) => {
              const current = credits?.plan?.planId === p.id
              return (
                <div key={p.id} className={"rounded-md border p-4 " + (current ? "border-foreground" : "")}>
                  <div className="flex items-center justify-between text-sm font-medium">{p.name}{current && <Badge variant="outline">Your plan</Badge>}</div>
                  <div className="tnum mt-1 text-2xl font-semibold">{p.priceCents === 0 ? "$0" : `$${(p.priceCents / 100).toFixed(2)}`}<span className="text-sm font-normal text-muted-foreground"> /mo</span></div>
                  <div className="mt-2 text-sm text-muted-foreground">{p.analyses} analyses {p.priceCents === 0 ? "to try (one time)" : "per month"}</div>
                  {p.priceCents > 0 && (current
                    ? <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => openStripePortal().catch((e) => setSubErr(e.message))}>Manage subscription</Button>
                    : <Button size="sm" className="mt-3 w-full" disabled={subbing !== null || packs?.enabled === false} onClick={() => { setSubbing(p.id); setSubErr(null); subscribe(p.id).catch((e) => { setSubErr(e.message); setSubbing(null) }) }}>
                        {subbing === p.id && <Loader2 className="animate-spin" />} Subscribe
                      </Button>)}
                </div>
              )
            })}
          </div>
          {subErr && <p className="mt-3 text-sm text-fail">{subErr}</p>}
        </div>
      </section>

      <details className="rounded-lg border p-5">
        <summary className="cursor-pointer text-sm font-medium">For developers and agents: how the payment API works</summary>
        <ol className="mt-3 space-y-1 text-sm text-muted-foreground">
          <li>1. Call <code className="font-mono text-xs">POST /v1/stress</code>. Without payment the server answers <b className="text-foreground">402 Payment Required</b> with x402 payment instructions.</li>
          <li>2. Pay from a payment session with a hard budget, enforced on the server.</li>
          <li>3. Retry with the <code className="font-mono text-xs">X-PAYMENT</code> receipt. Receipts are single use.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">Settled on this server so far: {ledger ? `${usd2(ledger.revenueUsd)} across ${ledger.count} payments` : "–"} (test mode).</p>
        <p className="mt-2 text-xs text-muted-foreground">Why micropayments: AWS says card rails cost about 25 cents plus 2.5 percent per transaction, against roughly a tenth of a cent for stablecoin settlement (AWS's claim as reported, not verified here). At {usd2(price)} the card fee alone would be {usd2(0.25 + 0.025 * price)}, or {(((0.25 + 0.025 * price) / price) * 100).toFixed(1)}% of the price.</p>
      </details>
    </div>
  )
}
