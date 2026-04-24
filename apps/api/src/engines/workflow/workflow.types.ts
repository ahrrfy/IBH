// ─── Workflow / State Machine Types ───────────────────────────────────────────
// Every business document follows the same lifecycle:
//   Draft → Submitted → Approved → Posted → [Paid | Delivered | Closed]
//                                      ↓
//                                  Reversed  (via reversal entry only — never direct edit)
//
// The StateMachine engine enforces legal transitions and fires hooks on each transition.

export type DocumentState =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'paid'
  | 'delivered'
  | 'closed'
  | 'cancelled'
  | 'reversed';

export type DocumentAction =
  | 'submit'      // draft → submitted
  | 'approve'     // submitted → approved
  | 'reject'      // submitted → rejected
  | 'post'        // approved → posted  (triggers accounting)
  | 'pay'         // posted → paid
  | 'deliver'     // posted → delivered
  | 'close'       // posted/paid/delivered → closed
  | 'cancel'      // draft/submitted → cancelled
  | 'reverse'     // posted → reversed (creates mirror journal entry)
  | 'reopen'      // rejected → draft  (allowed by policy)
  | 'reset';      // rejected → draft  (manager can reset to draft)

// A transition definition: from a state, given an action, move to next state
export interface Transition {
  from:    DocumentState | DocumentState[];
  action:  DocumentAction;
  to:      DocumentState;
  /** Permission required to perform this transition */
  requires?: string; // e.g. 'Invoice.approve'
  /** Guard: extra condition that must be true */
  guard?: string;
}

// Transition outcome returned to callers
export interface TransitionResult {
  success:      boolean;
  previousState: DocumentState;
  currentState: DocumentState;
  action:       DocumentAction;
  performedBy:  string;
  performedAt:  string; // ISO timestamp
  reason?:      string;
}

// ─── Standard Transition Table (all documents) ────────────────────────────────

export const STANDARD_TRANSITIONS: Transition[] = [
  // Draft → Submitted (user submits for approval)
  { from: 'draft',     action: 'submit',  to: 'submitted',  requires: 'submit'  },

  // Submitted → Approved / Rejected
  { from: 'submitted', action: 'approve', to: 'approved',   requires: 'approve' },
  { from: 'submitted', action: 'reject',  to: 'rejected',   requires: 'approve' },

  // Rejected → Draft (reopen for correction)
  { from: 'rejected',  action: 'reopen',  to: 'draft'                           },
  { from: 'rejected',  action: 'reset',   to: 'draft',      requires: 'approve' },

  // Approved → Posted (triggers Posting Engine)
  { from: 'approved',  action: 'post',    to: 'posted',     requires: 'approve' },

  // Posted terminal flows
  { from: 'posted',    action: 'pay',     to: 'paid'                            },
  { from: 'posted',    action: 'deliver', to: 'delivered'                       },
  { from: ['posted', 'paid', 'delivered'], action: 'close', to: 'closed'        },

  // Reversal (accounting: creates mirror entry)
  { from: 'posted',    action: 'reverse', to: 'reversed',   requires: 'approve' },

  // Cancellation (only before posting)
  { from: 'draft',     action: 'cancel',  to: 'cancelled'                       },
  { from: 'submitted', action: 'cancel',  to: 'cancelled',  requires: 'approve' },
];

// Document types that skip the approval step (auto-approve on submit)
export const AUTO_APPROVE_TYPES = new Set([
  'StockTransfer',   // internal warehouse movement
  'StocktakingLine', // inventory count line
]);

// Document types that go directly draft → posted (POS receipts)
export const DIRECT_POST_TYPES = new Set([
  'PosReceipt',
]);
