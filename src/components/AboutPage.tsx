import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const CLAIMS: [string, string, string][] = [
  ["Every number comes from the stress engine", "True by construction", "The memo is validated against engine output and falls back to a template on any mismatch."],
  ["FEMA flood zones for the demo addresses", "Verified, live lookup, cached", "Zones come from FEMA's flood map via the Census geocoder. Deal inputs are demo values."],
  ["A 1 percent annual flood chance is about 26 percent over 30 years", "Arithmetic", "Assuming independent years: 1 - (1 - 0.01)^30."],
  ["Scores describe a property, Levee tests the deal", "Positioning", "Not verified that no other tool stress-tests small-landlord returns."],
  ["Backtested against real Austin flood events", "Not run", "Do not claim this until it is run."],
  ["The market underprices flood risk in Austin", "Not tested", "Do not claim this."],
  ["Insurance premiums", "Not modeled", "The premium multiplier is a labeled assumption."],
  ["Live AgentCore Payments", "Not enabled", "Mock settlement only."],
  ["Subscription billing", "Plans defined, publishing pending", "Plans are drafted; publishing needs payout onboarding. Until then analyses are pay-per-call or prepaid credits."],
  ["Card payments", "Stripe test mode", "Prepaid analysis packs use Stripe Checkout with test cards only. No real money moves."],
  ["Memo written by a Bedrock model", "Not yet", "Blocked on the account's Anthropic use-case form. The template memo is used until then."],
]

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">How it works, and what is claimed</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Deals are approved on an average year, and nobody tests the bad one. Levee applies a flood year to a rental deal and shows whether the mortgage still gets paid, then simulates the whole hold period. A deterministic engine does all the math; a model only writes the memo.
        </p>
      </div>
      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-semibold">Claims check</h2>
        <Table>
          <TableHeader><TableRow><TableHead>Claim</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
          <TableBody>{CLAIMS.map(([c, s, n]) => <TableRow key={c}><TableCell className="max-w-72 whitespace-normal">{c}</TableCell><TableCell className="whitespace-normal font-medium">{s}</TableCell><TableCell className="whitespace-normal text-muted-foreground">{n}</TableCell></TableRow>)}</TableBody>
        </Table>
      </section>
    </div>
  )
}
