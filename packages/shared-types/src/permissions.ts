// ─── Permissions — F1 Philosophy (RBAC + ABAC + Field-Level) ─────────────────
// 7 permission levels per Entity — enforced at PostgreSQL RLS level

/**
 * The 7 canonical permission actions per entity (Decision F1).
 * Accepts any string — custom actions (e.g. 'reconcile', 'post', 'dispose',
 * 'admin', 'use') resolve to bitmask 0 and require explicit role entries.
 */
export type PermissionAction =
  | 'Create' | 'Read' | 'Update' | 'Delete'
  | 'Submit' | 'Approve' | 'Print'
  // lowercase aliases (normalized at check time)
  | 'create' | 'read' | 'update' | 'delete'
  | 'submit' | 'approve' | 'print'
  // extended custom actions used across modules
  | (string & {});

/** Permission bitmask: C=1, R=2, U=4, D=8, S=16, A=32, P=64 */
export const PERMISSION_BIT: Record<string, number> = {
  Create:  1,  create:  1,
  Read:    2,  read:    2,
  Update:  4,  update:  4,
  Delete:  8,  delete:  8,
  Submit:  16, submit:  16,
  Approve: 32, approve: 32,
  Print:   64, print:   64,
  // Extended actions — grant via explicit role entry only
  post:       128, reconcile: 256, dispose:   512,
  admin:     1024, use:      2048, close:    4096,
  reopen:    8192, operate: 16384, void:     32768,
  manage:   65536,
};

/** Canonical system roles — accepts any string for custom/snake_case variants */
export type SystemRole =
  | 'SuperAdmin' | 'CompanyAdmin' | 'CEO' | 'CFO' | 'Accountant'
  | 'BranchManager' | 'SalesManager' | 'Cashier' | 'WarehouseManager'
  | 'PurchasingOfficer' | 'HRManager' | 'Employee' | 'SalesRep'
  | 'ITSupport' | 'ReadonlyAuditor'
  | 'super_admin' | 'company_admin' | 'accountant' | 'cashier'
  | 'warehouse_manager' | 'sales_manager' | 'purchasing_officer'
  | 'hr_manager' | 'branch_manager' | 'readonly_auditor'
  | (string & {});

/** ABAC constraint applied to a permission rule */
export interface AbacConstraint {
  field: string;        // e.g. "branch_id", "amount"
  operator: 'eq' | 'lte' | 'gte' | 'in' | 'not';
  value: string | number | boolean | string[];
  /** If true, value comes from current user context e.g. user.branch_id */
  fromUserContext?: boolean;
}

/** One permission entry in a role definition */
export interface PermissionEntry {
  resource: string;            // e.g. "Invoice", "Product"
  actions: PermissionAction[];
  constraints?: AbacConstraint[];
  /** Fields this role CANNOT see — field-level security */
  hiddenFields?: string[];
  /** Fields this role CANNOT edit even if they can Update */
  readonlyFields?: string[];
}

/** Full role definition */
export interface RoleDefinition {
  id: ULID;
  name: SystemRole | string;   // can have custom roles
  displayNameAr: string;
  displayNameEn?: string;
  isSystem: boolean;           // system roles cannot be deleted
  permissions: PermissionEntry[];
  companyId?: ULID;           // null = global
  createdAt: string;
}

import type { ULID } from './common';
