'use client';

/**
 * Sub-sidebar — module-level section navigation (224px).
 * Auto-detects current module from pathname and shows its sections.
 * Hidden on /dashboard (which is the launcher home).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ModuleKey, MODULE_SECTIONS } from '@/lib/permissions';
import { FeatureGate } from '@/components/license/feature-gate';

/**
 * T65 — Map specific sub-sidebar entries to a licensing feature code.
 * Keyed by the section `href`. Entries not in this map are always shown
 * (subject to RBAC). Extend by adding more `href -> featureCode` entries.
 */
const SECTION_FEATURE_GATE: Record<string, string> = {
  '/inventory/intelligence': 'ai.tier3',
};

const MODULE_PREFIX_MAP: Array<[string, ModuleKey, string]> = [
  ['/sales',                  'sales',     'المبيعات'],
  ['/pos',                    'pos',       'نقطة البيع'],
  ['/inventory',              'inventory', 'المخزون'],
  ['/purchases',              'purchases', 'المشتريات'],
  ['/finance',                'finance',   'المالية'],
  ['/assets',                 'assets',    'الأصول الثابتة'],
  ['/hr',                     'hr',        'الموارد البشرية'],
  ['/job-orders',             'jobs',      'طلبات التصنيع'],
  ['/crm',                    'crm',       'العملاء'],
  ['/marketing',              'marketing', 'التسويق'],
  ['/reports',                'reports',   'التقارير'],
  ['/settings',               'settings',  'الإعدادات'],
];

export function SubSidebar() {
  const pathname = usePathname() || '';

  // Hide on dashboard home — the launcher IS the navigation there
  if (pathname === '/dashboard' || pathname === '/') return null;

  const match = MODULE_PREFIX_MAP.find(([prefix]) => pathname.startsWith(prefix));
  if (!match) return null;

  const [, moduleKey, moduleLabel] = match;
  const sections = MODULE_SECTIONS[moduleKey] ?? [];

  return (
    <aside className="w-56 bg-white border-l border-slate-200 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="text-xs uppercase text-slate-500 font-semibold mb-1">{moduleLabel}</div>
        <div className="text-sm text-slate-900 font-bold">القوائم</div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 text-sm">
        {sections.map((s) => {
          const active = pathname === s.href || pathname.startsWith(s.href + '/');
          const link = (
            <Link
              key={s.href}
              href={s.href}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-sm transition
                ${active
                  ? 'bg-sky-50 text-sky-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <span>{s.label}</span>
              {s.count !== undefined && (
                <span className={`text-[10px] px-1.5 rounded num-latin font-mono
                  ${active ? 'bg-sky-200 text-sky-800' : 'bg-slate-100 text-slate-500'}`}>
                  {s.count}
                </span>
              )}
            </Link>
          );
          // T65 — wrap in FeatureGate when this section requires a licensed feature.
          const requiredFeature = SECTION_FEATURE_GATE[s.href];
          if (requiredFeature) {
            return (
              <FeatureGate key={s.href} code={requiredFeature} mode="hide">
                {link}
              </FeatureGate>
            );
          }
          return link;
        })}
      </nav>
    </aside>
  );
}
