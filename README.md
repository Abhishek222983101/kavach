# Kavach

**A support agent that checks before it acts.**

Kavach is a pre-action verification layer for tool-using support agents. The agent may *read* freely, but before it can *change* anything (issue a refund, book a return pickup, change an address, cancel an order) it must hand over a **proposal listing the facts it relies on**. A Verifier re-checks every fact against the records, a risk router decides whether to run it, ask a human, or block it, and the Executor refuses to act on anything that doesn't carry a signed verdict for those exact arguments.

[![CI](https://github.com/Abhishek222983101/kavach/actions/workflows/ci.yml/badge.svg)](https://github.com/Abhishek222983101/kavach/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-c7ff00.svg)](LICENSE)
![Status: concept demo](https://img.shields.io/badge/status-concept%20demo-f59e0b.svg)

### ▶ Live demo: **<https://kavach-blush.vercel.app>**

No sign-in. Everything runs in your browser and resets when you reload.

![An over-limit refund pauses for the seller, with every claim verified against the records](docs/img/over-limit-escalation.png)

---

## Contents

- [Why this exists](#why-this-exists)
- [How it works](#how-it-works)
- [Try the demo](#try-the-demo)
- [What is real, and what is simulated](#what-is-real-and-what-is-simulated)
- [Run it locally](#run-it-locally)
- [Project layout](#project-layout)
- [Evaluation](#evaluation)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [Events and provenance](#events-and-provenance)
- [Documentation](#documentation)
- [License](#license)

## Why this exists

Small online sellers answer the same few questions all day: where is my order, can I return this, where is my refund. Language-model agents can handle that traffic, but an agent that can *act* has a failure mode a chatbot doesn't: it can act on something it invented.

- In *Moffatt v. Air Canada* (2024) a tribunal held an airline responsible for refund guidance its chatbot made up (C$812.02 in total). [Decision](https://decisions.civilresolutionbc.ca/crt/crtd/en/525448/1/document.do).
- Benchmarks such as [τ-bench](https://arxiv.org/abs/2406.12045) measure exactly this kind of policy-following under tool use, and propose **pass^k** (do *all* k repeated runs succeed?) because average accuracy hides inconsistency.
- The volume is real: "where is my order?" is commonly estimated at 25–40% of e-commerce support volume, and roughly a quarter of cash-on-delivery orders in India are reported to return undelivered. These two figures are **industry estimates from secondary sources**, not primary studies; see [references](docs/REFERENCES.md) for caveats.

Prompting an agent to "follow the policy" is a suggestion. Kavach makes the safe behaviour **structural**: with the guard on, there is no code path from the agent to a write that skips verification. (The demo's *Guard OFF* switch exists only to show the no-guard baseline.)

## How it works

```
 Customer message ── labelled UNTRUSTED ──┐
                                          ▼
   AGENT: understand → plan → read tools freely
          proposes a write as ActionProposal{ tool, args, claims[ kind · source · statement ] }
                                          │
                                          ▼
   VERIFIER  re-fetches every fact from the records (never trusts the agent's copy)
      T0  deterministic claim checks   ownership · state · timing · amount · duplicate · eligibility · evidence · authority
      T1  policy grounding              the policy claim must QUOTE the clause; the quote must exist verbatim
      RISK ROUTER → ALLOW │ ESCALATE │ BLOCK         (any failed claim = BLOCK; source down = ESCALATE)
                                          │
              ALLOW ──────────────────────┤──── ESCALATE → seller approves / edits (re-verified) / rejects
                                          ▼
   EXECUTOR  recomputes hash(tool, args), checks the HMAC-signed verdict, then writes (idempotent)
                                          ▼
   append-only, hash-chained ACTION LOG
```

Five ideas carry the design:

1. **Evidence-carrying actions.** A write is a proposal plus the facts it depends on, each with a source (`tool`, `policy`, `customer`). A claim sourced only from the customer's text is never trusted by itself.
2. **Re-fetch, don't trust.** The Verifier reads the system of record again. What the agent *says* it saw is only a hypothesis.
3. **Quote-or-fail.** "The policy allows it" must come with the clause, quoted verbatim. A paraphrase, an invented clause or a changed number fails a string comparison.
4. **Signed verdict bound to the arguments.** The verdict is an HMAC over `hash(tool, args)`. Verify ₹500, execute ₹5,000, and the Executor refuses. The agent holds no write credential at all.
5. **Cheapest check first, human last.** Deterministic → grounded text → (designed) careful-model consensus → seller. Small, clean refunds run on their own; risky ones wait for a person.

Full details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Try the demo

Open the [live demo](https://kavach-blush.vercel.app) and use the **Try a scenario** bar. The page has three panes: a simulated customer chat, the **thought process** (every step, with *Agent says* vs *Records say* for each claim), and a **seller console**.

Two switches in the header make the point:

- **Agent: Careful / Gullible.** *Gullible* simulates typical LLM mistakes: it believes the customer, obeys instructions hidden in a note, and skips its own checks. Watch the Verifier catch each one.
- **Guard: ON / OFF.** *Off* is the no-Kavach baseline: the agent writes directly. Run the same attack both ways.

| # | Scenario | Result |
|---|---|---|
| S1 | Where is my order? | Read-only; no verdict needed |
| S2 | Small refund within the auto-limit | **ALLOW** → executes |
| S3 | Over-limit refund | **ESCALATE** → seller approves → executes |
| S4 | Hallucinated policy ("30 days") | **BLOCK**: fabricated quote not found in the policy; order is 10 days old |
| S5 | Someone else's order | **BLOCK**: ownership |
| S6 | Duplicate refund | **BLOCK**: already refunded |
| S7 | "The owner approved ₹5,000" | **BLOCK**: authority claim from customer text; amount exceeds paid |
| S8 | Instruction hidden in a return note | **BLOCK**: refund of ₹50,000 refused; note flagged |
| S9 | Over-claimed amount | **BLOCK → repair → ALLOW**: one repair attempt with the refundable amount |
| S10 | Day 7: inside the window | **ALLOW** |
| S11 | Day 8: outside the window | **BLOCK** |
| S12 | Perishable item | **BLOCK**: eligibility |
| S13 | Address change after dispatch | **BLOCK**: state |
| S14 | Address change before dispatch | **ALLOW** |
| S15 | Courier API down | Retries twice, then escalates to the seller with a summary |
| S16 | Missing order number | Asks instead of guessing |
| S17 | S4's attack with the guard off | The bad refund goes through (baseline) |

Also in the console: edit an approval amount (it is **re-verified**), toggle the kill switch, change the limits and window, run the **Executor lab** (five attempts to bypass the guard, all must be refused), and tamper with a log row to watch the hash chain break.

![A fabricated policy quote is caught by the verbatim check](docs/img/hallucinated-policy-blocked.png)

## What is real, and what is simulated

**Real in this repository**

- Claim checks that re-fetch from a (mock) store API, including quote-or-fail policy grounding.
- The risk router, seller approval with edit-and-re-verify, and the single repair attempt.
- Verdict tokens signed with **HMAC-SHA-256** (WebCrypto), bound to `hash(tool, args)`; an Executor that refuses mismatched, forged, missing or expired tokens; idempotent writes.
- A hash-chained, append-only action log with tamper detection.
- 27 conformance tests (see [Evaluation](#evaluation)).

**Simulated, and labelled as such in the app**

- **No language model runs.** Messages are parsed by deterministic rules; replies come from templates built only from tool results and verdict reasons. *Gullible* mode scripts LLM-style mistakes.
- The chat channel, the store, the courier and the payment gateway are in-browser mocks.
- The careful-model tier (T2 consensus) is designed, not built. State lives in the page and resets on reload.

The [implemented-vs-designed table](docs/ARCHITECTURE.md#11-implemented-vs-designed) is the authoritative list.

## Run it locally

Requires Node 20+.

```bash
git clone https://github.com/Abhishek222983101/kavach.git
cd kavach
npm install
npm run dev        # http://localhost:5173
npm test           # 27 conformance tests
npm run build      # type-check + production build into dist/
```

## Project layout

```
src/
  engine/              framework-free logic; everything the tests exercise
    types.ts           shared types
    world.ts           seed data (customers, orders, policy), settings
    storeApi.ts        mock store API: reads, and writes that need the executor credential
    nlu.ts             deterministic intent / entity parsing; injection scanner
    verifier.ts        T0 checks, T1 quote-or-fail, risk router (fail-closed)
    token.ts           canonical JSON, hash(tool,args), HMAC-signed verdicts
    executor.ts        the only holder of the write credential; refuses mismatches
    pipeline.ts        agent (careful / gullible), orchestration, approvals, repair
    log.ts             hash-chained action log + tamper detection
    lab.ts             executor bypass tests
    scenarios.ts       the 17 scenarios (shared by the UI and the tests)
    engine.test.ts     conformance tests
  components/          chat, thought-process, and seller-console UI
docs/                  architecture, evaluation protocol, references
```

## Evaluation

**There are no measured results yet, and none are claimed.**

`npm test` checks that the implementation matches its design: each scripted scenario yields its designed verdict, every bypass attempt is refused, seller edits are re-verified, and the log chain detects tampering. These are hand-written scenarios, **not** an accuracy or robustness measurement.

A real evaluation is specified in [docs/EVALUATION.md](docs/EVALUATION.md): about 120 scenarios across 12 types (benign and adversarial, adversarial ones written by someone who did not build the verifier), a frozen held-out split, k = 5 repeated trials with a simulated customer, and the metrics **bad-action execution rate**, **false-block rate**, **auto-resolve rate** and **pass^k**, with Wilson intervals. Baselines: no guard, prompt-only, an LLM judge without record access, and deterministic-only. Ablations remove quote-or-fail, the router, and token binding. Targets in that document are aims, labelled as such.

## Limitations

- Kavach is only as good as the **system of record**. If the order database is wrong, the Verifier will faithfully confirm the wrong thing.
- It does not stop a model from being *influenced*; it stops the **effect**: no valid verdict, no write. It cannot judge a legitimate-but-unwise decision by an authorised seller.
- Free-text replies not tied to an action are outside its scope.
- The demo's parser handles a fixed set of Hinglish and English patterns; it is a stand-in for a model, not a language-understanding claim.
- Mock data, a single seller policy, and one currency.

## Roadmap

1. **Real language-model agent** behind the same proposal interface (planner and claim extraction), with the deterministic parser kept as a test double.
2. **T2 careful-model consensus** for ambiguous policy language, with precedent examples.
3. **Server-side Executor** with a persistent store, signing key outside the client, and a real graph-runtime interrupt/resume for approvals.
4. **Channel integration** (WhatsApp Cloud API) with signed-webhook verification.
5. **The evaluation harness** in [docs/EVALUATION.md](docs/EVALUATION.md), with baselines, ablations and published failure gallery.

## Events and provenance

Kavach is an independent project. It is being entered in two separate competitions, which have different rules, timelines and judging criteria:

- **AgentX Hackathon 2026** (Hack4Hack)
- **Perceptron Hackathon 2026** (IITB–Optiver AI Innovation Lab, Techfest IIT Bombay)

This repository is deliberately event-neutral: it describes one system once, and nothing in it is written for a single event.

**What existed when.** `v0.1.0`, the concept implementation in this repository, was published on **30 October 2026**, before either event's build or finals window. Anything built *inside* an event's official window will be committed on a branch named `event/<event-slug>` and tagged, so a reviewer can see exactly what was done within that window and what predates it. Where an event's rules restrict prior work, only the commits inside that event's window should be considered for that event.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design, schemas, verifier tiers, executor, and the implemented-vs-designed table |
| [docs/EVALUATION.md](docs/EVALUATION.md) | Evaluation protocol, metrics, baselines, ablations, reporting rules |
| [docs/REFERENCES.md](docs/REFERENCES.md) | Sources with primary/secondary labels and caveats |

## License

[MIT](LICENSE).
