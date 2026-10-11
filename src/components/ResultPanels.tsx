import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import { cn } from "@/lib/utils"
import { usd, pct } from "@/lib/format"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { Scenario, StressResult } from "@/lib/types"

export function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "fail" }) {
  return (
    <div className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("tnum mt-1 text-2xl font-semibold tracking-tight", tone === "ok" && "text-ok", tone === "fail" && "text-fail")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function SliderRow({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum font-medium">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v: any) => onChange(Array.isArray(v) ? v[0] : v)} />
    </div>
  )
}

export function ScenarioPanel({ scenario, onChange }: { scenario: Scenario; onChange: (s: Scenario) => void }) {
  const set = (k: keyof Scenario) => (v: number) => onChange({ ...scenario, [k]: v })
  return (
    <section className="rounded-lg border p-5">
      <h2 className="text-sm font-semibold">Flood year scenario</h2>
      <p className="mb-5 mt-0.5 text-sm text-muted-foreground">Defaults come from the assumptions table. Changing them means a new paid analysis.</p>
      <div className="grid gap-6 sm:grid-cols-2">
        <SliderRow label="Months vacant" value={scenario.vacantMonths} display={`${scenario.vacantMonths} mo`} min={0} max={12} step={1} onChange={set("vacantMonths")} />
        <SliderRow label="Insurance deductible" value={scenario.deductibleUsd} display={usd(scenario.deductibleUsd)} min={0} max={25000} step={500} onChange={set("deductibleUsd")} />
        <SliderRow label="Uninsured repair" value={scenario.uninsuredRepairUsd} display={usd(scenario.uninsuredRepairUsd)} min={0} max={20000} step={500} onChange={set("uninsuredRepairUsd")} />
        <SliderRow label="Premium multiplier" value={scenario.premiumMultiplier} display={`${scenario.premiumMultiplier.toFixed(1)}x`} min={1} max={2} step={0.1} onChange={set("premiumMultiplier")} />
      </div>
    </section>
  )
}

const chartConfig = { dscr: { label: "DSCR" } } satisfies ChartConfig

export function HoldPanel({ result, path, holdYears, probPerYear, onResample }: {
  result: StressResult; path: { year: number; flood: boolean; dscr: number }[]; holdYears: number; probPerYear: number; onResample: () => void
}) {
  const sim = result.simulation
  const yMax = Math.max(1.5, Math.ceil(result.base.dscr * 2) / 2)
  const yTicks = Array.from({ length: Math.round(yMax / 0.5) + 1 }, (_, i) => i * 0.5)
  const floods = path.filter((o) => o.flood).length
  return (
    <section className="rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Over a {holdYears}-year hold</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pct(sim.shareOfPathsWithFailingYear)} of {sim.paths.toLocaleString()} simulated paths include at least one failing year.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onResample}>Resample</Button>
      </div>
      <ChartContainer config={chartConfig} className="mt-4 h-56 w-full">
        <BarChart data={path} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} interval={4} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={32} domain={[0, yMax]} ticks={yTicks} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator labelFormatter={(_: any, pl: any) => `Year ${pl?.[0]?.payload?.year}${pl?.[0]?.payload?.flood ? " (flood)" : ""}`} formatter={(v: any) => Number(v).toFixed(2)} />} />
          <ReferenceLine y={1} stroke="var(--foreground)" strokeDasharray="4 4" />
          <Bar dataKey="dscr" radius={[2, 2, 0, 0]}>
            {path.map((o) => <Cell key={o.year} fill={o.dscr < 1 ? "var(--fail)" : "var(--ok)"} fillOpacity={o.dscr < 1 ? 1 : 0.55} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        One illustrative path with {floods} flood {floods === 1 ? "year" : "years"} (annual probability {probPerYear}). Years are treated as independent. Dashed line is break-even, 1.0.
      </p>
      <Table className="mt-4">
        <TableHeader><TableRow><TableHead>Measure</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
        <TableBody className="tnum">
          <TableRow><TableCell>Paths with a failing year (simulated, seed {sim.seed})</TableCell><TableCell className="text-right">{pct(sim.shareOfPathsWithFailingYear)}</TableCell></TableRow>
          {sim.closedFormValid && sim.closedFormShare != null && (
            <TableRow><TableCell>Closed form 1 - (1 - p)^H (valid here: base passes, a flood always breaks it)</TableCell><TableCell className="text-right">{pct(sim.closedFormShare)}</TableCell></TableRow>
          )}
          <TableRow><TableCell>Worst-year DSCR, 5th percentile</TableCell><TableCell className="text-right">{sim.minDscrPercentiles.p5.toFixed(2)}</TableCell></TableRow>
          <TableRow><TableCell>Worst-year DSCR, median</TableCell><TableCell className="text-right">{sim.minDscrPercentiles.p50.toFixed(2)}</TableCell></TableRow>
          <TableRow><TableCell>Worst-year DSCR, 95th percentile</TableCell><TableCell className="text-right">{sim.minDscrPercentiles.p95.toFixed(2)}</TableCell></TableRow>
        </TableBody>
      </Table>
    </section>
  )
}
