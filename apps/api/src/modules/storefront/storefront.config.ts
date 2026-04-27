/**
 * Storefront configuration helpers.
 *
 * The public storefront has NO authenticated user/company context, so we resolve
 * the target tenant + warehouse + branch from environment variables. All public
 * endpoints scope their queries to this single configured company so they can
 * never accidentally read across tenants.
 *
 * Required env vars (set in deployment):
 *   STOREFRONT_COMPANY_ID    — companyId all public traffic is scoped to
 *   STOREFRONT_BRANCH_ID     — default branch for online orders
 *   STOREFRONT_WAREHOUSE_ID  — default warehouse for online orders
 *
 * For local dev these can be overridden in the `.env` file.
 */
export interface StorefrontConfig {
  companyId: string;
  branchId: string;
  warehouseId: string;
}

export function readStorefrontConfig(): StorefrontConfig {
  const companyId   = process.env.STOREFRONT_COMPANY_ID   ?? '';
  const branchId    = process.env.STOREFRONT_BRANCH_ID    ?? '';
  const warehouseId = process.env.STOREFRONT_WAREHOUSE_ID ?? '';
  return { companyId, branchId, warehouseId };
}

export function assertStorefrontConfig(cfg: StorefrontConfig): void {
  if (!cfg.companyId || !cfg.branchId || !cfg.warehouseId) {
    throw new Error(
      'Storefront not configured: STOREFRONT_COMPANY_ID / STOREFRONT_BRANCH_ID / STOREFRONT_WAREHOUSE_ID must be set',
    );
  }
}
