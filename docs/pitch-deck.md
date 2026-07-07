# xGameFi — Pitch Deck Guide

> Single-file pitch deck guide, kept in sync with **`docs/pitch-deck-v3.pptx`** (10 slides + speaker notes). One section per slide, separated by `---`. Slide bodies are intentionally minimal; talk tracks live in the **Speaker notes** under each slide and in the full **Pitch script** near the end. Technical claims are grounded in `SPEC.md`, `docs/features.md`, GitHub issue **#137** (Growth & Stellar Ecosystem Integration Report), and the actual repo; anything inferred rather than confirmed is tagged `[inferred]`.
>
> Target pitch length: 4–6 minutes (the three Stellar slides — Impact, Integration plan, GTM — add ~90s over the original hackathon cut).
>
> **Voice rules — two audiences:**
> - **Core narrative (slides 1–5, 9–10):** listeners may not be engineers, so we describe *what happens* and *why it matters*, not how it's built. We don't name our own tech stack (frameworks, databases, infra).
> - **Stellar slides (6–8):** calibrated for a **Stellar-ecosystem / investor audience** (SCF reviewers, grant panels, crypto-literate investors). Here, on-chain transaction volume and named Stellar primitives (SEPs, anchors, Soroban, Passkey Kit, Launchtube) **are** the value proposition, so we name them deliberately. If you're pitching a purely non-technical or general-gaming audience, compress slides 6–7 into a single "Why Stellar" slide and keep the plain-language framing.

---

## Slide 1: Title

# xGameFi

**Commerce infrastructure for game studios — connect your game, get a Stellar-powered shop, go live in hours.**

- Project Lead: **[NAME]**
- Repo: `webnxt-2030/xgamefi` · branch `develop`
- **SPEC.md v1: feature-complete · CI green · staging branch live**

![Placeholder: xGameFi logo mark on obsidian with acid-lime wordmark — "Neon Overdrive" hero with clipped corners and faint scanlines](placeholder-image.png)

**Speaker notes:** This is xGameFi — the missing commerce layer for game studios, and it settles every payment on Stellar. The pitch in one line: a studio connects its existing item system and gets a professional, wallet-ready storefront live in hours instead of weeks — payments, fulfilment, P2P resale, referrals, and promotions all handled, and every one of those money movements is a real, verified Stellar transaction. Since our last deck, SPEC.md v1 is now fully shipped: the studio dashboard, purchase history, P2P sell flow, and a self-contained demo environment are all live and CI-green. Today I'll walk through the demo, how it works, why it matters to the Stellar network specifically, our plan to integrate deeper into the Stellar ecosystem, and how we're taking this to market — starting at home in the Philippines, then APAC, then globally.

---

## Slide 2: Problem

**Every studio rebuilds the same plumbing — none of it is the game.**

- Building a payment rail, shop UI, and delivery pipeline is **expensive, slow, and brittle** — before a studio sells a single skin.
- Players pay the price too: **per-game checkout flows**, weak security, no resale, no portable wallet identity.
- Web3 gaming promised ownership, but today it mostly delivers **friction** — not a real checkout.
- None of this touches the Stellar network at meaningful scale — **fragmented, per-studio effort means fragmented, low on-chain volume.**

![Placeholder: split composition — N studios each hand-building payment+shop+delivery vs. one xGameFi rail](placeholder-image.png)

**Speaker notes:** The pain is specific and universal: any indie studio selling skins, cores, or gear has to build the same three things every time — a checkout, a shop, and a delivery pipeline. None of that is the game; all of it is plumbing, and it's expensive, slow, and brittle. Players end up with janky, per-game checkouts and no real ownership. Web3 gaming promised item ownership, but so far it's mostly delivered friction. There's also an ecosystem-level cost to this fragmentation: if every studio builds its own one-off wallet integration, none of them reach the transaction volume that makes Stellar's speed and cost advantage obvious. We fix the friction for studios and players, and we concentrate that volume onto Stellar rails instead of scattering it.

---

## Slide 3: Solution

**The commerce layer between a game's items and its players.**

- **Connect once:** pull items from a studio's API, or push via a signed webhook — get a branded shop at `/s/[slug]`.
- **Pay with any Stellar wallet:** one-click sign-in (Freighter today), no password, no account creation.
- **Every payment verified on-chain** before anything moves — destination, asset, amount, memo; never the client's word.
- **Money + delivery handled:** instant net payout, automatic item delivery, P2P resale, referrals, and promotions — all in a tamper-evident ledger.
- **Full studio self-service:** branding, payout wallet, API keys, and webhook configuration from one dashboard.

![Placeholder: three-step diagram — Connect item system → Branded storefront → Settlement (payout + delivery + ledger)](placeholder-image.png)

**Speaker notes:** xGameFi is the commerce layer between a game's item system and its players. A studio connects once — either we pull items from their API or they push via a signed webhook — and they immediately get a branded storefront. Players pay with a wallet, one click, no account, no password. We never trust the client: every payment is verified on-chain before anything advances. Then we handle the rest of the money and delivery automatically — instant net payout, item delivery, a P2P resale market, referrals, and promotions, all recorded in an append-only ledger. And now, a studio can do all of its own onboarding — branding, payout wallet, API keys, webhook — from a self-service dashboard, no engineering support needed from us.

---

## Slide 4: Demo

**The single moment the whole system is built around: browse → pay → get your item, live.**

1. Open the **Gridlock Games** storefront at `/s/gridlock` — branded per studio.
2. Connect a **wallet**, sign in with one click — player session, no password.
3. Pick the **Sword Skin @ 1 USDT** — checkout renders a QR + one-tap pay button.
4. Player pays → platform **verifies on Stellar** → `Order PAID` → payout + delivery fire.
5. Game grants the item → **live status feed** shows "payment in → item delivered" in real time.

[PLACEHOLDER: Demo video — 60–90s screen capture: open /s/gridlock → connect → pay → PAID → DELIVERED. End on the live transaction feed.]

**Speaker notes:** This is the moment everything is built around. I open the Gridlock Games storefront. An audience member connects a wallet — one-click sign-in, no account, no password. They pick the Sword Skin for one USDT. Checkout returns a pay request plus a QR code. They scan it or tap pay, and sign. The platform verifies the payment on Stellar — correct account, correct amount, bound to this order — and the order flips to PAID. We record it in the ledger, the net payout goes to the studio, and the game is told to grant the skin. The live feed updates in real time — payment in, item delivered. This whole path runs end-to-end in CI on every push, asserting PAID then DELIVERED through the live status stream — it's not just a stage demo, it's a regression-tested product behavior.

---

## Slide 5: How it works

**A hands-off pipeline, verified at every step.**

- **One deployment, one branded shop per studio** — every query scoped by `studioId`, tenant isolation enforced.
- **Payments verified, not trusted** — nothing advances until Stellar confirms the transaction.
- **Delivery is automatic and durable** — a dropped connection never loses an order; background workers retry.
- **One source of truth for money** — fees, payouts, refunds, and settlement state live in one tested module.
- **Tamper-evident history** — every sale, payout, resale, and refund is written to an append-only ledger a studio can audit.

![Placeholder: flow diagram — Player/wallet → Storefront → Verify payment → Pay studio + Deliver item + Write ledger](placeholder-image.png)

**Speaker notes:** Here's what's actually happening behind the scenes. Each studio gets its own branded storefront, and every query is scoped to that studio — one deployment serves many studios safely. When a player pays, we don't take the client's word for it: the platform confirms the payment itself on Stellar before anything moves. The moment it clears, two things happen automatically — the studio gets its net share, and the game is told to grant the item — with retries so a dropped connection never loses an order. The rules that touch money live in one place and are tested first, so there's exactly one definition of "paid." And every sale, payout, resale, and refund lands in an append-only ledger a studio can audit. That's what makes the live demo — and every studio's daily volume — reliable.

---

## Slide 6: Impact to the Stellar ecosystem

**xGameFi is a transaction-volume driver for Stellar — not a wrapper over a centralized ledger.**

- Every **purchase, payout, P2P escrow release, and referral reward** is a real, verified Stellar transaction.
- A **repeatable, non-speculative, retail-volume** use case: microtransaction-scale in-game commerce on Horizon/RPC at production traffic patterns.
- Expands Stellar's footprint in gaming **beyond wallets and DEX trading into everyday consumer payments.**
- **Near-instant settlement** and a materially lower take-rate than card processors or platform stores (often 30% + weeks-long holds).
- Every studio onboarded **multiplies on-chain volume** — a per-transaction platform fee aligns our growth with the network's.

![Placeholder: funnel — studios onboarded → orders/payouts/escrows/rewards → on-chain Stellar transaction volume](placeholder-image.png)

**Speaker notes:** I want to be explicit about why this matters to Stellar, not just to us. Every purchase, every studio payout, every P2P escrow release, every referral reward in xGameFi is a real, on-chain, verified Stellar transaction — Horizon confirms it before an order advances. That means xGameFi is a transaction-volume driver for the network, not a wrapper around a centralized ledger with a Stellar label on it. It's also a genuinely useful, repeatable, non-speculative use case — microtransaction commerce — running at production traffic patterns, which is exactly the kind of retail volume that expands Stellar's footprint in gaming beyond wallets and DEX trading into everyday consumer payments. For studios, that same on-chain settlement means near-instant payouts and a much lower take-rate than a 30%-cut, weeks-long-hold platform store. Our business model — a per-transaction platform fee — is directly aligned with growing that on-chain volume, not fighting it.

---

## Slide 7: Plan to integrate the Stellar ecosystem

**We build on the ecosystem's proven primitives instead of reinventing them.** *(Full detail + reference links: GitHub issue #137.)*

- **Fiat on-ramp via SEP-24 anchors** (+SEP-38 quotes): pay with a card, inline at checkout — no crypto required to start.
- **Passkey / smart-wallet onboarding** (WebAuthn signers + Passkey Kit) with **Launchtube**-sponsored fees — zero seed phrase, zero XLM to begin.
- **Multi-anchor, multi-stablecoin support** (USDC, EURC, MGUSD via the Stellar Anchor Directory) beyond one demo asset.
- **On-chain item ownership via Soroban NFTs** (SEP-50-track, OpenZeppelin Stellar Contracts) for trustless P2P trading.
- **Multi-asset checkout via path payments / DEX** (Soroswap) — pay with any Stellar asset already held.
- **SEP-10 Web Authentication + SEP-31 cross-border studio payouts** for full ecosystem interoperability.

![Placeholder: layered stack — xGameFi commerce layer sitting on SEP-24/10/31 + Soroban + DEX/anchors](placeholder-image.png)

**Speaker notes:** We researched this deliberately rather than guessing — the full write-up with citations is filed as GitHub issue #137. Here's the short version, ranked by leverage. The single biggest onboarding unlock is passkey and smart-wallet support: Stellar's native WebAuthn signers, paired with the open-source Passkey Kit and the Foundation's Launchtube fee-sponsorship relay, let a player start with zero seed phrase and zero XLM — sign in with Face ID, done. Second, a SEP-24 anchor integration lets a player fund a wallet with a card right inside our checkout, removing the "must already own crypto" wall entirely. Third, we want to move item ownership on-chain as Soroban NFTs — today ownership is a database mirror we verify by calling back into a studio's own API; an on-chain NFT makes P2P trading trustless and opens cross-studio secondary markets, the strongest "real Soroban usage at consumer scale" story available. We'll also diversify beyond one demo stablecoin to the real anchor-issued assets already live — USDC, EURC, MoneyGram's MGUSD — support path payments so a player can check out with whatever asset they hold, and migrate our bespoke wallet-auth flow to the SEP-10 standard so we interoperate with the wider wallet ecosystem, not just Freighter. We plan to fund this roadmap partly through the Stellar Community Fund Build Award — up to $150K in XLM per round — since ecosystem impact is exactly what that program scores for.

---

## Slide 8: Go-to-market — Philippines → APAC → Global

**A staged rollout, not a simultaneous global launch — each stage feeds the next.**

**🇵🇭 Philippines — beachhead**
- Anchor partner **Gridlock Games** as the flagship live studio.
- Tap the local indie / mobile dev community (IGDA PH, game jams, Discord).
- Peso-friendly wallet UX — players already use **GCash / Maya**-style e-wallets.
- Local anchor on/off-ramps lower the "buy crypto first" barrier.
- Goal: onboard a **pilot cohort** of studios in the first two quarters.

**🌏 APAC — regional expansion**
- Vietnam, Indonesia, Thailand — large mobile bases, strong wallet adoption.
- Localize storefront currency / branding; use **regional anchors** for local fiat rails.
- Partner with regional publishers / game-SDK platforms exploring web3.
- Reuse the PH playbook — familiar wallet habits cut onboarding friction region-wide.

**🌐 Global — scale via ecosystem**
- Reach Western indie studios via dev Discords, game jams, the **SCF network**.
- Position as "commerce infra for game-item economies on Stellar"; **SCF Build Award** as non-dilutive GTM fuel.
- Multi-stablecoin support (USDC / EURC) removes single-region asset dependency.
- **Soroban NFT interoperability = network-effect moat**: cross-game secondary markets.

**Speaker notes:** Our go-to-market is deliberately staged, not a simultaneous global launch. We start at home, in the Philippines, where we already have an anchor partner in Gridlock Games and a founder/team home-field advantage. Filipino players are already comfortable with e-wallet-style payments through GCash and Maya, and local Stellar anchors give us peso on/off-ramps, so the "players need to already own crypto" barrier is smaller here than almost anywhere else. We plan to pull in a pilot cohort of studios from the local indie and mobile dev community over the next two quarters. From there we expand regionally into APAC markets with similar dynamics — Vietnam, Indonesia, Thailand — large mobile gaming populations, strong wallet adoption, and the same e-wallet-to-crypto-wallet familiarity we rely on at home; we localize currency and branding per market and lean on regional anchors and publisher partnerships rather than cold-starting every studio ourselves. Globally, we don't try to out-market established platforms directly — we go through the Stellar ecosystem itself: developer communities, game jams, an SCF Build Award application, multi-stablecoin support so no studio is tied to one regional asset, and eventually on-chain NFT item interoperability, which becomes a real network-effect moat once enough studios are on the rail.

---

## Slide 9: Roadmap — what's next

**v1 is shipped; the roadmap is the ecosystem plan and the GTM plan, in parallel.**

- **SPEC.md v1 feature-complete:** studio dashboard (overview, settings, transactions, P2P), purchase history, P2P sell page, self-contained demo — all shipped, CI-green.
- **Immediate:** multi-anchor / stablecoin config + SEP-10 migration — low effort, unblocks moving off the single demo asset.
- **Near-term:** passkey / smart-wallet onboarding + SEP-24 anchor checkout — highest-leverage conversion unlocks; SCF Build Award candidates.
- **Following:** Soroban NFT item ownership (opt-in per studio), path-payment multi-asset checkout.
- **GTM in parallel:** Philippines pilot cohort → APAC expansion → global positioning via grants and SDK partnerships.

![Placeholder: roadmap timeline — v1 shipped → multi-anchor/SEP-10 → passkey + SEP-24 → Soroban NFTs → GTM stages beneath](placeholder-image.png)

**Speaker notes:** Since our last deck, the gap between spec and shipped code has closed: the studio dashboard, transactions, P2P management, settings, player purchase history, and the P2P sell page are all built and merged, and we run a self-contained demo with a bundled mock game server so the whole flow works without any external partner backend. The roadmap from here is the ecosystem integration plan and the GTM plan I just walked through, running in parallel: multi-anchor and SEP-10 first because they're low effort and unblock everything downstream, then passkey onboarding and SEP-24 fiat on-ramp as the highest-leverage adoption unlocks, then Soroban NFT item ownership once we've proven the model with a few studios. On the GTM side, we execute the Philippines pilot now, APAC next, and use ecosystem-level plays — grants, SDK partnerships, multi-asset support — to go global without a heavy direct-sales motion.

---

## Slide 10: Team & thanks

- **[Your Name]** — role / contact
- **[Teammate]** — role / contact
- **[Teammate]** — role / contact

Docs: `SPEC.md` · `AGENT.md` · `BRAND.md` · `docs/features.md` · **GitHub issue #137** (ecosystem report)

Thanks to **Gridlock Games** (anchor partner), the **Stellar Community Fund**, and everyone reviewing this deck.

**Speaker notes:** That's xGameFi — commerce infrastructure for game studios, built on Stellar, with a concrete plan to deepen that integration and a staged go-to-market starting at home in the Philippines. The team placeholders are here for you to fill in with names, roles, and contact handles. Everything I showed is real and in the repo on the develop branch, documented across the spec, the engineering guide, the brand system, the feature log, and the ecosystem research issue. Thanks to Gridlock Games as our anchor partner, to the Stellar Community Fund and the broader Stellar developer ecosystem whose tools — Passkey Kit, Launchtube, the Anchor Platform, OpenZeppelin's Stellar Contracts — make our roadmap realistic rather than speculative, and to everyone reviewing this deck. We'd love your questions.

---

# Pitch script (readable, for recording)

> ~4.5–5.5 minutes spoken. Read top to bottom. Replace bracketed placeholders before recording.

**[Slide 1 — Title]**
Hey, I'm [name], and this is xGameFi — the missing commerce layer for game studios, and it settles every payment on Stellar. In one line: a studio connects its existing item system and gets a professional, wallet-ready storefront in hours, instead of building one from scratch. Payments, delivery, resale, referrals, promotions — all handled, and every one of those is a real Stellar transaction. Since our last version, the whole v1 spec is shipped and green in CI. Let me show you the moment the system is built around, then why this matters for Stellar and how we go to market.

**[Slide 2 — Problem]**
Every indie studio that wants to sell in-game items has to build the same three things every time: a checkout, a shop, and a delivery pipeline. None of that is the game — all of it is plumbing, and it's expensive, slow, and brittle. Players pay for it too, with janky per-game checkouts and no real ownership. And there's a hidden cost to the ecosystem: when every studio builds its own one-off integration, nobody reaches the volume that shows off what a fast, cheap payment network can do.

**[Slide 3 — Solution]**
So here's the solution. xGameFi is the commerce layer between a game's item system and its players. Connect once — pull from an API or push via a signed webhook — and you get a branded storefront. Players pay with a wallet, one click, no account. We never trust the client: every payment is verified on-chain before anything moves. Then we handle the rest — instant net payout, automatic item delivery, P2P resale, referrals, and promotions, all in an append-only ledger. And studios self-serve everything — branding, payout wallet, API keys, webhook — from one dashboard.

**[Slide 4 — Demo]**
This is the demo moment. I open the Gridlock Games storefront. Someone connects a wallet — one click, no password. They pick the Sword Skin for one USDT. Checkout returns a pay request and a QR. They scan and sign. The platform verifies the payment on Stellar — right account, right amount, bound to this order — and it flips to PAID. We ledger it, pay the studio its net, and tell the game to grant the skin. The live feed shows it in real time: payment in, item delivered. We run this whole path in CI on every push.

**[Slide 5 — How it works]**
Behind the scenes: each studio gets its own branded shop, every query scoped to that studio, so one deployment serves many safely. Payments are verified, not trusted — nothing advances until it clears. Delivery is automatic and durable, with retries, so a dropped connection never loses an order. All the money rules live in one tested module, so there's one definition of "paid." And everything lands in an auditable ledger.

**[Slide 6 — Impact to Stellar]**
Here's why this matters to Stellar specifically. Every purchase, payout, escrow release, and referral reward is a real, verified on-chain transaction — Horizon confirms it before an order advances. So xGameFi is a transaction-volume driver, not a wrapper with a Stellar label. It's a repeatable, non-speculative, retail-scale use case — microtransaction commerce — that pushes Stellar into everyday consumer payments in gaming. And because we earn a per-transaction fee, our growth is aligned with the network's volume, not opposed to it.

**[Slide 7 — Integration plan]**
We don't reinvent the ecosystem — we build on it. The biggest onboarding unlock is passkey smart-wallets with sponsored fees: sign in with Face ID, no seed phrase, no XLM to start. A SEP-24 anchor lets players fund with a card right in checkout. We'll support the real stablecoins — USDC, EURC, MoneyGram's MGUSD — move item ownership on-chain as Soroban NFTs for trustless resale, add path payments so players pay with any asset they hold, and adopt SEP-10 for standard wallet auth. It's all detailed with references in issue #137, and it's a natural fit for a Stellar Community Fund Build Award.

**[Slide 8 — GTM]**
Our go-to-market is staged. We start in the Philippines, where we've got an anchor partner in Gridlock Games and players already comfortable with e-wallets like GCash and Maya — so the "buy crypto first" barrier is low. We onboard a pilot cohort of local studios, then expand across APAC — Vietnam, Indonesia, Thailand — same mobile-first, wallet-friendly dynamics, using regional anchors and publisher partnerships. Then we go global through the Stellar ecosystem itself — dev communities, grants, multi-stablecoin support, and eventually cross-game NFT interoperability as a moat.

**[Slide 9 — Roadmap]**
v1 is shipped and green. From here, the roadmap is the ecosystem plan and the GTM plan in parallel: multi-anchor and SEP-10 first because they're low effort and unblock everything, then passkey onboarding and the SEP-24 fiat on-ramp as our highest-leverage adoption unlocks, then on-chain NFT ownership once we've proven the model. Philippines now, APAC next, global through grants and partnerships.

**[Slide 10 — Team]**
That's xGameFi — commerce infrastructure for game studios, built on Stellar, with a concrete integration plan and a staged go-to-market. Everything I showed is real and in the repo. Thanks to Gridlock Games, the Stellar Community Fund, and the ecosystem tools that make our roadmap realistic. We'd love your questions.

---

# Q&A guide — anticipated judge & investor questions

> Preparation for the questions most likely to come after this deck, grounded in the actual repo and issue #137. Keep answers tight; lead with the direct answer, then one supporting fact. Where a question exposes a genuine current limitation, we say so plainly and point to the roadmap — honesty reads as competence.

## Business model & unit economics

**1. How do you make money?**
A per-transaction platform fee on every primary sale and P2P trade, taken automatically at settlement; the studio receives the net instantly. It's configurable per studio (`platformFeeBps`), so we can tune it by segment. The model scales directly with transaction volume — the same thing that grows our Stellar impact grows our revenue.

**2. What's the exact fee percentage?**
It's configurable and not yet locked for pubnet — SPEC §14 explicitly lists the final fee as a to-be-finalized item. Our benchmark is to sit well below the ~30% platform-store standard while covering on-chain and operating costs; we'll set it with pilot-studio data rather than guess now.

**3. What are the unit economics per transaction?**
Our marginal cost per transaction is dominated by Stellar network fees, which are fractions of a cent, plus hosting — so gross margin per transaction is high. The real cost is customer acquisition (onboarding studios), which is why the GTM is a staged, relationship-led rollout rather than paid performance marketing.

**4. Isn't a per-transaction fee just what Steam/Epic already do at 30%? Why are you cheaper?**
Because we don't carry their cost structure: no card-processor interchange, no chargeback fraud reserves, no multi-week settlement float. Stellar settlement is near-instant and near-free, so we can charge a fraction of a platform store's cut and still run a healthy margin.

## Market & competition

**5. Who is the customer, exactly?**
Indie and mid-size game studios that sell in-game items but can't justify building and securing their own checkout, payout, and delivery pipeline. Our v1 anchor partner is Gridlock Games. The buyer is the studio; the end user is the player paying with a wallet.

**6. How big is this market?**
In-game item and skin economies are a multi-billion-dollar category, and the indie/mid-size long tail — studios too small to build their own commerce stack — is underserved precisely because the fixed cost of that stack is high. We're selling the pickaxe to that long tail.

**7. Who are your competitors, and what stops them from copying you?**
Traditional players are platform stores (Steam/Epic, 30% + walled gardens) and payment processors (cards, high fees + fraud). In web3-gaming middleware, engine-backend SDKs like Beamable are adding Stellar wallet/NFT support. Our defensibility is threefold: multi-tenant commerce depth (not just wallets — checkout, escrow, payouts, referrals, promotions, ledger), the trust bar (every money path verified on-chain and tested-first), and — once shipped — cross-game NFT interoperability that creates a network effect no single-studio integration can match.

**8. Beamable is SCF-funded and already doing Stellar wallet + marketplace integration. Aren't you competing with them?**
They're a candidate *partner*, not just a competitor — issue #137 lists a xGameFi↔Beamable connector as a GTM play. Beamable is a game-backend SDK; we're the commerce/checkout/P2P layer. A studio on Beamable's Stellar-enabled backend could adopt our storefront with near-zero integration. We plug into that ecosystem rather than rebuild it.

**9. Why would a studio trust you with their payout wallet and item delivery?**
Because the trust boundary is designed to be verifiable, not assumed: payments are confirmed on-chain before anything moves, every studio-supplied URL is SSRF-guarded, webhooks are HMAC-signed with a replay window, tenant data is isolated by `studioId`, and every money movement is written to an auditable append-only ledger. It's all in the repo and enforced by tests, including an audit-coverage test on sensitive actions.

## Stellar / technical

**10. Is this actually on-chain, or a database with a Stellar logo?**
Actually on-chain. Every purchase, payout, P2P escrow release, and referral reward is a real Stellar payment operation that Horizon confirms before the order advances — we never trust a client-reported success. The Postgres ledger mirrors those transactions for auditability; it doesn't replace them.

**11. You use "USDT" but say the issuer isn't finalized — what's the real settlement asset?**
Today the demo runs on testnet with native XLM and one configured asset labeled USDT for illustration. For pubnet we'll use real, audited anchor-issued stablecoins — USDC, EURC, and MoneyGram's MGUSD are all live on Stellar — via multi-anchor support (issue #137, and SPEC §14 flags finalizing the issuer as a pre-pubnet task). We deliberately didn't hardcode a single production issuer prematurely.

**12. Why Stellar and not Ethereum L2s, Solana, or Sui?**
Because this is consumer microtransaction commerce: sub-cent fees, near-instant finality, and a mature anchor network for fiat on/off-ramps are exactly what checkout needs, and Stellar leads on all three. Protocol 23 "Whisk" added parallel execution (theoretical ~5,000 TPS) and cheaper Soroban reads, which de-risks running retail volume. The SEP anchor standards also give us a fiat on-ramp path that other chains don't have as maturely.

**13. Item ownership is mirrored from the studio's own API — so P2P trust depends on that studio being honest and online. Isn't that a weakness?**
Yes, and we're candid about it: today ownership is a verified mirror, refreshed from the studio's game API before we trust it. That's fine for a studio's own primary and P2P sales, but it's not trustless. Moving item ownership on-chain as Soroban NFTs (SEP-50-track, using OpenZeppelin's audited contracts) is exactly the fix — it makes P2P trading trustless and opens cross-studio markets. It's the highest-value item on our integration roadmap for that reason.

**14. Players need Freighter and funded XLM today. Isn't that a huge onboarding barrier?**
It's the single biggest barrier, and it's the #1 item on our integration plan. Passkey smart-wallets (WebAuthn signers + Passkey Kit) plus Launchtube fee sponsorship let a player start with no seed phrase and no XLM — sign in with Face ID. A SEP-24 anchor adds inline card funding. Together they turn "any Stellar wallet" into "anyone."

**15. Do you have any smart contracts today?**
Not yet — v1 settles with native Stellar payment operations, which is simpler and sufficient for verified primary and escrow-based P2P sales. Soroban contracts come in with on-chain NFT ownership and, potentially, trustless escrow. We're intentionally not adding contract risk before it buys us something concrete.

**16. How do you prevent double-spends, double-grants, or replay attacks?**
Idempotency keys on checkout/submit, P2P buy/submit, and ingest endpoints; a unique constraint on the Stellar tx hash so a payment can't be reused; HMAC signatures with a replay window and constant-time comparison on webhooks and API keys; and a settlement state machine keyed off each entity's current status so retries can't double-pay. These are written tests-first.

## GTM & traction

**17. Why start in the Philippines?**
Home-field advantage plus the lowest onboarding friction anywhere: we have an anchor partner (Gridlock Games), a reachable local indie/mobile dev community, and — crucially — players already fluent in e-wallets like GCash and Maya, so the leap to a Stellar wallet is small. Local anchors give us peso on/off-ramps. It's the ideal beachhead to prove the model before scaling.

**18. What traction do you have so far?**
Product-wise, v1 is feature-complete and CI-green with a self-contained, end-to-end demo (Gridlock Games as the seeded live studio). Commercially we're pre-revenue and pre-pilot — the immediate goal is a pilot cohort of local studios in the first two quarters. We're not overstating a user base we don't have yet.

**19. What's the plan and timeline from here?**
Parallel tracks. Product: multi-anchor + SEP-10 immediately (low effort), then passkey onboarding + SEP-24 fiat on-ramp, then Soroban NFT ownership. GTM: Philippines pilot now, APAC expansion (Vietnam/Indonesia/Thailand) next, global via the Stellar ecosystem after. We plan to fund the ecosystem work partly through an SCF Build Award.

**20. How do you actually acquire studios — what's the motion?**
Relationship-led, not paid-performance: local dev communities, game jams, and the SCF/Stellar developer network, plus SDK-partner channels (e.g. a Beamable connector) that put us in front of studios already on Stellar-enabled backends. Onboarding is self-service once a studio is in — branding, keys, webhook, payout wallet, all from the dashboard — so sales effort is front-loaded on the relationship, not the integration.

## Team, funding & risk

**21. How much are you raising / what do you need?**
[Fill in ask.] Independent of any equity raise, we're pursuing non-dilutive funding via the Stellar Community Fund Build Award (up to $150K in XLM per round, ~6-week cycles), which is well-matched to our ecosystem-integration roadmap and is scored on exactly the ecosystem impact we deliver.

**22. What's the single biggest risk, and how do you de-risk it?**
Adoption friction — getting both studios and non-crypto-native players over the onboarding hump. We de-risk the player side with passkey wallets + fiat on-ramp (removing seed phrases and "buy crypto first"), and the studio side with self-service onboarding and a low, transparent fee versus 30% platform stores. Regulatory exposure around stablecoins is a secondary risk we manage by settling on audited, anchor-issued assets rather than an ad-hoc token.

**23. What happens to players' items or funds if xGameFi shuts down?**
Item ownership of record lives in the game, not in us — we mirror and verify it, so a player's items persist with the studio regardless. Funds settle directly on Stellar to studio and player wallets; we're not a custodian holding balances. Once on-chain NFT ownership ships, that independence becomes even stronger — items are the player's on-chain assets, not a database row we control.

**24. Is this just a hackathon project, or a real company?**
The product is real and shipped — full v1 spec implemented, tested, CI-gated, with a documented architecture, brand system, and feature log in the repo. What's ahead is the company-building: pilot studios, the ecosystem integrations in issue #137, and the staged GTM. We built the hard technical core first so the business questions are now about go-to-market, not "can it work."

---

*This guide mirrors `docs/pitch-deck-v3.pptx`; update both together. Image-generation prompts for the deck visuals live in `docs/pitch-deck-prompts.md`.*
