// Plain-language reasons shown to people (the engine's reason codes stay in the technical view).
export const PLAIN: Record<string, string> = {
  over_auto_limit: "The amount is above the seller's auto-approval limit.",
  refund_frequency: 'This customer already received a refund recently.',
  injection_flags: "Instructions were hiding in the customer's text.",
  source_unavailable: "A system didn't answer, so Kavach stopped to be safe.",
  verifier_error: 'Something went wrong in the check, so Kavach stopped to be safe.',
  ownership: "The order isn't this customer's.",
  state: "The order isn't in the right state for this.",
  temporal: "It's outside the return window.",
  monetary: 'The amount is more than can be refunded.',
  duplicate: 'It was already refunded.',
  eligibility: "This item can't be returned.",
  evidence: 'A photo is missing.',
  authority: "A chat message can't grant approval.",
  policy: "The quoted policy isn't in the written policy.",
};
