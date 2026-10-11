const REPO = "https://github.com/AHasenbein/Levee"

export default function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <a href="/" className="text-sm text-muted-foreground underline hover:text-foreground">Back to Levee</a>
      {kind === "privacy" ? (
        <div className="mt-6 space-y-4 text-sm leading-relaxed">
          <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
          <p className="text-muted-foreground">Levee is a hackathon demo. It shows how a rental deal holds up in a flood year, using illustrative data.</p>
          <h2 className="pt-2 text-base font-semibold">What we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>If you sign in with Google: your Google email address and name. We receive them from Google's sign-in token. We never see your Google password.</li>
            <li>An anonymous key stored in your browser (local storage) that links you to your remaining analyses, plan and prepaid credits.</li>
            <li>Usage counts: how many analyses you ran, so we can enforce free analyses, plans and credits.</li>
            <li>The deal inputs and addresses you enter to run an analysis, which are processed to produce your result.</li>
          </ul>
          <h2 className="pt-2 text-base font-semibold">Payments</h2>
          <p>Card payments run through Stripe in test mode only. We do not receive or store card numbers, and no real money moves.</p>
          <h2 className="pt-2 text-base font-semibold">How we use it</h2>
          <p>Only to run the app: sign you in, keep your analyses and plan, and meter usage. We do not sell your data or use it for advertising.</p>
          <h2 className="pt-2 text-base font-semibold">Where it is stored</h2>
          <p>Account and usage records are stored with our hosting provider (Netlify). Sign out clears the key from your browser. To have your account data deleted, open an issue at <a className="underline" href={REPO}>{REPO}</a>.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4 text-sm leading-relaxed">
          <h1 className="text-2xl font-semibold tracking-tight">Terms of service</h1>
          <p>Levee is a hackathon demo provided as is, with no warranty.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>The analyses use illustrative demo data and labeled assumptions. They are not financial, investment, insurance or legal advice, and not a flood-risk certification of any property.</li>
            <li>Payments are in Stripe test mode. No real charges are made.</li>
            <li>We may change or remove the service at any time.</li>
          </ul>
          <p>Questions: <a className="underline" href={REPO}>{REPO}</a>.</p>
        </div>
      )}
    </div>
  )
}
