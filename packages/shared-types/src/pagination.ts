// ─── Pagination — Cursor-based (mandatory per architecture) ──────────────────
// Offset pagination is FORBIDDEN for large tables.
// All list endpoints use cursor-based pagination.

export interface CursorPaginationRequest {
  /** ULID cursor from previous response */
  cursor?: string;
  /** Items per page — max 100 */
  limit: number;
  /** Sort direction */
  direction?: 'asc' | 'desc';
}

export interface CursorPaginationResponse<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  totalCount?: number;      // optional — expensive, use sparingly
}

/** Standard filter applied to most list queries */
export interface BaseListFilter {
  search?: string;
  companyId?: string;
  branchId?: string;
  isActive?: boolean;
  dateFrom?: string;        // ISO date
  dateTo?: string;
  cursor?: string;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/** Date range for reports */
export interface DateRangeFilter {
  dateFrom: string;
  dateTo: string;
  compareFrom?: string;     // for period comparison
  compareTo?: string;
}
