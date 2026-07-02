# xGameFi — Hackathon Pitch Deck

> Single-file pitch deck. One section per slide, separated by `---`. Slide bodies are intentionally minimal (talk tracks live in the **Speaker notes** + the full **Pitch script** at the end). Technical claims are grounded in `SPEC.md` and the actual repo; anything inferred rather than confirmed is tagged `[inferred]`.
>
> Target pitch length: 3–5 minutes.

---

## Slide 1: Title

# xGameFi

**Commerce infrastructure for game studios — connect your game, get a Stellar-powered shop, go live in hours.**

- Team: **[Team Name — TBD]**
- Stack: Next.js 16 · Prisma 7 / PostgreSQL · Redis / BullMQ · Stellar · pnpm monorepo · Railway
- Repo: `webnxt-2030/xgamefi` · branch `develop`

![Placeholder: xGameFi wordmark on obsidian background with acid-lime accent — "Neon Overdrive" hero with clipped corners and faint scanlines](placeholder-image.png)

**Speaker notes:** This is xGameFi — the missing commerce layer for game studios. The big idea: a studio connects its existing item API and gets a professional, Stellar-powered storefront in hours instead of sprints — payments, fulfilment, P2P resale, referrals, and promotions handled. We built it as a pnpm monorepo with a Next.js web app, a BullMQ worker, and three shared packages, designed to deploy on Railway. Everything settles on-chain on Stellar, so studios get paid instantly after a platform fee. I'll show you the single demo moment the whole system is built around: scan, pay, deliver — live.

---

## Slide 2: Problem

- Every indie studio that wants to sell in-game items **rebuilds the same non-game plumbing**: a payment rail, a shop UI, a delivery pipeline, a fraud/idempotency layer.
- That plumbing is **expensive, slow, and brittle** — and it's not the game. Studios burn weeks on commerce instead of content.
- Players pay the price too: **per-game checkout flows**, weak security, no resale, no portable wallet identity.
- Web3 gaming promises ownership, but today it mostly delivers **friction** — not a real checkout.

![Placeholder: side-by-side "before" sketch — N studios each hand-building payment+shop+delivery vs. one xGameFi layer](placeholder-image.png)

**Speaker notes:** The pain point is specific and universal: any indie studio selling skins, cores, or gear has to build the same three things every single time — a payment rail, a shop, and a delivery pipeline. None of that is the game; all of it is plumbing. SPEC.md frames xGameFi as exactly that missing layer. The cost isn't just engineering time — it's that players end up with janky, per-game checkout flows and no real ownership. Web3 gaming promised item ownership, but so far it's mostly delivered friction. We fix the friction: one connect step, a real wallet-based checkout, and on-chain settlement that a studio can trust.

---

## Slide 3: Solution

**xGameFi is the commerce infrastructure layer between a game's item system and the Stellar network — multi-tenant storefronts, primary sales, and P2P resale that settle on-chain.**

- **Connect once:** a studio plugs in its game's item API (pull) or pushes items via signed webhook — gets a branded shop at `/s/[slug]`.
- **Pay with any Stellar wallet:** players sign a nonce challenge (no password), pay XLM or USDT with Freighter; the platform verifies every payment on-chain server-side.
- **Money + delivery handled:** instant net payout to the studio, signed `purchase.completed` webhook to the game, P2P escrow marketplace, referrals, and promotions — all ledgered.

![Placeholder: three-step diagram — Connect item API → Branded storefront → Stellar settlement (payout + webhook + ledger)](placeholder-image.png)

**Speaker notes:** One sentence: xGameFi is the commerce layer between a game's item system and Stellar. Three things make it work. First, connect once — a studio either lets us pull items from their API or pushes them via a signed webhook, and they immediately get a branded storefront at a memorable slug. Second, players pay with any Stellar wallet — they sign a server-issued nonce, no password, and pay in XLM or a configured stablecoin with Freighter; crucially, we never trust the client — every payment is verified on-chain server-side before anything advances. Third, we handle the rest of the money and delivery: instant net payout to the studio, a signed webhook telling the game to grant the item, plus a P2P resale market, referrals, and promotions — all recorded in an append-only ledger.

---

## Slide 4: Demo

**The single demo moment (SPEC §1): scan → pay → deliver, live.**

1. Open the **Gridlock Games** storefront at `/s/gridlock` (branded per-studio).
2. Connect **Freighter** → sign the wallet challenge → player session (no password).
3. Pick the **Sword Skin @ 1 USDT** → checkout renders a **QR** (`web+stellar:` deep link) + "Pay with Freighter".
4. Player pays; **stellar-watcher** verifies the on-chain payment by memo → `Order PAID` → payout + signed webhook fire.
5. Game grants the item → **SSE feed** (`/orders/:id/events`) shows `payment in → item delivered` in real time.

![Placeholder: storefront grid of Gridlock items + checkout panel with QR code, Freighter pay button, and live status "PAID / DELIVERED"](placeholder-image.png)

[PLACEHOLDER: Demo video — 60–90s screen capture: open /s/gridlock, connect Freighter, click Sword Skin, scan/click QR, watch the SSE status flip from PENDING → PAID → DELIVERED. End on the live transaction feed.]

**Speaker notes:** This is the moment everything is built around, straight from SPEC. I open the Gridlock Games storefront. An audience member connects Freighter — that's a wallet signature on a server nonce, no password, no account. They pick the Sword Skin for one USDT. Checkout returns a quote with a destination account, the asset, the amount, and a memo that binds the payment to the order, plus a QR code. They scan it or click "Pay with Freighter." Once they sign, our stellar-watcher job polls Horizon, matches the payment by memo, and verifies destination, asset, amount on-chain. The order flips to PAID, we write a ledger entry, the net payout goes to the studio, and a signed webhook tells Gridlock to grant the skin. The SSE feed updates live — payment in, item delivered. In CI we run this end-to-end against Stellar testnet, funding a throwaway wallet via friendbot, and assert PAID then DELIVERED through the SSE stream.

---

## Slide 5: How it works

**Architecture** — two runtime apps over three shared packages, one trust boundary in `packages/shared`.

- **`apps/web`** — Next.js 16 App Router: storefront, studio dashboard, admin console, and `/api/v1` route handlers (UI + API in one process).
- **`apps/worker`** — BullMQ consumers on Redis: `catalogue-sync`, `stellar-watcher`, `webhook-delivery`, `payout`, `p2p-settlement`, `referral-reward`, `refund` — all idempotent.
- **`packages/shared`** — money (Decimal/7-dp), HMAC, SSRF guard, Stellar `verifyPayment`/`sendPayment`, idempotency, settlement state machines. Written tests-first; shared by web + worker so there's **one** implementation of every trust-boundary rule.
- **Data:** PostgreSQL 17 via Prisma 7; Redis for sessions/queues/locks/rate-limit/idempotency; MinIO (S3) for object storage. Money is **always Decimal, never float**.

![Placeholder: architecture diagram — Player/Freighter → apps/web (storefront+API) → Postgres/Redis → apps/worker (watcher/payout/webhook) → Stellar Horizon + Game Dev API](placeholder-image.png)

**Speaker notes:** Two processes share one codebase: a Next.js web service for the UI and the API, and a BullMQ worker for background jobs. Under them, three shared packages — config, db, and shared. The important one is shared: every rule that touches money or trust lives there and is written tests-first — fee math with bignumber.js to 7 decimals, HMAC signing, the SSRF guard, Stellar payment verification, idempotency, and the order and P2P settlement state machines. Both web and worker import the same code, so there's exactly one implementation of "verify a payment" or "compute a payout" — no drift. Postgres is the source of truth via Prisma 7; Redis handles sessions, queues, distributed locks, and idempotency. Every money step is verified on-chain server-side before state advances, and the stellar-watcher means confirmation doesn't depend on the browser staying open — which is what makes the live demo reliable.

---

## Slide 6: Impact / market

- **Who needs this:** indie / mid-size game studios selling in-game items (skins, cores, gear) who can't afford to build and secure their own payment rail.
- **Why now:** Stellar gives fast, cheap, final settlement with instant payouts; Freighter makes wallet UX mainstream; web3 gaming has the audience but lacks the **checkout** layer.
- **Anchor partner / v1 target:** Gridlock Games (SPEC §1) — a real studio onboarded through the demo seed.
- **Business model:** per-transaction **platform fee** (`platformFeeBps`); studios get the net instantly on-chain. Multi-tenant by design — every studio query is scoped by `studioId`.

![Placeholder: market framing — "indie studios" segment + "web3 gaming" TAM + xGameFi as the checkout/payout rail between them and Stellar](placeholder-image.png)

**Speaker notes:** Who needs this is concrete: indie and mid-size game studios that sell in-game items but can't justify building and securing their own payment infrastructure. Our anchor partner and v1 target, named in the spec, is Gridlock Games — a real studio we onboard through the seed data so the demo runs immediately. Why now: Stellar settles fast and cheap with finality, Freighter makes the wallet experience mainstream, and web3 gaming has the audience but is missing exactly the checkout layer we provide. The business model is a per-transaction platform fee configurable in basis points; studios receive the net instantly on-chain. And it's multi-tenant from the ground up — every studio-scoped query is filtered by studio ID, so one deployment serves many studios.

---

## Slide 7: What's next

**Gaps between SPEC.md and the shipped code — logical next features.**

- **Studio dashboard UI:** the API exists, but the `/dashboard` overview, `/dashboard/transactions`, `/dashboard/p2p` management, and `/dashboard/settings` pages are not yet built. *(confirmed — file tree)*
- **Storefront completeness:** wallet-gated `/s/[slug]/me/purchases` purchase history and the `/s/[slug]/market/sell` create-listing UI are missing. *(confirmed)*
- **Missing spec endpoints:** `GET /orders/:id` (status), `GET /p2p/trades/:id` (trade status), and `POST /ingest/delivery-confirmation` (async grant confirm) are specified but not implemented. *(confirmed)*
- **Object storage:** MinIO is provisioned in dev infra and `.env` has S3 vars, but there's no presigned-upload / image-upload code yet — item images currently come from the game API pull. `[inferred gap]`
- **Pubnet readiness:** finalize the stablecoin issuer, lock the exact platform fee %, and move from testnet to pubnet (SPEC §14 marks these TBD/out-of-scope for the demo).
- **Explicit v1 non-goals (SPEC §14):** DEX routing / path payments, auctions, fiat on-ramp, mobile apps, multi-region.

![Placeholder: roadmap timeline — Close dashboard gaps → Object storage → Pubnet hardening → DEX/auctions](placeholder-image.png)

**Speaker notes:** Being honest about the gap between spec and shipped code — that's where the roadmap comes from. The studio-facing API is fully built, but four dashboard pages aren't there yet: the overview, transactions, P2P management, and settings. On the storefront, wallet-gated purchase history and the create-listing UI are missing. A few endpoints from the spec aren't implemented yet — a plain order-status GET, a trade-status GET, and the delivery-confirmation ingest endpoint. Object storage is an inferred gap: MinIO is provisioned and the env is wired, but there's no upload code, so images currently come from the game API. Then the pubnet work: finalize the stablecoin issuer, lock the exact platform fee percentage, and move off testnet. And the explicit v1 non-goals from the spec — DEX routing, auctions, fiat on-ramp, mobile apps — are the natural next horizon.

---

## Slide 8: Team & thanks

- **[Your Name]** — role / contact
- **[Teammate]** — role / contact
- **[Teammate]** — role / contact

Built with: Stellar · Freighter · Next.js 16 · Prisma 7 · BullMQ · Tailwind v4 · Railway · Playwright
Docs: `SPEC.md` · `AGENT.md` · `BRAND.md` · `docs/features.md`

Thanks to the Stellar ecosystem, the Gridlock Games team as our anchor partner, and the hackathon organizers.

![Placeholder: team logo / contact card with handles and a QR to the repo](placeholder-image.png)

**Speaker notes:** That's xGameFi — commerce infrastructure for game studios, settling on Stellar. The team placeholders are here for you to fill in with names, roles, and contact handles. Everything I showed is real and in the repo on the develop branch, documented across the spec, the engineering guide, the brand system, and a running feature log. Huge thanks to the Stellar and Freighter ecosystems for making wallet payments this accessible, to Gridlock Games as our anchor partner, and to the organizers. We'd love your questions.

---

# Pitch script (readable, for recording)

> ~3.5–4 minutes spoken. Read top to bottom. Replace bracketed placeholders before recording.

**[Slide 1 — Title]**
Hey, I'm [name], and this is xGameFi — the missing commerce layer for game studios. The pitch in one line: a studio connects its game's item system and gets a professional, Stellar-powered storefront in hours, instead of building one from scratch. We built it as a pnpm monorepo — a Next.js web app, a BullMQ worker, and three shared packages — designed to deploy on Railway. Everything settles on-chain on Stellar, so studios get paid instantly after a small platform fee. Let me show you the one moment the whole system is built around.

**[Slide 2 — Problem]**
Here's the problem. Every indie studio that wants to sell in-game items — skins, cores, gear — has to build the same three things every single time: a payment rail, a shop UI, and a delivery pipeline. None of that is the game. All of it is plumbing, and it's expensive, slow, and brittle. Players pay for it too, with janky per-game checkout flows and no real ownership. Web3 gaming promised item ownership, but so far it's mostly delivered friction. We're here to fix the friction — one connect step, a real wallet checkout, and on-chain settlement a studio can actually trust.

**[Slide 3 — Solution]**
So here's the solution. xGameFi is the commerce layer between a game's item system and the Stellar network. Three things make it work. First, connect once — a studio either lets us pull items from their API, or pushes them via a signed webhook, and they immediately get a branded storefront. Second, players pay with any Stellar wallet — they sign a server-issued nonce, no password, and pay in XLM or a stablecoin with Freighter. We never trust the client: every payment is verified on-chain, server-side, before anything moves. Third, we handle the rest — instant net payout to the studio, a signed webhook telling the game to grant the item, plus a P2P resale market, referrals, and promotions, all recorded in an append-only ledger.

**[Slide 4 — Demo]**
This is the demo moment, straight from the spec. I open the Gridlock Games storefront. An audience member connects Freighter — that's a wallet signature on a nonce, no account, no password. They pick the Sword Skin for one USDT. Checkout returns a quote with the destination account, the asset, the amount, and a memo that binds the payment to the order, plus a QR code. They scan it, or click "Pay with Freighter," and sign. Our stellar-watcher job polls Horizon, matches the payment by memo, and verifies the destination, asset, and amount on-chain. The order flips to PAID, we write a ledger entry, the net goes to the studio, and a signed webhook tells Gridlock to grant the skin. The live feed updates in real time — payment in, item delivered. We run this whole path end-to-end in CI against Stellar testnet and assert PAID then DELIVERED through the SSE stream.

**[Slide 5 — How it works]**
Under the hood, it's two processes sharing one codebase: a Next.js web service for the UI and the API, and a BullMQ worker for background jobs. Below them, three shared packages. The one that matters is shared — every rule that touches money or trust lives there and is written tests-first. Fee math uses bignumber.js to seven decimals, never float. HMAC signing, the SSRF guard, Stellar payment verification, idempotency, and the order and P2P settlement state machines are all in one place, imported by both web and worker. Postgres is the source of truth via Prisma 7; Redis handles sessions, queues, locks, and idempotency. Because the stellar-watcher confirms payments server-side, the demo doesn't depend on the browser staying open — which is what makes it reliable on stage.

**[Slide 6 — Impact]**
Who needs this is concrete: indie and mid-size studios that sell in-game items but can't justify building and securing their own payment rail. Our anchor partner and v1 target, named in the spec, is Gridlock Games — a real studio onboarded through the seed so the demo runs immediately. Why now: Stellar settles fast and cheap with finality, Freighter makes the wallet experience mainstream, and web3 gaming has the audience but is missing exactly the checkout layer we provide. The business model is a per-transaction platform fee, configurable in basis points; studios get the net instantly, on-chain. And it's multi-tenant from the ground up — every studio query is scoped by studio ID, so one deployment serves many studios.

**[Slide 7 — What's next]**
We want to be honest about the gap between spec and shipped code, because that's the roadmap. The studio-facing API is fully built, but four dashboard pages aren't there yet — the overview, transactions, P2P management, and settings. On the storefront, wallet-gated purchase history and the create-listing UI are still missing. A few endpoints from the spec aren't implemented — a plain order-status endpoint, a trade-status endpoint, and the delivery-confirmation webhook. Object storage is the next infrastructure piece: MinIO is provisioned and the env is wired, but there's no upload code yet, so images come from the game API. Then comes pubnet hardening — finalize the stablecoin issuer, lock the exact fee percentage, and move off testnet. After that, the spec's explicit v1 non-goals: DEX routing, auctions, a fiat on-ramp, and mobile.

**[Slide 8 — Team]**
That's xGameFi — commerce infrastructure for game studios, settling on Stellar. The team placeholders are here for you to fill in. Everything I showed is real, it's all in the repo on the develop branch, and it's documented across the spec, the engineering guide, the brand system, and a running feature log. Thanks to the Stellar and Freighter ecosystems, to Gridlock Games as our anchor partner, and to the organizers. We'd love your questions.