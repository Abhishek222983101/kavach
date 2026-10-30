# References and caveats

Accessed 30 Oct 2026. Items are marked *primary* or *secondary*; secondary sources (vendor blogs summarising industry data) are used only for context and are labelled as estimates wherever they appear.

## The cost of agents acting on invented facts

- **Moffatt v. Air Canada** (BC Civil Resolution Tribunal, Feb 2024). *Primary.* An airline's chatbot gave wrong guidance about bereavement refunds; the tribunal held the airline responsible for its chatbot's statements and ordered C$812.02 in total (C$650.88 damages, C$36.14 interest, C$125 fees). Decision: <https://decisions.civilresolutionbc.ca/crt/crtd/en/525448/1/document.do>. Also reported by BBC Travel (23 Feb 2024), Ars Technica (16 Feb 2024) and ABA *Business Law Today* (29 Feb 2024). A small-claims tribunal decision, not a binding precedent everywhere.
- **Cursor support bot "Sam"** (Apr 2025). *Secondary (press report of a public thread and company reply).* A support bot invented a "one device per subscription" policy. CX Today: <https://www.cxtoday.com/contact-center/a-contact-center-chatbot-invents-company-policies-now-customers-want-out/>.

## Reliability of tool-using agents

- **τ-bench** — Yao, Shinn, Razavi, Narasimhan (2024), arXiv:2406.12045; ICLR 2025. *Primary.* Benchmarks agents on policy-following customer-service tasks with simulated users and tools, and introduces **pass^k**, the probability that all k trials of a task succeed. The paper reported (for 2024 models) GPT-4o solving under half of tasks and pass^8 below 25% in the retail domain. **Those numbers describe 2024 models and should not be read as current.** <https://arxiv.org/abs/2406.12045>.
- **τ³-bench** task fixes and the Princeton **HAL** reliability dashboard show newer models score much higher, while repeated-trial reliability remains the metric of interest. <https://taubench.com/blog/tau3-task-fixes.html>, <https://hal.cs.princeton.edu/reliability/benchmark/taubench_airline/>.

## Industry context (secondary, estimates)

- "Where is my order?" queries are commonly estimated at **25–40%** of inbound e-commerce support volume (higher at peaks); one source gives 30–50% for D2C sellers. Cited by OperateAI (Aug 2026), quoting Decagon benchmarks; SignalBX (Jul 2026). *Secondary.*
- Roughly **26%** of cash-on-delivery orders are reported to return to origin, against under 2% for prepaid (Shipway FY25 data as cited by OperateAI and Vyora, 2026). Other sources give 15–30%. *Secondary.*
- The COD share of Indian e-commerce orders varies from about 25% to 70% depending on the source; **no figure is used in this project.**

## Technology

- **LangGraph interrupts and human-in-the-loop**: `interrupt()` pauses a graph, requires a checkpointer, and resumes with `Command(resume=…)` on the same thread id; the interrupted node re-runs from its start. <https://docs.langchain.com/oss/python/langgraph/interrupts>.
- **Razorpay refunds API**: `POST /v1/payments/:id/refund`; idempotency via the `X-Refund-Idempotency` header; refunds only on captured payments. <https://razorpay.com/docs/api/refunds>.
- **WhatsApp Cloud API**: a free developer test number with a small recipient allow-list, signed webhooks (`X-Hub-Signature-256`), and a 24-hour customer-service window for free-form replies. Pricing for replies has changed recently; check Meta's pricing page before stating any cost.
- **Web Crypto** (SHA-256, HMAC-SHA-256) is used for hashing and signing in the demo: <https://developer.mozilla.org/docs/Web/API/SubtleCrypto>.
