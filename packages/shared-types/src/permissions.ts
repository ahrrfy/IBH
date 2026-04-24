// ─── Permissions — F1 Philosophy (RBAC + ABAC + Field-Level) ─────────────────
// 7 permission levels per Entity — enforced at PostgreSQL RLS level

/** The 7 permission actions per entity (Decision F1) */
export type PermissionAction =
  | 'Create'    // C — create new record
  | 'Read'      // R — read/list records
  | 'Update'    // U — edit draft records
  | 'Delete'    // D — soft delete
  | 'Submit'    // S — submit for approval (user-level sign-off)
  | 'Approve'   // A — final approval (management sign-off)
  | 'Print';    // P — print / export PDF

/** Permission bitmask: C=1, R=2, U=4, D=8, S=16, A=32, P=64 */
export const PERMISSION_BIT: Record<PermissionAction, number> = {
  Create:  1,
  Read:    2,
  Update:  4,
  Delete:  8,
  Submit:  16,
  Approve: 32,
  Print:   64,
};

/** All 15 system roles */
export type SystemRole =
  | 'SuperAdmin'
  | 'CompanyAdmin'
  | 'CEO'
  | 'CFO'
  | 'Accountant'
  | 'BranchManager'
  | 'SalesManager'
  | 'Cashier'
  | 'WarehouseManager'
  | 'PurchasingOfficer'
  | 'HRManager'
  | 'Employee'
  | 'SalesRep'
  | 'ITSupport'
  | 'ReadonlyAuditor';

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
