# Levee (working name)

Stress-tests a rental deal against its worst plausible year (flood). Hackathon project, two people.

## Scope (nothing else)
Austin, flood only, five seeded demo properties. One demo moment: a deal that looks fine flips to failing when a flood year is applied. Out: other hazards/cities, auth, live scraping, real money.

## Hard rules
- Never invent numbers. `src/engine.js` computes everything; memos/UI only restate engine output.
- Every assumption lives in `src/data.js` (`ASSUMPTIONS`) and is returned in the API response and shown on screen.
- Money is integer cents inside the engine. Units in names (`annualRentUsd`, `probPerYear`). Probabilities are 0-1, never percents.
- Same seed, same output. Change a formula only after updating its test first.
- Demo data is illustrative and labeled as such. Do not claim a backtest, FEMA lookup, or live AgentCore payments until actually done.
- Read current AWS docs before touching a preview service. Payments stay behind one interface with a mock; agent always has a spending cap.

## Commands
- `npm test` - golden tests + sim sanity (run before saying done)
- `npm start` - serve the demo at http://localhost:8080 (or just open `index.html`)

## Layout and ownership
| Path | Owner |
|---|---|
| `src/engine.js`, `src/data.js`, `test/` | Person A (engine, data) |
| `src/api.js` payments/agent/memo, `infra/` (AWS) | Person B (AWS, agent, payments) |
| `index.html` | shared; keep edits small, pull first |
| API contract (request/response shape in `src/api.js`) | change only by agreement |

Don't edit the other person's files; ask them or open a PR for them.

## Git workflow (hackathon speed)
- `main` is always demoable. Never push broken code to it; `npm test` must pass.
- One short-lived branch per task: `a/<topic>` or `b/<topic>` (e.g. `a/monte-carlo`, `b/mock-402`). Aim to live under ~1-2 hours.
- Start: `git switch main && git pull --rebase && git switch -c a/<topic>`
- Commit small and often, imperative messages (`Add flood zone cache`).
- Ship: `git fetch && git rebase origin/main && npm test && git push -u origin HEAD`, then `gh pr create --fill` and `gh pr merge --squash --delete-branch`. With one reviewer-free teammate, self-merge if tests pass and tell the other in chat.
- Pull `main` (rebase, not merge commits) at least hourly and before starting anything new.
- Conflicts: the owner of the file wins; the other re-applies on top.
- Keep `index.html` conflicts down: put new logic in `src/*.js`, only wire it in the page.
- Deploy freeze for the last third: only fixes, no features. Tag the demo build: `git tag demo-v1`.
- Never commit secrets or AWS credentials; use env vars.

## Definition of done
Tests pass, page loads with no console errors, change pushed and merged to `main` the same hour.
