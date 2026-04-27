/**
 * Role-based UI personalization.
 *
 * For each role, defines:
 *   - Which modules are visible
 *   - In what priority order (first = most used by that role)
 *
 * Used by:
 *   - Dashboard launcher (filters + reorders tiles, first tile gets bigger)
 *   - Activity bar (filters icon list)
 *   - Sub-sidebar (filters section nav)
 */

export type ModuleKey =
  | 'sales' | 'pos' | 'inventory' | 'purchases'
  | 'finance' | 'assets' | 'hr' | 'jobs'
  | 'crm' | 'marketing' | 'reports' | 'settings'
  | 'delivery';

// Order matters — first item is the role's "primary" module (rendered larger)
const ROLE_MODULES: Record<string, ModuleKey[]> = {
  super_admin:        ['sales', 'pos', 'inventory', 'purchases', 'finance', 'delivery', 'assets', 'hr', 'jobs', 'crm', 'marketing', 'reports', 'settings'],
  company_admin:      ['sales', 'pos', 'inventory', 'purchases', 'finance', 'delivery', 'assets', 'hr', 'jobs', 'crm', 'marketing', 'reports', 'settings'],

  accountant:         ['finance', 'reports', 'sales', 'purchases', 'delivery', 'assets', 'inventory'],
  cashier:            ['pos', 'crm', 'inventory'],
  warehouse_manager:  ['inventory', 'purchases', 'delivery', 'reports'],
  sales_manager:      ['sales', 'crm', 'pos', 'delivery', 'reports', 'inventory', 'marketing'],
  purchasing_officer: ['purchases', 'inventory', 'reports'],
  hr_manager:         ['hr', 'reports'],
  branch_manager:     ['sales', 'pos', 'inventory', 'delivery', 'crm', 'reports', 'hr'],
  readonly_auditor:   ['reports', 'finance', 'sales', 'inventory', 'purchases', 'delivery', 'hr'],
};

/**
 * Returns the ordered list of modules visible to a user with these roles.
 * First role takes priority — its order leads. Modules from later roles
 * append after. Settings is always added at the end for non-admin users
 * with profile-only access.
 */
export function getVisibleModulesForRoles(roles: string[]): ModuleKey[] {
  const seen = new Set<ModuleKey>();
  const ordered: ModuleKey[] = [];

  for (const role of roles) {
    const mods = ROLE_MODULES[role] ?? [];
    for (const m of mods) {
      if (!seen.has(m)) {
        seen.add(m);
        ordered.push(m);
      }
    }
  }

  // Fallback for unknown role — at least show reports + settings so user isn't stuck
  if (ordered.length === 0) {
    ordered.push('reports', 'settings');
  }

  return ordered;
}

/** Quick check: can user access a specific module? */
export function canAccessModule(roles: string[], module: ModuleKey): boolean {
  return getVisibleModulesForRoles(roles).includes(module);
}

/** Default role labels in Arabic (for UI display) */
export const ROLE_LABELS_AR: Record<string, string> = {
  super_admin:        'مدير النظام الأعلى',
  company_admin:      'مدير الشركة',
  accountant:         'محاسب',
  cashier:            'كاشير',
  warehouse_manager:  'مدير المخزن',
  sales_manager:      'مدير المبيعات',
  purchasing_officer: 'مسؤول المشتريات',
  hr_manager:         'مدير الموارد البشرية',
  branch_manager:     'مدير الفرع',
  readonly_auditor:   'مدقق قراءة فقط',
};

/**
 * Per-module sub-sections used by SubSidebar.
 * Each module can have multiple sections (lists, reports, settings).
 */
export const MODULE_SECTIONS: Record<ModuleKey, { href: string; label: string; count?: number }[]> = {
  sales: [
    { href: '/sales/inbox',     label: 'صندوق الطلبات' },
    { href: '/sales/invoices',  label: 'الفواتير' },
    { href: '/sales/orders',    label: 'الطلبات' },
    { href: '/sales/quotations',label: 'عروض الأسعار' },
    { href: '/sales/customers', label: 'العملاء' },
    { href: '/sales/returns',   label: 'المرتجعات' },
  ],
  pos: [
    { href: '/pos/shifts',     label: 'الورديات' },
    { href: '/pos/receipts',   label: 'الإيصالات' },
    { href: '/pos/devices',    label: 'الأجهزة' },
  ],
  inventory: [
    { href: '/inventory/products',   label: 'المنتجات' },
    { href: '/inventory/stock',      label: 'حركات المخزون' },
    { href: '/inventory/warehouses', label: 'المستودعات' },
    { href: '/inventory/transfers',  label: 'التحويلات' },
    { href: '/inventory/stocktaking',label: 'الجرد' },
  ],
  purchases: [
    { href: '/purchases/orders',    label: 'أوامر الشراء' },
    { href: '/purchases/grn',       label: 'استلام البضاعة' },
    { href: '/purchases/invoices',  label: 'فواتير الموردين' },
    { href: '/purchases/suppliers', label: 'الموردون' },
  ],
  finance: [
    { href: '/finance/journal-entries',  label: 'القيود اليومية' },
    { href: '/finance/trial-balance',    label: 'ميزان المراجعة' },
    { href: '/finance/income-statement', label: 'قائمة الدخل' },
    { href: '/finance/balance-sheet',    label: 'المركز المالي' },
    { href: '/finance/cash-flow',        label: 'التدفقات النقدية' },
    { href: '/finance/equity',           label: 'حقوق الملكية' },
    { href: '/finance/banks',            label: 'الحسابات البنكية' },
    { href: '/finance/periods',          label: 'الفترات المحاسبية' },
  ],
  assets: [
    { href: '/assets',         label: 'قائمة الأصول' },
    { href: '/assets/new',     label: 'أصل جديد' },
  ],
  hr: [
    { href: '/hr/employees',   label: 'الموظفون' },
    { href: '/hr/payroll',     label: 'الرواتب' },
    { href: '/hr/leaves',      label: 'الإجازات' },
    { href: '/hr/attendance',  label: 'الحضور' },
  ],
  jobs: [
    { href: '/job-orders',     label: 'طلبات التصنيع' },
    { href: '/job-orders/new', label: 'طلب جديد' },
  ],
  crm: [
    { href: '/crm/leads',      label: 'العملاء المحتملون' },
    { href: '/crm/leads/new',  label: 'عميل محتمل جديد' },
  ],
  marketing: [
    { href: '/marketing/promotions', label: 'العروض الترويجية' },
    { href: '/marketing/campaigns',  label: 'الحملات' },
  ],
  reports: [
    { href: '/reports', label: 'كل التقارير' },
  ],
  settings: [
    { href: '/settings',          label: 'إعدادات عامة' },
    { href: '/settings/users',    label: 'المستخدمون' },
    { href: '/settings/branches', label: 'الفروع' },
    { href: '/settings/roles',    label: 'الأدوار والصلاحيات' },
  ],
  delivery: [
    { href: '/delivery',              label: 'لوحة التوصيل' },
    { href: '/delivery/dispatches',   label: 'الإرساليات' },
    { href: '/delivery/companies',    label: 'الشركات' },
    { href: '/delivery/zones',        label: 'المناطق والأسعار' },
    { href: '/delivery/settlements',  label: 'تسويات COD' },
  ],
};

/** Module → its main URL (used by activity bar tile) */
export const MODULE_HREFS: Record<ModuleKey, string> = {
  sales:     '/sales/invoices',
  pos:       '/pos/shifts',
  inventory: '/inventory/stock',
  purchases: '/purchases/orders',
  finance:   '/finance/journal-entries',
  assets:    '/assets',
  hr:        '/hr/employees',
  jobs:      '/job-orders',
  crm:       '/crm/leads',
  marketing: '/marketing/promotions',
  reports:   '/reports',
  settings:  '/settings',
  delivery:  '/delivery',
};
