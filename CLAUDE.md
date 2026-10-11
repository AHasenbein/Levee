# Levee (working name)

Stress-tests a rental deal against its worst plausible year (flood). Hackathon project, two people.

## Scope (nothing else)
Austin, flood only, five seeded demo properties. One demo moment: a deal that looks fine flips to failing when a flood year is applied. Out: other hazards/cities, auth, live scraping, real money.

## Hard rules
- Never invent numbers. `src/lib/engine.js` computes everything; memos/UI only restate engine output.
- Every assumption lives in `src/lib/data.js` (`ASSUMPTIONS`) and is returned in the API response and shown on screen.
- Money is integer cents inside the engine. Units in names (`annualRentUsd`, `probPerYear`). Probabilities are 0-1, never percents.
- Same seed, same output. Change a formula only after updating its test first.
- Demo data is illustrative and labeled as such. Do not claim a backtest, FEMA lookup, or live AgentCore payments until actually done.
- Read current AWS docs before touching a preview service. Payments stay behind one interface with a mock; agent always has a spending cap.

## Commands
- `npm test` - engine, API, payments, memo and billing tests (run before saying done)
- `npm run dev` - API (port 8787) and Vite UI (http://localhost:5173) together
- `npm run typecheck` - type check the UI
- `npm run build-cache` - rebuild `data/properties.json` from live FEMA + Census lookups
- `npm run build` - production build to `dist/`
- Deploy: `netlify deploy --build --prod` (needs `netlify login`; env vars are set in the Netlify site)

Stack: Vite + React + TypeScript UI, Tailwind v4, shadcn/ui, Recharts. Hono API in `server/` (runs locally with Node and on Netlify Functions via `netlify/functions/api.mjs`). Engine in `src/lib/*.js` is plain ESM shared by the UI and server.

## Environment (never commit secrets; `.env*` files are gitignored)
- `.env`: `STRIPE_SECRET_KEY` (test mode), `STRIPE_PUBLISHABLE_KEY`.
- `.env.monetization`: optional subscription-billing service settings. Without it, billing is off and the API falls back to Stripe credits and pay-per-call (402).
- Server env: `PAYMENTS_MODE` (mock | bypass), `PRICE_USD`, `MEMO_SOURCE` (template | auto), `FREE_ANALYSES`, `APP_URL`, `PAYMENT_SECRET`, `API_KEY_SECRET`.

## How payments work
1. Free trial analyses (3 per new API key), then Stripe plan quota, prepaid Stripe credit packs, and finally HTTP 402 pay-per-call (x402-shaped, mock settlement) for API clients and the Deal Finder agent.
2. All state lives in `server/store.js` (memory locally, Netlify Blobs when deployed).
3. Stripe is test mode only. Do not put live keys in this project.

## Layout and ownership
| Path | Owner |
|---|---|
| `src/lib/engine.js`, `src/lib/data.js`, `test/` | Person A (engine, data) |
| `server/` (API, payments, billing, memo, agent), `netlify/` | Person B (AWS, agent, payments) |
| `src/App.tsx`, `src/components/` | shared; keep edits small, pull first |
| API contract (request/response shape in `server/app.js` and `server/validate.js`) | change only by agreement |

Don't edit the other person's files; ask them or open a PR for them.

## Git workflow (hackathon speed)
- `main` is always demoable. Never push broken code to it; `npm test` must pass.
- One short-lived branch per task: `a/<topic>` or `b/<topic>` (e.g. `a/monte-carlo`, `b/mock-402`). Aim to live under ~1-2 hours.
- Start: `git switch main && git pull --rebase && git switch -c a/<topic>`
- Commit small and often, imperative messages (`Add flood zone cache`).
- Ship: `git fetch && git rebase origin/main && npm test && git push -u origin HEAD`, then `gh pr create --fill` and `gh pr merge --squash --delete-branch`. With one reviewer-free teammate, self-merge if tests pass and tell the other in chat.
- Pull `main` (rebase, not merge commits) at least hourly and before starting anything new.
- Conflicts: the owner of the file wins; the other re-applies on top.
- Keep `App.tsx` conflicts down: put new UI in its own component file under `src/components/`, only wire it in `App.tsx`.
- Deploy freeze for the last third: only fixes, no features. Tag the demo build: `git tag demo-v1`.
- Never commit secrets or AWS credentials; use env vars.

## Definition of done
Tests pass, page loads with no console errors, change pushed and merged to `main` the same hour.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - You CAN create AWS WAF and Cloudwatch Logs resources in us-east-1 when there are global resources (like a global WAF instance) that require a connection to dependencies in us-east-1. You should not use these for any other reason, because resources in the selected Region will provide lower cost (due to no cross-Region traffic), increased availability (due to no cross-Region traffic), and easier manageability (due to not needing to look in another Region). When you need to do an inventory of resources, you need to look in both the selected Region and us-east-1 for Cloudwatch Logs or WAF resources.
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- Before starting a task, check whether a relevant AWS skill is available. Load the skill with retrieve_skill and prefer its guidance over general knowledge.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user’s request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion
<!-- END AWS Agent Toolkit rules -->
