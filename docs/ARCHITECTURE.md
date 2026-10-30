# Architecture

Kavach puts a verification layer between a support agent and the systems it can change. This document describes the design, and is explicit about which parts are implemented in this repository's demo and which are design only.

- [1. The principle](#1-the-principle)
- [2. Components](#2-components)
- [3. The action proposal](#3-the-action-proposal)
- [4. The Verifier](#4-the-verifier)
- [5. Risk router](#5-risk-router)
- [6. Signed verdict and Executor](#6-signed-verdict-and-executor)
- [7. Human approval](#7-human-approval)
- [8. Memory](#8-memory)
- [9. Action log](#9-action-log)
- [10. Security notes](#10-security-notes)
- [11. Implemented vs designed](#11-implemented-vs-designed)

## 1. The principle

A model's claim about the world is a *hypothesis* until a record confirms it.

An agent that only talks can be wrong and embarrassing. An agent that can refund money, book pickups, change addresses or cancel orders can be wrong and expensive. Kavach separates the two powers:

- **Reading is free.** The agent can call read tools whenever it likes.
- **Writing is a proposal.** To change anything, the agent must hand over an *action proposal*: the tool call plus the list of facts it relies on, each with its source.
- **A Verifier re-checks the facts** against the system of record. It never trusts the agent's own copy.
- **Only the Executor can write**, and only with a signed verdict that is bound to the exact arguments that were verified.

The order of checks is also the order of cost: deterministic checks first, then grounded text checks, then (in the full design) a careful-model consensus, then a human.

## 2. Components

```
 Customer message (chat channel)  ── labelled UNTRUSTED ──┐
                                                          ▼
 ┌──────────────── AGENT ────────────────┐   read tools    ┌──────────────────────────────┐
 │ understand → plan → read freely       │ ───────────────►│ Systems of record            │
 │ proposes a WRITE as an ActionProposal │◄─────────────── │ orders · shipments · refunds │
 └───────────────────┬───────────────────┘    results      │ policy text                  │
                     │ proposal                             └──────────────▲───────────────┘
                     ▼                                                     │ re-fetch
 ┌────────────────── VERIFIER ───────────────────────────────────────────────────────────┐
 │  T0 deterministic claim checks   T1 policy grounding (quote-or-fail)   [T2 consensus]   │
 │  → RISK ROUTER → ALLOW | ESCALATE | BLOCK → signed verdict (HMAC over hash(tool,args)) │
 └───────┬───────────────────────────┬───────────────────────────┬────────────────────────┘
      ALLOW                      ESCALATE                      BLOCK
         │                  seller approves / edits /       reasons → one repair attempt,
         │                  rejects (edit ⇒ re-verify)      then a human
         ▼
 ┌─────────────── EXECUTOR ───────────────┐
 │ recompute hash(tool,args); verify HMAC │──► write endpoints (credential held only here)
 │ idempotent write; kill switch          │
 └──────────────────┬─────────────────────┘
                    ▼
        append-only, hash-chained ACTION LOG
```

| Component | Responsibility |
|---|---|
| Channel | Receives messages; identifies the caller from the channel identity (phone number), never from message text; labels all customer text untrusted |
| Agent | Understands the request, plans, calls read tools, builds an action proposal |
| Verifier | Re-fetches facts; evaluates every claim; produces a verdict and reasons |
| Risk router | Maps verification results and risk features to ALLOW / ESCALATE / BLOCK |
| Executor | The only holder of the write credential; refuses anything without a matching signed verdict |
| Approval | Pauses the flow for a human; edits are re-verified |
| Memory | Conversation state; customer history; the seller's past decisions as precedents |
| Action log | Tamper-evident record of every event |

## 3. The action proposal

```json
{
  "proposal_id": "prop_7",
  "tool": "issue_refund",
  "args": { "order_id": 1042, "amount": 1299, "reason": "damaged" },
  "claims": [
    { "kind": "ownership",   "source": "tool",   "statement": "Order 1042 belongs to the caller" },
    { "kind": "state",       "source": "tool",   "statement": "Order 1042 was delivered" },
    { "kind": "temporal",    "source": "tool",   "statement": "Delivered 3 day(s) ago: inside the 7-day window" },
    { "kind": "eligibility", "source": "tool",   "statement": "Item is returnable (not perishable)" },
    { "kind": "monetary",    "source": "tool",   "statement": "₹1,299 is refundable on this order" },
    { "kind": "duplicate",   "source": "tool",   "statement": "No earlier refund of ₹1,299 on this order" },
    { "kind": "evidence",    "source": "tool",   "statement": "A photo of the item is on file" },
    { "kind": "policy",      "source": "policy", "clause": 1,
      "quote": "Returns and refunds are accepted within 7 days of delivery." }
  ],
  "injection_flags": []
}
```

Each claim has a **kind** and a **source** (`tool`, `policy`, or `customer`). The source matters: a claim whose source is the customer's own text is never accepted on its own.

| Kind | Deterministic check (T0) |
|---|---|
| `ownership` | The order's customer id equals the caller's id (re-fetched) |
| `state` | `delivered`: the courier reports delivered. `not_dispatched`: order status is placed or packed |
| `temporal` | Days since delivery ≤ the seller's return window, computed from records |
| `monetary` | 0 < amount ≤ paid − already refunded |
| `duplicate` | No earlier refund of the same amount on this order |
| `eligibility` | The item is not perishable |
| `evidence` | A photo is on file for this order |
| `authority` | Always fails: authority asserted in customer text cannot widen limits or replace a record |
| `policy` | Handled by T1 (below) |

## 4. The Verifier

**T0, deterministic.** For every claim, re-fetch the relevant record through the store API and compare. No model is involved. If a source cannot be reached, the verdict is ESCALATE, never ALLOW (fail closed).

**T1, policy grounding with quote-or-fail.** Policy lives as text. The proposal's policy claim carries a clause id and a **verbatim quote**. The Verifier checks that the quote is an exact substring of that clause (whitespace-normalised only). A paraphrase, an invented clause or a changed number fails. This turns "the model says the policy allows it" into a string comparison.

**T2, careful consensus (design only).** For genuinely ambiguous policy language, run a stronger model several times and require unanimity, otherwise escalate. Not implemented in the demo.

**Untrusted input.** Customer messages, free-text notes and tool-output fields are untrusted: they may *describe* a situation but never set limits, authority or policy. A heuristic scanner flags instruction-like text as a *signal* that raises the risk tier; the defence itself is structural (no verdict, no write).

## 5. Risk router

Rules, in order:

1. Any failed claim → **BLOCK**, with reason codes (one per failed claim kind).
2. Source unavailable or verifier error → **ESCALATE** (fail closed).
3. Otherwise collect escalation reasons: amount above the seller's auto-approval limit (`over_auto_limit`); a refund already issued to this customer within the frequency window (`refund_frequency`); instruction-like text in untrusted input (`injection_flags`).
4. Any reason → **ESCALATE**; none → **ALLOW**.

**Repair.** A BLOCK returns structured reasons. The agent gets **one** repair attempt, allowed only when the sole failure is an over-claimed amount and no untrusted instructions were seen. The repaired proposal is verified from scratch.

Seller settings (auto-limit, return window, frequency window) are hard parameters of these rules.

## 6. Signed verdict and Executor

- `args_hash = SHA-256(canonical_json({tool, args}))` (sorted keys, no whitespace).
- The verdict token is `{proposal_id, verdict, args_hash, exp}` signed with **HMAC-SHA256**.
- The Executor accepts `(tool, args, token)` and checks, in order: kill switch off; token present; signature valid; not expired; `args_hash` equals the hash of the arguments actually being executed; verdict is ALLOW or APPROVED.
- Writes carry an **idempotency key** (the proposal id), so a retry cannot double-refund.
- The agent holds no write credential, so even a fully manipulated agent cannot call a write endpoint.

This closes the time-of-check/time-of-use gap: the thing that was verified is the thing that executes.

## 7. Human approval

An ESCALATE pauses the flow and presents the seller with the proposal, the verified claims and the reasons. The seller can approve, reject, or **edit** the amount. An edit is **re-verified from scratch**; the old verdict is never reused. Approval produces an `APPROVED` token bound to the final arguments. (The full design uses a graph-runtime interrupt so the paused run resumes on the same thread.)

## 8. Memory

| Layer | Content | Use |
|---|---|---|
| Conversation | Messages, plan, evidence, proposal | Resuming paused flows |
| Customer history | Refunds in the last N days | Risk router |
| Seller precedents | `{action, amount, decision, edited}` | Suggested threshold changes; example cases for T2 |

Precedents can *suggest* a threshold change (for example after repeated over-limit approvals), but a human must accept it. Thresholds never change automatically.

## 9. Action log

Every event (message, read, proposal, verification, verdict, approval, execution) is appended to a log where each row hashes the previous row's hash together with its own content. Editing any row breaks every later hash, which the chain check reports. The demo lets you tamper with a row and watch it fail.

## 10. Security notes

- Caller identity comes from the channel, never from message text.
- Reads of another customer's order disclose nothing.
- Verifier or source failure means ESCALATE, never ALLOW.
- Signing key is held outside the data model; the agent code path has no access to the write credential.
- Instruction-like text in notes is treated as data and flagged; it cannot create authority.
- Logs should mask phone numbers and never contain tokens or keys. (In this demo all data is mock.)

## 11. Implemented vs designed

| Capability | In this repo's demo | Notes |
|---|---|---|
| Action proposals with typed, sourced claims | ✅ | |
| T0 deterministic checks (8 claim kinds) | ✅ | Re-fetched through a mock store API; calls are visible in the Store tab |
| T1 quote-or-fail | ✅ | The quoting "model" is the deterministic agent (honest quote, or a fabricated one in Gullible mode) |
| T2 careful-model consensus | ❌ design only | Needs a real model |
| Risk router, repair attempt, seller approval + edit-and-re-verify | ✅ | |
| HMAC verdict bound to hash(tool, args); Executor; idempotent writes | ✅ | WebCrypto in the browser |
| Hash-chained action log with tamper detection | ✅ | |
| Kill switch, guard on/off baseline, courier outage simulation | ✅ | |
| Precedent memory + suggested threshold | ✅ (basic) | |
| Real language model planner / parser | ❌ | Replaced by deterministic rules |
| Chat channel integration | ❌ | Simulated chat UI |
| Real store, courier and payment APIs | ❌ | In-browser mocks |
| Server-side signing key and persistence | ❌ | Demo state lives in the page and resets on reload |
| Graph-runtime interrupt/resume | ❌ | Approval pause is modelled in the demo |
