/// <reference types="vite/client" />

interface Window {
  google?: { accounts: { id: {
    initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
  } } }
}
