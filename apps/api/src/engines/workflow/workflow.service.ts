import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  DocumentState,
  DocumentAction,
  TransitionResult,
  Transition,
} from './workflow.types';
import {
  STANDARD_TRANSITIONS,
  AUTO_APPROVE_TYPES,
  DIRECT_POST_TYPES,
} from './workflow.types';

// ─── Workflow Service (State Machine) ─────────────────────────────────────────
// Controls document lifecycle: Draft → Submitted → Approved → Posted → ...
// All transitions are validated, logged in Audit Trail, and fire domain events.
//
// Philosophy (F2):
//  - Approved documents are IMMUTABLE — only reverse + new document is allowed
//  - Transitions are explicit — no direct status updates from outside this engine

export interface TransitionRequest {
  documentType: string;   // e.g. 'SalesInvoice', 'PurchaseOrder'
  documentId:   string;
  currentState: DocumentState;
  action:       DocumentAction;
  performedBy:  string;   // userId
  companyId:    string;
  reason?:      string;
  /** Custom override transitions (for document types with special flows) */
  customTransitions?: Transition[];
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Transition ───────────────────────────────────────────────────────────

  /**
   * Execute a state transition.
   * - Validates the transition is legal
   * - Returns the new state
   * - Logs the transition to Audit Trail
   */
  async transition(req: TransitionRequest): Promise<TransitionResult> {
    const transitions = req.customTransitions ?? STANDARD_TRANSITIONS;

    // Find matching transition
    const found = transitions.find(t => {
      const fromMatch = Array.isArray(t.from)
        ? t.from.includes(req.currentState)
        : t.from === req.currentState;
      return fromMatch && t.action === req.action;
    });

    if (!found) {
      throw new BadRequestException({
        code:      'INVALID_TRANSITION',
        messageAr: `لا يمكن ${this.actionAr(req.action)} من حالة ${this.stateAr(req.currentState)}`,
        details:   { from: req.currentState, action: req.action },
      });
    }

    const newState = found.to;

    // Log transition in audit trail
    await this.audit.log({
      companyId:  req.companyId,
      userId:     req.performedBy,
      userEmail:  '',
      action:     `${req.documentType}.${req.action}`,
      entityType: req.documentType,
      entityId:   req.documentId,
      before:     { status: req.currentState },
      after:      { status: newState },
      reason:     req.reason,
    });

    const result: TransitionResult = {
      success:       true,
      previousState: req.currentState,
      currentState:  newState,
      action:        req.action,
      performedBy:   req.performedBy,
      performedAt:   new Date().toISOString(),
      reason:        req.reason,
    };

    this.logger.log(
      `[${req.documentType}#${req.documentId}] ${req.currentState} → ${newState} by ${req.performedBy}`,
    );

    return result;
  }

  // ─── Query Helpers ────────────────────────────────────────────────────────

  /**
   * Get all valid actions from the current state for a document type.
   */
  getAvailableActions(
    currentState: DocumentState,
    documentType: string,
    customTransitions?: Transition[],
  ): DocumentAction[] {
    const transitions = customTransitions ?? STANDARD_TRANSITIONS;

    return transitions
      .filter(t => {
        const fromMatch = Array.isArray(t.from)
          ? t.from.includes(currentState)
          : t.from === currentState;
        return fromMatch;
      })
      .map(t => t.action);
  }

  /**
   * Determine the initial state for a document type.
   * POS receipts start as 'posted'; most documents start as 'draft'.
   */
  getInitialState(documentType: string): DocumentState {
    if (DIRECT_POST_TYPES.has(documentType)) return 'posted';
    return 'draft';
  }

  /**
   * Check if a document can be edited (only draft/rejected states allow editing).
   */
  canEdit(state: DocumentState): boolean {
    return state === 'draft' || state === 'rejected';
  }

  /**
   * Check if a document is in a terminal state (cannot transition further).
   */
  isTerminal(state: DocumentState): boolean {
    return ['closed', 'cancelled', 'reversed'].includes(state);
  }

  /**
   * For document types that auto-approve on submit (e.g. StockTransfer),
   * returns 'approved' instead of 'submitted'.
   */
  getStateAfterSubmit(documentType: string): DocumentState {
    return AUTO_APPROVE_TYPES.has(documentType) ? 'approved' : 'submitted';
  }

  // ─── Convenience Transition Wrappers ──────────────────────────────────────

  async submit(req: Omit<TransitionRequest, 'action'>): Promise<TransitionResult> {
    return this.transition({ ...req, action: 'submit' });
  }

  async approve(req: Omit<TransitionRequest, 'action'>): Promise<TransitionResult> {
    return this.transition({ ...req, action: 'approve' });
  }

  async reject(req: Omit<TransitionRequest, 'action'>): Promise<TransitionResult> {
    return this.transition({ ...req, action: 'reject' });
  }

  async post(req: Omit<TransitionRequest, 'action'>): Promise<TransitionResult> {
    return this.transition({ ...req, action: 'post' });
  }

  async cancel(req: Omit<TransitionRequest, 'action'>): Promise<TransitionResult> {
    return this.transition({ ...req, action: 'cancel' });
  }

  async reverse(req: Omit<TransitionRequest, 'action'>): Promise<TransitionResult> {
    return this.transition({ ...req, action: 'reverse' });
  }

  async close(req: Omit<TransitionRequest, 'action'>): Promise<TransitionResult> {
    return this.transition({ ...req, action: 'close' });
  }

  // ─── Arabic Labels ────────────────────────────────────────────────────────

  private stateAr(state: DocumentState): string {
    const map: Record<DocumentState, string> = {
      draft:     'مسودة',
      submitted: 'مُقدَّم',
      approved:  'مُعتمد',
      rejected:  'مرفوض',
      posted:    'مُرحَّل',
      paid:      'مدفوع',
      delivered: 'مُسلَّم',
      closed:    'مُغلق',
      cancelled: 'مُلغى',
      reversed:  'مَعكوس',
    };
    return map[state] ?? state;
  }

  private actionAr(action: DocumentAction): string {
    const map: Record<DocumentAction, string> = {
      submit:  'تقديم',
      approve: 'اعتماد',
      reject:  'رفض',
      post:    'ترحيل',
      pay:     'دفع',
      deliver: 'تسليم',
      close:   'إغلاق',
      cancel:  'إلغاء',
      reverse: 'عكس',
      reopen:  'إعادة فتح',
      reset:   'إعادة ضبط',
    };
    return map[action] ?? action;
  }
}
