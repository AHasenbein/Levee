import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { existsSync } from "node:fs"
import { createApp } from "./app.js"
import { createBilling } from "./billing.js"
import { createStripeBilling, createCredits } from "./stripe.js"

const stripe = await createStripeBilling({ credits: createCredits() })
const app = createApp({ billing: createBilling(), stripe })
if (existsSync("dist")) {
  app.use("/*", serveStatic({ root: "./dist" }))
  app.get("*", serveStatic({ path: "./dist/index.html" }))
}
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`Levee API on http://localhost:${port} (payments: ${process.env.PAYMENTS_MODE ?? "mock"}, stripe: ${stripe.enabled ? "on" : "off"})`))
