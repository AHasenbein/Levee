// Netlify Function: the whole API, same app as the local server. State lives in Netlify Blobs.
import { createApp } from "../../server/app.js"
import { createBilling } from "../../server/billing.js"
import { createStripeBilling, createCredits } from "../../server/stripe.js"

const stripe = await createStripeBilling({ credits: createCredits() })
const app = createApp({ billing: createBilling(), stripe })

export default async (req) => app.fetch(req)
export const config = { path: "/v1/*" }
