import { useState } from "react"
import { Loader2 } from "lucide-react"
import { ApiError, loanCalc, lookupAddress } from "@/lib/client"
import { usd } from "@/lib/format"
import type { Flood, Subject } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const field = (label: string, value: string, set: (v: string) => void, hint?: string) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Input inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} className="tnum" />
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
)

export default function CustomDeal({ onAnalyze }: { onAnalyze: (s: Subject) => void }) {
  const [address, setAddress] = useState("")
  const [flood, setFlood] = useState<Flood | null>(null)
  const [matched, setMatched] = useState("")
  const [looking, setLooking] = useState(false)
  const [lookErr, setLookErr] = useState<string | null>(null)
  const [prob, setProb] = useState("")
  const [rent, setRent] = useState("30000")
  const [other, setOther] = useState("7000")
  const [ins, setIns] = useState("2000")
  const [debt, setDebt] = useState("16000")
  const [price, setPrice] = useState("300000")
  const [down, setDown] = useState("20")
  const [rate, setRate] = useState("6.5")
  const [term, setTerm] = useState("30")
  const [loanErr, setLoanErr] = useState<string | null>(null)

  async function look() {
    setLooking(true); setLookErr(null); setFlood(null)
    try {
      const r = await lookupAddress(address)
      setFlood(r.flood); setMatched(r.address); setProb(String(r.flood.probPerYear))
    } catch (e) { setLookErr(e instanceof ApiError ? e.message : "Lookup failed") }
    finally { setLooking(false) }
  }

  async function useLoan() {
    setLoanErr(null)
    try {
      const r = await loanCalc({ priceUsd: +price, downPaymentFraction: +down / 100, annualRate: +rate / 100, termYears: +term })
      setDebt(String(r.annualDebtServiceUsd))
    } catch (e) { setLoanErr(e instanceof ApiError ? e.message : "Could not compute") }
  }

  const nums = [rent, other, ins, debt].map(Number)
  const valid = !!flood && nums.every((n) => Number.isFinite(n) && n >= 0) && nums[3] > 0 && Number(prob) >= 0 && Number(prob) <= 1

  function submit() {
    if (!flood || !valid) return
    onAnalyze({
      id: "custom-" + Date.now(), custom: true, label: "Your deal", address: matched,
      flood: { ...flood, probPerYear: Number(prob), basis: Number(prob) === flood.probPerYear ? flood.basis : "Manual override by user" },
      deal: { annualRentUsd: nums[0], otherOperatingCostsUsdPerYear: nums[1], insuranceUsdPerYear: nums[2], debtServiceUsdPerYear: nums[3], holdYears: 30 },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analyze your own deal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Austin, TX addresses only. The flood zone comes from FEMA's flood map.</p>
      </div>
      <section className="space-y-3 rounded-lg border p-5">
        <h2 className="text-sm font-semibold">1. Property</h2>
        <div className="flex gap-2">
          <Input placeholder="e.g. 900 Barton Springs Rd" value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && address.length > 4 && look()} />
          <Button onClick={look} disabled={looking || address.trim().length < 5} variant="outline">{looking && <Loader2 className="animate-spin" />} Look up flood zone</Button>
        </div>
        {lookErr && <p className="text-sm text-fail">{lookErr}</p>}
        {flood && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{matched}</p>
            <p className="text-muted-foreground">FEMA zone {flood.zone}{flood.subtype ? `, ${flood.subtype.toLowerCase()}` : ""}. {flood.basis}.</p>
            <div className="mt-3 max-w-xs">{field("Annual flood probability (0 to 1)", prob, setProb, "Prefilled from the zone. Edit to override.")}</div>
          </div>
        )}
      </section>
      <section className="space-y-4 rounded-lg border p-5">
        <h2 className="text-sm font-semibold">2. Deal, per year</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("Annual rent ($)", rent, setRent)}
          {field("Other operating costs ($)", other, setOther)}
          {field("Insurance ($)", ins, setIns)}
          {field("Debt service ($)", debt, setDebt, "Or compute it from a loan below.")}
        </div>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">Compute debt service from a loan</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {field("Price ($)", price, setPrice)}{field("Down payment (%)", down, setDown)}{field("Rate (%)", rate, setRate)}{field("Term (years)", term, setTerm)}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={useLoan}>Use as debt service</Button>
            {loanErr && <span className="text-sm text-fail">{loanErr}</span>}
          </div>
        </details>
        {valid && <p className="text-sm text-muted-foreground">Net operating income before any flood: {usd(nums[0] - nums[1] - nums[2])} against {usd(nums[3])} of debt service.</p>}
        <Button onClick={submit} disabled={!valid}>Continue to analysis</Button>
      </section>
    </div>
  )
}
