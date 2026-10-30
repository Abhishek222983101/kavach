export type Mode = 'careful' | 'gullible';
export type Lang = 'en' | 'hinglish';
export type Verdict = 'ALLOW' | 'ESCALATE' | 'BLOCK';
export type ClaimKind =
  | 'ownership' | 'state' | 'temporal' | 'monetary' | 'duplicate'
  | 'eligibility' | 'evidence' | 'authority' | 'policy';
export type Source = 'tool' | 'policy' | 'customer';
export type WriteTool = 'issue_refund' | 'create_return_pickup' | 'update_address' | 'cancel_order';
export type Level = 'info' | 'ok' | 'warn' | 'fail';
export type Phase =
  | 'ingest' | 'understand' | 'plan' | 'read' | 'propose' | 'verify'
  | 'route' | 'approval' | 'execute' | 'reply' | 'log';

export interface Customer { id: string; name: string; phone: string }
export interface Order {
  id: number; customer: string; item: string; paid: number;
  status: 'placed' | 'packed' | 'shipped' | 'delivered';
  deliveredDaysAgo: number | null; awb: string | null;
  perishable: boolean; note: string; address: string; cod: boolean;
}
export interface Refund { id: string; order: number; amount: number; daysAgo: number; customer: string }
export interface PolicyClause { id: number; text: string }

export interface Settings {
  autoLimit: number;
  windowDays: number;
  freqDays: number;
  writesEnabled: boolean; // kill switch (true = writes allowed)
  guard: boolean;         // false = baseline B0 (agent writes directly)
  mode: Mode;
  courierDown: boolean;
  speed: number;          // ms between revealed steps (0 in tests)
}

export interface Claim {
  id: string;
  kind: ClaimKind;
  statement: string;
  source: Source;
  evidence?: string;
  clause?: number;
  quote?: string;
  expect?: 'delivered' | 'not_dispatched';
}
export interface Proposal {
  id: string;
  tool: WriteTool;
  args: Record<string, string | number>;
  claims: Claim[];
  injectionFlags: string[];
}
export interface ClaimResult { claim: Claim; ok: boolean; why: string; tier: 'T0' | 'T1' }
export interface RiskFeatures {
  amountRatio: number | null;
  overCap: boolean;
  refundsRecent: number;
  injectionFlags: string[];
  verifiedFraction: number;
}
export interface VerifyOutcome {
  verdict: Verdict;
  reasons: string[];
  results: ClaimResult[];
  risk: RiskFeatures;
  tier: string;
}
export interface Token {
  proposal_id: string;
  verdict: 'ALLOW' | 'APPROVED';
  args_hash: string;
  exp: number;
  sig: string;
}

export interface Step {
  id: number;
  phase: Phase;
  title: string;
  detail?: string;
  why?: string;
  level: Level;
  claims?: ClaimResult[];
  route?: { verdict: Verdict; reasons: string[]; risk: RiskFeatures; tier: string };
  token?: { verdict: string; argsHash: string; sig: string };
  proposal?: Proposal;
}
export interface Turn {
  id: number;
  customerId: string;
  text: string;
  mode: Mode;
  guard: boolean;
  steps: Step[];
  reply?: string;
  verdict?: Verdict | 'NONE';
  reasons: string[];
  executed: boolean;
  unguarded: boolean;
  status: 'running' | 'pending' | 'done';
  replyEn?: string;
  /** why no proposal was made: the agent asked a question, stopped itself, handed over to a human, or only read */
  note?: 'asked' | 'self_stop' | 'ticket' | 'read';
  noteText?: string;
}
export interface ChatMsg { id: number; role: 'customer' | 'agent' | 'system'; text: string; gloss?: string }
export interface Approval {
  id: number;
  turnId: number;
  customerId: string;
  proposal: Proposal;
  outcome: VerifyOutcome;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
}
export interface Ticket { id: number; turnId: number; summary: string; status: 'open' | 'acknowledged' }
export interface Precedent { action: string; amount: number | null; decision: 'approved' | 'rejected'; edited: boolean }
export interface ApiCall { id: number; by: 'agent' | 'verifier' | 'executor' | 'lab'; method: string; path: string; status: number }
export interface LogRow { i: number; ts: string; event: string; summary: string; payload: Record<string, unknown>; prev: string; hash: string }

export interface World {
  version: number;
  listeners: Set<() => void>;
  customers: Customer[];
  orders: Map<number, Order>;
  refunds: Refund[];
  returns: { id: string; order: number }[];
  policy: PolicyClause[];
  settings: Settings;
  photos: Set<number>;
  chats: Record<string, ChatMsg[]>;
  turns: Turn[];
  approvals: Approval[];
  tickets: Ticket[];
  apiLog: ApiCall[];
  log: LogRow[];
  precedents: Precedent[];
  done: Map<string, string>;
  counters: { ALLOW: number; ESCALATE: number; BLOCK: number };
  seq: number;
  writeCred: string;
}
