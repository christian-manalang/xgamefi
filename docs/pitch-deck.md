# xGameFi — Hackathon Pitch Deck

> Single-file pitch deck. One section per slide, separated by `---`. Slide bodies are intentionally minimal (talk tracks live in the **Speaker notes** + the full **Pitch script** at the end). Technical claims are grounded in `SPEC.md` and the actual repo; anything inferred rather than confirmed is tagged `[inferred]`.
>
> Target pitch length: 3–5 minutes.
>
> **Voice rules for this deck:** listeners don't care about our tech stack, so we don't name tools, frameworks, or infrastructure. We don't boast "on-chain" — wallet settlement is table stakes for this crowd, not a feature. And we keep it plain: judges may not be engineers, so we describe *what happens* and *why it matters*, not how it's built.

---

## Slide 1: Title

# xGameFi

**Commerce infrastructure for game studios — connect your game, get a shop, go live in hours.**

- Team: **[Team Name — TBD]**
- Repo: `webnxt-2030/xgamefi` · branch `develop`

![Placeholder: xGameFi wordmark on obsidian background with acid-lime accent — "Neon Overdrive" hero with clipped corners and faint scanlines](placeholder-image.png)

**Speaker notes:** This is xGameFi — the missing commerce layer for game studios. The big idea: a studio connects its existing item system and gets a professional storefront in hours instead of weeks — payments, fulfilment, P2P resale, referrals, and promotions all handled. I'll show you the single demo moment the whole system is built around: browse, pay, get your item — live.

---

## Slide 2: Problem

- Every indie studio that wants to sell in-game items **rebuilds the same non-game plumbing**: a checkout, a shop, a delivery pipeline, a fraud layer.
- That plumbing is **expensive, slow, and brittle** — and it's not the game. Studios burn weeks on commerce instead of content.
- Players pay the price too: **per-game checkout flows**, weak security, no resale, no portable wallet identity.
- Web3 gaming promised ownership, but today it mostly delivers **friction** — not a real checkout.

![Placeholder: side-by-side "before" sketch — N studios each hand-building payment+shop+delivery vs. one xGameFi layer](placeholder-image.png)

**Speaker notes:** The pain is specific and universal: any indie studio selling skins, cores, or gear has to build the same three things every single time — a checkout, a shop, and a delivery pipeline. None of that is the game; all of it is plumbing. The cost isn't just engineering time — it's that players end up with janky, per-game checkouts and no real ownership. Web3 gaming promised item ownership, but so far it's mostly delivered friction. We fix the friction: one connect step, a real wallet checkout, and settlement a studio can trust.

---

## Slide 3: Solution

**xGameFi is the commerce layer between a game's item system and its players — multi-tenant storefronts, primary sales, and P2P resale.**

- **Connect once:** a studio plugs in its game's item system (pull from their API, or push via a signed webhook) and gets a branded shop at `/s/[slug]`.
- **Pay with a wallet:** players connect a wallet, sign in with one click (no password, no account creation), and pay; the platform verifies every payment before anything moves.
- **Money + delivery handled:** instant net payout to the studio, automatic item delivery to the game, plus a P2P resale market, referrals, and promotions — all recorded in a tamper-evident ledger.

![Placeholder: three-step diagram — Connect item system → Branded storefront → Settlement (payout + delivery + ledger)](placeholder-image.png)

**Speaker notes:** One sentence: xGameFi is the commerce layer between a game's item system and its players. Three things make it work. First, connect once — a studio either lets us pull items from their API or pushes them via a signed webhook, and they immediately get a branded storefront at a memorable slug. Second, players pay with a wallet — they sign in with one click, no password, no account; and we never trust the client — every payment is verified before anything advances. Third, we handle the rest of the money and delivery: instant net payout to the studio, an automatic signal telling the game to grant the item, plus a P2P resale market, referrals, and promotions — all recorded in an append-only ledger.

---

## Slide 4: Demo

**The single demo moment (SPEC §1): browse → pay → get your item, live.**

1. Open the **Gridlock Games** storefront at `/s/gridlock` (branded per-studio).
2. Connect a **wallet** → sign in with one click → player session (no password).
3. Pick the **Sword Skin @ 1 USDT** → checkout renders a **QR** + a one-tap pay button.
4. Player pays → the platform **verifies the payment** → `Order PAID` → payout + item delivery fire.
5. Game grants the item → **live status feed** shows `payment in → item delivered` in real time.

![Placeholder: storefront grid of Gridlock items + checkout panel with QR code, pay button, and live status "PAID / DELIVERED"](placeholder-image.png)

[PLACEHOLDER: Demo video — 60–90s screen capture: open /s/gridlock, connect wallet, click Sword Skin, scan/click QR, watch the live status flip from PENDING → PAID → DELIVERED. End on the live transaction feed.]

**Speaker notes:** This is the moment everything is built around, straight from SPEC. I open the Gridlock Games storefront. An audience member connects a wallet — that's a one-click sign-in, no account, no password. They pick the Sword Skin for one USDT. Checkout returns a pay request plus a QR code. They scan it or tap pay, and sign. The platform verifies the payment — correct account, correct amount, bound to this order — and the order flips to PAID. We record it in the ledger, the net payout goes to the studio, and the game is told to grant the skin. The live feed updates in real time — payment in, item delivered. We run this whole path end-to-end in CI and assert PAID then DELIVERED through the live status stream.

---

## Slide 5: How it works

**What happens behind the scenes — a reliable, hands-off pipeline from "player pays" to "studio gets paid, player gets the item."**

- **One storefront per studio, one deployment for everyone:** each studio gets its own branded shop; every query is scoped to that studio, so one deployment serves many studios safely.
- **Payments are verified, not trusted:** the platform confirms every payment before anything moves — no "I sent it, trust me." If a payment doesn't clear, nothing advances.
- **Delivery is automatic and durable:** once a payment clears, the platform pays the studio its net share and tells the game to grant the item — the player doesn't have to keep the page open, and a dropped connection doesn't lose the order.
- **One source of truth for money and trust:** the rules that touch money — fees, payouts, refunds, settlement state — live in one place and are tested first. No two code paths can disagree on what "paid" means.
- **Tamper-evident history:** every sale, payout, resale, and refund is written to an append-only ledger a studio can audit.

![Placeholder: simple flow diagram — Player/wallet → Storefront → Verify payment → Pay studio + Deliver item + Write ledger](placeholder-image.png)

**Speaker notes:** Here's what's actually happening, in plain terms. Each studio gets its own branded storefront, and every query is scoped to that studio — so one deployment serves many studios safely. When a player pays, we don't take the client's word for it: the platform confirms the payment itself before anything moves. If it didn't clear, nothing advances. The moment it clears, two things happen automatically — the studio gets its net share, and the game is told to grant the item. The player doesn't have to keep the page open, and a dropped connection doesn't lose the order. The rules that touch money — fees, payouts, refunds, the order state machine — all live in one place and are written tests-first, so there's exactly one definition of "paid." And every sale, payout, resale, and refund is written to an append-only ledger a studio can audit. That's what makes the live demo reliable on stage.

---

## Slide 6: Impact / market

- **Who needs this:** indie / mid-size game studios selling in-game items (skins, cores, gear) who can't afford to build and secure their own checkout.
- **Why now:** wallet payments have gone mainstream and web3 gaming has the audience — but it's still missing the **checkout** layer. Players have wallets; studios still don't have a shop to take their money.
- **Anchor partner / v1 target:** Gridlock Games (SPEC §1) — a real studio onboarded through the demo seed.
- **Business model:** per-transaction **platform fee**; studios get the net instantly. Multi-tenant by design — every studio query is scoped by `studioId`.

![Placeholder: market framing — "indie studios" segment + "web3 gaming" audience + xGameFi as the checkout/payout rail between them and their players](placeholder-image.png)

**Speaker notes:** Who needs this is concrete: indie and mid-size game studios that sell in-game items but can't justify building and securing their own checkout. Our anchor partner and v1 target, named in the spec, is Gridlock Games — a real studio we onboard through the seed data so the demo runs immediately. Why now: wallet payments have gone mainstream, web3 gaming has the audience, but it's still missing exactly the checkout layer we provide — players have wallets, studios still don't have a shop to take their money. The business model is a per-transaction platform fee; studios receive the net instantly. And it's multi-tenant from the ground up — every studio-scoped query is filtered by studio ID, so one deployment serves many studios.

---

## Slide 7: What's next

**Gaps between SPEC.md and the shipped code — logical next features.**

- **Studio dashboard UI:** the API exists, but the `/dashboard` overview, `/dashboard/transactions`, `/dashboard/p2p` management, and `/dashboard/settings` pages are not yet built. *(confirmed — file tree)*
- **Storefront completeness:** wallet-gated `/s/[slug]/me/purchases` purchase history and the `/s/[slug]/market/sell` create-listing UI are missing. *(confirmed)*
- **Missing spec endpoints:** `GET /orders/:id` (status), `GET /p2p/trades/:id` (trade status), and `POST /ingest/delivery-confirmation` (async grant confirm) are specified but not implemented. *(confirmed)*
- **Image uploads:** item images currently come from the game API pull; self-serve image upload for studios is the next storefront piece. `[inferred gap]`
- **Production hardening:** finalize the settlement asset, lock the exact platform fee %, and move from the demo environment to a live network (SPEC §14 marks these TBD/out-of-scope for the demo).
- **Explicit v1 non-goals (SPEC §14):** token-swap routing, auctions, fiat on-ramp, mobile apps, multi-region.

![Placeholder: roadmap timeline — Close dashboard gaps → Image uploads → Production hardening → Swaps/auctions](placeholder-image.png)

**Speaker notes:** Being honest about the gap between spec and shipped code — that's where the roadmap comes from. The studio-facing API is fully built, but four dashboard pages aren't there yet: the overview, transactions, P2P management, and settings. On the storefront, wallet-gated purchase history and the create-listing UI are missing. A few endpoints from the spec aren't implemented yet — a plain order-status lookup, a trade-status lookup, and the delivery-confirmation endpoint. Image uploads are the next storefront piece: right now item images come from the game API, but we want studios to upload their own. Then the production work: finalize the settlement asset, lock the exact platform fee percentage, and move off the demo environment onto a live network. And the explicit v1 non-goals from the spec — token-swap routing, auctions, a fiat on-ramp, and mobile — are the natural next horizon.

---

## Slide 8: Team & thanks

- **[Your Name]** — role / contact
- **[Teammate]** — role / contact
- **[Teammate]** — role / contact

Docs: `SPEC.md` · `AGENT.md` · `BRAND.md` · `docs/features.md`

Thanks to the Gridlock Games team as our anchor partner, and to the hackathon organizers.

![Placeholder: team logo / contact card with handles and a QR to the repo](placeholder-image.png)

**Speaker notes:** That's xGameFi — commerce infrastructure for game studios. The team placeholders are here for you to fill in with names, roles, and contact handles. Everything I showed is real and in the repo on the develop branch, documented across the spec, the engineering guide, the brand system, and a running feature log. Huge thanks to Gridlock Games as our anchor partner, and to the organizers. We'd love your questions.

---

# Pitch script (readable, for recording)

> ~3.5–4 minutes spoken. Read top to bottom. Replace bracketed placeholders before recording.

**[Slide 1 — Title]**
Hey, I'm [name], and this is xGameFi — the missing commerce layer for game studios. The pitch in one line: a studio connects its game's item system and gets a professional storefront in hours, instead of building one from scratch. Payments, delivery, resale, referrals, promotions — all handled. Let me show you the one moment the whole system is built around.

**[Slide 2 — Problem]**
Here's the problem. Every indie studio that wants to sell in-game items — skins, cores, gear — has to build the same three things every single time: a checkout, a shop, and a delivery pipeline. None of that is the game. All of it is plumbing, and it's expensive, slow, and brittle. Players pay for it too, with janky per-game checkouts and no real ownership. Web3 gaming promised item ownership, but so far it's mostly delivered friction. We're here to fix the friction — one connect step, a real wallet checkout, and settlement a studio can actually trust.

**[Slide 3 — Solution]**
So here's the solution. xGameFi is the commerce layer between a game's item system and its players. Three things make it work. First, connect once — a studio either lets us pull items from their API, or pushes them via a signed webhook, and they immediately get a branded storefront. Second, players pay with a wallet — they sign in with one click, no account, no password. And we never trust the client: every payment is verified before anything moves. Third, we handle the rest — instant net payout to the studio, an automatic signal telling the game to grant the item, plus a P2P resale market, referrals, and promotions, all recorded in an append-only ledger.

**[Slide 4 — Demo]**
This is the demo moment, straight from the spec. I open the Gridlock Games storefront. An audience member connects a wallet — one-click sign-in, no account, no password. They pick the Sword Skin for one USDT. Checkout returns a pay request plus a QR code. They scan it, or tap pay, and sign. The platform verifies the payment — correct account, correct amount, bound to this order — and the order flips to PAID. We record it in the ledger, the net goes to the studio, and the game is told to grant the skin. The live feed updates in real time — payment in, item delivered. We run this whole path end-to-end in CI and assert PAID then DELIVERED through the live status stream.

**[Slide 5 — How it works]**
In plain terms, here's what happens behind the scenes. Each studio gets its own branded storefront, and every query is scoped to that studio — so one deployment serves many studios safely. When a player pays, we don't take the client's word for it: the platform confirms the payment itself before anything moves. If it didn't clear, nothing advances. The moment it clears, two things happen automatically — the studio gets its net share, and the game is told to grant the item. The player doesn't have to keep the page open, and a dropped connection doesn't lose the order. The rules that touch money — fees, payouts, refunds, the order state machine — all live in one place and are written tests-first, so there's exactly one definition of "paid." And every sale, payout, resale, and refund lands in an append-only ledger a studio can audit. That's what makes the live demo reliable on stage.

**[Slide 6 — Impact]**
Who needs this is concrete: indie and mid-size studios that sell in-game items but can't justify building and securing their own checkout. Our anchor partner and v1 target, named in the spec, is Gridlock Games — a real studio onboarded through the seed so the demo runs immediately. Why now: wallet payments have gone mainstream, web3 gaming has the audience, but it's still missing exactly the checkout layer we provide — players have wallets, studios still don't have a shop to take their money. The business model is a per-transaction platform fee; studios get the net instantly. And it's multi-tenant from the ground up — every studio query is scoped by studio ID, so one deployment serves many studios.

**[Slide 7 — What's next]**
We want to be honest about the gap between spec and shipped code, because that's the roadmap. The studio-facing API is fully built, but four dashboard pages aren't there yet — the overview, transactions, P2P management, and settings. On the storefront, wallet-gated purchase history and the create-listing UI are still missing. A few endpoints from the spec aren't implemented — a plain order-status lookup, a trade-status lookup, and the delivery-confirmation endpoint. Image uploads are the next storefront piece: right now item images come from the game API, but we want studios to upload their own. Then comes production hardening — finalize the settlement asset, lock the exact fee percentage, and move off the demo environment onto a live network. After that, the spec's explicit v1 non-goals: token-swap routing, auctions, a fiat on-ramp, and mobile.

**[Slide 8 — Team]**
That's xGameFi — commerce infrastructure for game studios. The team placeholders are here for you to fill in. Everything I showed is real, it's all in the repo on the develop branch, and it's documented across the spec, the engineering guide, the brand system, and a running feature log. Thanks to Gridlock Games as our anchor partner, and to the organizers. We'd love your questions.