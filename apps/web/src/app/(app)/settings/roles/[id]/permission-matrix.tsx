'use client';

export type PermissionMap = Record<string, number>;

export const PERMISSION_BITS = {
  Create:  1,
  Read:    2,
  Update:  4,
  Delete:  8,
  Submit:  16,
  Approve: 32,
  Print:   64,
} as const;

export const ACTION_LABELS_AR: Record<keyof typeof PERMISSION_BITS, string> = {
  Create:  'إنشاء',
  Read:    'قراءة',
  Update:  'تعديل',
  Delete:  'حذف',
  Submit:  'إرسال',
  Approve: 'اعتماد',
  Print:   'طباعة',
};

type ResourceGroup = { titleAr: string; resources: { key: string; labelAr: string }[] };

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    titleAr: 'إعدادات النظام',
    resources: [
      { key: 'Company',  labelAr: 'الشركة' },
      { key: 'Branch',   labelAr: 'الفروع' },
      { key: 'User',     labelAr: 'المستخدمون' },
      { key: 'Role',     labelAr: 'الأدوار' },
    ],
  },
  {
    titleAr: 'المخزون والمنتجات',
    resources: [
      { key: 'Product',   labelAr: 'المنتجات' },
      { key: 'PriceList', labelAr: 'قوائم الأسعار' },
      { key: 'Inventory', labelAr: 'حركات المخزون' },
    ],
  },
  {
    titleAr: 'المبيعات',
    resources: [
      { key: 'Customer', labelAr: 'العملاء' },
      { key: 'Invoice',  labelAr: 'فواتير المبيعات' },
    ],
  },
  {
    titleAr: 'المشتريات',
    resources: [
      { key: 'Supplier', labelAr: 'الموردون' },
      { key: 'GRN',      labelAr: 'إيصالات الاستلام' },
    ],
  },
  {
    titleAr: 'المالية',
    resources: [
      { key: 'GL',          labelAr: 'دليل الحسابات' },
      { key: 'BankAccount', labelAr: 'الحسابات البنكية' },
      { key: 'Period',      labelAr: 'الفترات المحاسبية' },
      { key: 'FixedAsset',  labelAr: 'الأصول الثابتة' },
    ],
  },
  {
    titleAr: 'الموارد البشرية',
    resources: [
      { key: 'Employee',   labelAr: 'الموظفون' },
      { key: 'PayrollRun', labelAr: 'دورات الرواتب' },
    ],
  },
];

export function PermissionMatrix({
  value,
  onChange,
  disabled,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  disabled?: boolean;
}) {
  const allActions = Object.keys(PERMISSION_BITS) as (keyof typeof PERMISSION_BITS)[];

  function toggle(resource: string, bit: number) {
    if (disabled) return;
    const current = value[resource] ?? 0;
    const next = (current & bit) === bit ? current & ~bit : current | bit;
    const out = { ...value };
    if (next === 0) delete out[resource];
    else out[resource] = next;
    onChange(out);
  }

  function setRow(resource: string, mask: number) {
    if (disabled) return;
    const out = { ...value };
    if (mask === 0) delete out[resource];
    else out[resource] = mask;
    onChange(out);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-right px-4 py-2 font-medium text-slate-600 sticky right-0 bg-slate-50 z-10 min-w-[180px]">
                المورد
              </th>
              {allActions.map((a) => (
                <th key={a} className="px-3 py-2 font-medium text-slate-600 text-center min-w-[72px]">
                  {ACTION_LABELS_AR[a]}
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-slate-600 text-center min-w-[80px]">
                الكل
              </th>
            </tr>
          </thead>
          <tbody>
            {RESOURCE_GROUPS.map((group) => (
              <RowGroup
                key={group.titleAr}
                group={group}
                value={value}
                disabled={disabled}
                onToggle={toggle}
                onSetRow={setRow}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 num-latin font-mono">
        bitmask: C=1 · R=2 · U=4 · D=8 · S=16 · A=32 · P=64
      </div>
    </div>
  );
}

function RowGroup({
  group,
  value,
  disabled,
  onToggle,
  onSetRow,
}: {
  group: ResourceGroup;
  value: PermissionMap;
  disabled?: boolean;
  onToggle: (resource: string, bit: number) => void;
  onSetRow: (resource: string, mask: number) => void;
}) {
  const allActions = Object.keys(PERMISSION_BITS) as (keyof typeof PERMISSION_BITS)[];
  const ALL_MASK = allActions.reduce((a, k) => a | PERMISSION_BITS[k], 0);

  return (
    <>
      <tr className="bg-slate-100/60">
        <td colSpan={allActions.length + 2} className="px-4 py-1.5 text-[11px] font-semibold text-slate-700">
          {group.titleAr}
        </td>
      </tr>
      {group.resources.map((res) => {
        const mask = value[res.key] ?? 0;
        const allOn = mask === ALL_MASK;
        return (
          <tr key={res.key} className="border-t border-slate-100 hover:bg-slate-50/40">
            <td className="px-4 py-2 sticky right-0 bg-white z-10">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">{res.labelAr}</span>
                <span className="text-[10px] text-slate-400 font-mono num-latin">{res.key}</span>
              </div>
            </td>
            {allActions.map((a) => {
              const bit = PERMISSION_BITS[a];
              const on = (mask & bit) === bit;
              return (
                <td key={a} className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() => onToggle(res.key, bit)}
                    className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                  />
                </td>
              );
            })}
            <td className="px-3 py-2 text-center">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSetRow(res.key, allOn ? 0 : ALL_MASK)}
                className="text-[11px] text-sky-700 hover:underline disabled:text-slate-400 disabled:no-underline"
              >
                {allOn ? 'إلغاء الكل' : 'الكل'}
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}
