import { useEffect, useRef, useState } from "react"
import { getAccount, getAccountConfig, signInWithGoogle, signOut } from "@/lib/client"
import { Button } from "@/components/ui/button"

const GSI = "https://accounts.google.com/gsi/client"
function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const el = document.querySelector<HTMLScriptElement>(`script[src="${GSI}"]`) ?? Object.assign(document.createElement("script"), { src: GSI, async: true })
    el.addEventListener("load", () => resolve()); el.addEventListener("error", () => reject(new Error("Could not load Google sign-in")))
    if (!el.isConnected) document.head.appendChild(el)
  })
}

export default function AccountMenu() {
  const [email, setEmail] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const btn = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refresh = () => getAccount().then((a) => setEmail(a.email)).catch(() => setEmail(null))
    refresh()
    getAccountConfig().then((c) => setClientId(c.googleClientId)).catch(() => {})
    window.addEventListener("levee:refresh", refresh)
    return () => window.removeEventListener("levee:refresh", refresh)
  }, [])

  useEffect(() => {
    if (!open || email || !clientId) return
    let live = true
    loadGsi().then(() => {
      if (!live || !btn.current) return
      window.google!.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => signInWithGoogle(r.credential).then(() => setOpen(false)).catch((e) => setErr(e.message)),
      })
      window.google!.accounts.id.renderButton(btn.current, { theme: "outline", size: "large", text: "signin_with", width: 240 })
    }).catch((e) => setErr(e.message))
    return () => { live = false }
  }, [open, email, clientId])

  if (email) {
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="max-w-[160px] truncate" title={email}>{email}</span>
        <button className="underline hover:text-foreground" onClick={signOut}>Sign out</button>
      </span>
    )
  }
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => { setOpen((o) => !o); setErr(null) }}>Sign in</Button>
      {open && (
        <div className="absolute right-0 top-9 z-10 w-72 rounded-lg border bg-background p-4 shadow-md">
          {clientId ? (
            <>
              <p className="mb-3 text-sm text-muted-foreground">Sign in with Google to keep your analyses and plan across devices. We never see your password.</p>
              <div ref={btn} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Google sign-in is not configured on this server. Set <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code>.</p>
          )}
          {err && <p className="mt-2 text-sm text-fail">{err}</p>}
        </div>
      )}
    </div>
  )
}
