'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ChevronDown, ChevronLeft, BookOpen, Plus, Pencil } from 'lucide-react';

type Account = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  category: string;
  accountType: string;
  parentId: string | null;
  isHeader: boolean;
  isActive: boolean;
  allowDirectPosting: boolean;
};

const CATEGORY_LABELS_AR: Record<string, string> = {
  fixed_assets:    'أصول ثابتة',
  current_assets:  'أصول متداولة',
  liabilities:     'الخصوم',
  equity:          'حقوق الملكية',
  revenue:         'الإيرادات',
  expense:         'المصروفات',
};

export default function ChartOfAccountsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => api<Account[]>('/finance/gl/accounts'),
  });

  const accounts = data ?? [];

  const tree = useMemo(() => buildTree(accounts), [accounts]);

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-sky-700" />
            دليل الحسابات
          </h1>
          <p className="text-sm text-slate-500 mt-1">{accounts.length} حساب</p>
        </div>
        <Link href="/finance/chart-of-accounts/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          حساب جديد
        </Link>
      </header>

      {isLoading && <div className="text-sm text-slate-500">جاري التحميل…</div>}
      {error && <div className="text-sm text-rose-600">تعذَّر تحميل الدليل</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {tree.map((node) => (
          <TreeNode key={node.account.id} node={node} depth={0} />
        ))}
        {tree.length === 0 && !isLoading && (
          <div className="p-8 text-center text-sm text-slate-400">لا توجد حسابات</div>
        )}
      </div>
    </div>
  );
}

type Node = { account: Account; children: Node[] };

function buildTree(accounts: Account[]): Node[] {
  const byId = new Map<string, Node>();
  accounts.forEach((a) => byId.set(a.id, { account: a, children: [] }));
  const roots: Node[] = [];
  for (const node of byId.values()) {
    if (node.account.parentId && byId.has(node.account.parentId)) {
      byId.get(node.account.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (n: Node) => {
    n.children.sort((a, b) => a.account.code.localeCompare(b.account.code));
    n.children.forEach(sortRec);
  };
  roots.sort((a, b) => a.account.code.localeCompare(b.account.code));
  roots.forEach(sortRec);
  return roots;
}

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const a = node.account;

  return (
    <>
      <div
        className={[
          'flex items-center gap-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition',
          !a.isActive ? 'opacity-50' : '',
        ].join(' ')}
        style={{ paddingInlineStart: `${depth * 20 + 12}px` }}
      >
        <button
          onClick={() => hasChildren && setExpanded((v) => !v)}
          disabled={!hasChildren}
          className="h-7 w-7 grid place-items-center text-slate-400 disabled:opacity-0"
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
          ) : null}
        </button>
        <span className="font-mono num-latin text-xs text-slate-500 w-16">{a.code}</span>
        <span className={['flex-1 text-sm py-2', a.isHeader ? 'font-semibold text-slate-900' : 'text-slate-700'].join(' ')}>
          {a.nameAr}
          {a.nameEn && <span className="text-slate-400 text-xs mr-2">· {a.nameEn}</span>}
        </span>
        <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-100">
          {CATEGORY_LABELS_AR[a.category] ?? a.category}
        </span>
        {!a.allowDirectPosting && (
          <span className="text-[10px] text-amber-700 px-2 py-0.5 rounded bg-amber-50">
            ترحيل غير مباشر
          </span>
        )}
        <Link
          href={`/finance/chart-of-accounts/${a.id}/edit`}
          className="text-slate-400 hover:text-sky-700 px-2"
          title="تعديل"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </div>
      {expanded && node.children.map((c) => <TreeNode key={c.account.id} node={c} depth={depth + 1} />)}
    </>
  );
}
