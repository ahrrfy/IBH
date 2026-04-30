// Frontend API client for the Data Migration Center (server-driven import).
//
// Pairs with the existing client-side <ImportWizard /> component, which
// remains the recommended path for small per-module imports (≤ a few thousand
// rows). The server-driven path below is for the comprehensive 6-step wizard
// that handles all 15 entity types via a single endpoint family.
//
// Architecture (matches the API backend):
//   1. createSession(file, entityType)          → { sessionId, sheets?, columns?, sampleRows? }
//   2. selectSheet(sessionId, sheetName, file)  → { columns, sampleRows }     (XLSX with multiple sheets)
//   3. autoMap(sessionId)                        → { mappings, unmappedColumns, unmappedFields }
//   4. confirmMapping(sessionId, mapping)        → { status: 'mapping_confirmed' }
//   5. validate(sessionId)                       → { status: 'validating' }   (BullMQ job)
//   6. preview(sessionId)                        → { summary, sampleValid, sampleErrors }
//   7. startImport(sessionId)                    → { status: 'importing' }
//   8. summary(sessionId) / errorReport(sessionId) / rollback(sessionId)
//
// Errors come back as ApiError with bilingual messageAr/messageEn.

import { api, get, post } from './api';

export type ImportableEntityType =
  | 'product_category' | 'unit_of_measure' | 'product_template' | 'product_variant'
  | 'warehouse' | 'customer' | 'supplier' | 'chart_of_accounts'
  | 'opening_stock' | 'opening_balance' | 'price_list' | 'employee'
  | 'department' | 'reorder_point' | 'supplier_price';

export interface SheetInfo {
  name: string;
  rowCount: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  status: string;
  sheets?: SheetInfo[];
  columns?: string[];
  sampleRows?: Record<string, unknown>[];
  totalRows: number;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AutoMapResponse {
  mappings: ColumnMapping[];
  unmappedColumns: string[];
  unmappedFields: string[];
}

export interface PreviewResponse {
  summary: { total: number; valid: number; errors: number; status: string };
  sampleValid: Array<{ rowNumber: number; data: Record<string, unknown>; warnings: unknown }>;
  sampleErrors: Array<{ rowNumber: number; data: Record<string, unknown>; errors: unknown }>;
}

export interface ImportSummary {
  sessionId: string;
  entityType: string;
  entityLabel: { ar: string; en: string };
  total: number;
  imported: number;
  errors: number;
  skipped: number;
  warnings: number;
  duration: string;
  canRollback: boolean;
}

export interface EntityTypeInfo {
  type: ImportableEntityType;
  label: { ar: string; en: string };
  dependencies: ImportableEntityType[];
}

// ─── Multipart helper ────────────────────────────────────────────────────────
// api() detects FormData and skips JSON Content-Type so the browser sets the
// multipart boundary itself. PATCH is used for sheet selection (step 2).

async function apiMultipart<T = unknown>(
  path: string,
  formData: FormData,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  return api<T>(path, { method, body: formData });
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

export const dataMigration = {
  listEntityTypes: () => get<EntityTypeInfo[]>('/data-migration/entity-types'),

  /** Step 1 — upload file and create session. */
  async createSession(file: File, entityType: ImportableEntityType): Promise<CreateSessionResponse> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    return apiMultipart<CreateSessionResponse>('/data-migration/sessions', fd);
  },

  /** Step 2 — pick which sheet to use (XLSX with multiple non-empty sheets). */
  async selectSheet(sessionId: string, sheetName: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sheetName', sheetName);
    return apiMultipart<{ columns: string[]; sampleRows: Record<string, unknown>[]; totalRows: number }>(
      `/data-migration/sessions/${sessionId}/sheet`,
      fd,
      'PATCH',
    );
  },

  /** Step 3a — fetch the auto-mapper's best guess. */
  autoMap: (sessionId: string) =>
    get<AutoMapResponse>(`/data-migration/sessions/${sessionId}/auto-map`),

  /** Step 3b — commit the column mapping (user-confirmed, possibly edited). */
  confirmMapping: (
    sessionId: string,
    mapping: Record<string, string>,
    options?: {
      duplicateStrategy?: 'skip' | 'update' | 'create_new';
      dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'auto';
      defaultCurrency?: string;
    },
  ) =>
    post<{ status: string }>(
      `/data-migration/sessions/${sessionId}/mapping`,
      { mapping, options },
    ),

  /** Step 4 — kick off async validation (BullMQ). Poll preview() for state. */
  startValidation: (sessionId: string) =>
    post<{ status: string }>(`/data-migration/sessions/${sessionId}/validate`, {}),

  preview: (sessionId: string) =>
    get<PreviewResponse>(`/data-migration/sessions/${sessionId}/preview`),

  /** Step 5 — kick off import (after validation reports `status: 'ready'`). */
  startImport: (sessionId: string) =>
    post<{ status: string }>(`/data-migration/sessions/${sessionId}/import`, {}),

  pause: (sessionId: string) =>
    post<{ status: string }>(`/data-migration/sessions/${sessionId}/pause`, {}),

  resume: (sessionId: string) =>
    post<{ status: string }>(`/data-migration/sessions/${sessionId}/resume`, {}),

  /** Step 6 — summary (poll while status === 'importing'). */
  summary: (sessionId: string) => get<ImportSummary>(`/data-migration/sessions/${sessionId}/summary`),

  rollback: (sessionId: string) =>
    post<{ rolledBack: number; failed: number }>(
      `/data-migration/sessions/${sessionId}/rollback`,
      {},
    ),

  // ─── Templates + reports (file downloads) ─────────────────────────────────

  /** Returns a same-origin URL for direct browser download (auth via cookie/header). */
  templateUrl: (entityType: ImportableEntityType): string =>
    `/api/v1/data-migration/templates/${entityType}`,

  errorReportUrl: (sessionId: string): string =>
    `/api/v1/data-migration/sessions/${sessionId}/error-report`,
};
