// Customer-facing replies. Generated only from tool results and verdict reasons (never from free model text).
import type { Lang } from './types';

type Vars = Record<string, string | number>;
const T: Record<string, { en: string; hinglish: string }> = {
  ask_order: { en: 'Which order is this about? Your recent orders: {list}.', hinglish: 'Kaun sa order hai? Aapke recent orders: {list}.' },
  no_order: { en: "I couldn't find order {id}.", hinglish: 'Order {id} mujhe nahi mila.' },
  not_yours: { en: 'I can only help with orders placed from your own number.', hinglish: 'Main sirf aapke apne number ke orders mein madad kar sakta hoon.' },
  wismo_delivered: { en: 'Order {id} ({item}) was delivered {days} day(s) ago.', hinglish: 'Order {id} ({item}) {days} din pehle deliver ho chuka hai.' },
  wismo_shipped: { en: 'Order {id} ({item}) is on its way (courier status: in transit).', hinglish: 'Order {id} ({item}) raaste mein hai (courier status: in transit).' },
  wismo_placed: { en: 'Order {id} ({item}) is confirmed and will be dispatched soon.', hinglish: 'Order {id} ({item}) confirm hai, jaldi dispatch hoga.' },
  courier_down: {
    en: "Courier tracking isn't responding right now. I've passed this to the seller with a summary and they'll get back to you.",
    hinglish: 'Courier tracking abhi respond nahi kar raha. Maine seller ko summary ke saath bhej diya hai, woh aapse baat karenge.',
  },
  ask_photo: { en: 'Sorry to hear that. Please attach a photo of the item and I will continue.', hinglish: 'Yeh sunke bura laga. Kripya item ki photo attach karein, phir main aage badhta hoon.' },
  ask_address: { en: 'Please send the new address after a colon, e.g. "Order 1054 address change: 12 MG Road, Pune".', hinglish: 'Naya address colon ke baad bhejein, jaise "Order 1054 address change: 12 MG Road, Pune".' },
  refund_done: { en: 'Done: {amount} refund processed for order {id} (ref {ref}).', hinglish: 'Ho gaya: order {id} ka {amount} refund process ho gaya hai (ref {ref}).' },
  pickup_done: { en: 'Return pickup booked for order {id} (ref {ref}).', hinglish: 'Order {id} ka return pickup book ho gaya hai (ref {ref}).' },
  address_done: { en: 'Address updated for order {id}.', hinglish: 'Order {id} ka address update ho gaya hai.' },
  cancel_done: { en: 'Order {id} has been cancelled.', hinglish: 'Order {id} cancel ho gaya hai.' },
  pending: { en: "This needs the seller's approval. I've sent it to them and you'll hear back here.", hinglish: 'Isko seller ki approval chahiye. Maine unhe bhej diya hai, yahin update milega.' },
  rejected: { en: "The seller couldn't approve this request. I've noted your message.", hinglish: 'Seller yeh request approve nahi kar paaye. Maine aapka message note kar liya hai.' },
  paused: { en: "The seller has paused automatic actions for now; I've noted your request.", hinglish: 'Seller ne abhi automatic actions pause kiye hain; maine aapki request note kar li hai.' },
  stopped: { en: "Something didn't check out at the final step, so I stopped and informed the seller.", hinglish: 'Aakhri step par kuch match nahi hua, isliye maine ruk kar seller ko bata diya.' },
  unknown: { en: 'I can help with order status, refunds, returns, address changes and cancellations. Which order?', hinglish: 'Main order status, refund, return, address change aur cancel mein madad kar sakta hoon. Kaun sa order?' },
  logged: { en: "I've logged this request.", hinglish: 'Maine yeh request log kar li hai.' },
  r_temporal: { en: 'Our written policy allows returns and refunds within {window} days of delivery; this order was delivered {days} days ago.', hinglish: 'Hamari policy mein delivery ke {window} din ke andar hi return/refund hota hai; yeh order {days} din pehle deliver hua tha.' },
  r_ownership: { en: 'I can only help with orders placed from your own number.', hinglish: 'Main sirf aapke apne number ke orders mein madad kar sakta hoon.' },
  r_duplicate: { en: 'A refund has already been issued on this order, or the amount is more than what is refundable.', hinglish: 'Is order par refund pehle hi ho chuka hai, ya amount refundable se zyada hai.' },
  r_monetary: { en: 'That amount is more than what is refundable on this order ({left}).', hinglish: 'Yeh amount is order par refundable amount ({left}) se zyada hai.' },
  r_eligibility: { en: "This item is perishable, so it isn't returnable under our policy.", hinglish: 'Yeh item perishable hai, isliye policy ke hisaab se return nahi ho sakta.' },
  r_authority: { en: "I can't act on approvals relayed through chat. If the seller agrees, they can approve it directly.", hinglish: 'Chat ke through di gayi approvals par main action nahi le sakta. Seller agree hain to woh seedha approve kar sakte hain.' },
  r_policy: { en: "I couldn't confirm that against our written policy.", hinglish: 'Main isse hamari written policy se confirm nahi kar paaya.' },
  r_state: { en: "This order isn't in a state where that is possible (for example it has already been dispatched).", hinglish: 'Is order ke liye yeh abhi possible nahi hai (jaise woh pehle hi dispatch ho chuka hai).' },
  r_evidence: { en: 'I need a photo first.', hinglish: 'Pehle photo chahiye.' },
};

export function t(lang: Lang, key: string, vars: Vars = {}): string {
  const e = T[key];
  const s = e ? e[lang] : key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
export const REASON_LABEL: Record<string, string> = {
  over_auto_limit: 'Amount is above the seller auto-approval limit',
  refund_frequency: 'Customer already had a refund in the frequency window',
  injection_flags: 'Untrusted text contained instructions (signal)',
  source_unavailable: 'A system of record did not respond (fail-closed)',
  verifier_error: 'Verifier error (fail-closed)',
  ownership: 'Order does not belong to the caller',
  state: 'Order is not in the required state',
  temporal: 'Outside the policy window',
  monetary: 'Amount exceeds what is refundable',
  duplicate: 'Duplicate of an earlier refund',
  eligibility: 'Item is not eligible',
  evidence: 'Required evidence is missing',
  authority: 'Customer-sourced authority claim',
  policy: 'Policy quote could not be verified',
};
