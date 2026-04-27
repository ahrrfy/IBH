'use client';

// T41 — Product Category Tree Admin
// ─────────────────────────────────────────────────────────────────────────────
// Renders the company's category hierarchy as a collapsible tree. Backend
// endpoint GET /products/categories/tree returns nodes with children already
// nested + level/path metadata.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChevronDown, ChevronLeft, FolderTree, Loader2 } from 'lucide-react';

interface CategoryNode {
  id: string;
  nameAr: string;
  nameEn: string | null;
  parentId: string | null;
  level: number;
  path: string;
  sortOrder: number;
  isActive: boolean;
  children: CategoryNode[];
}

export default function CategoriesPage() {
  const { data, isLoading, error, refetch } = useQuery<CategoryNode[]>({
    queryKey: ['products', 'categories', 'tree'],
    queryFn: () => api<CategoryNode[]>('/products/categories/tree'),
  });

  const tree = useMemo<CategoryNode[]>(() => data ?? [], [data]);

  return (
    <div className="space-y-5 p-6">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <FolderTree className="h-6 w-6 text-sky-700" />
          شجرة فئات المنتجات
        </h1>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between text-sm text-rose-600">
            <span>خطأ في تحميل الشجرة</span>
            <button className="btn-ghost" onClick={() => refetch()}>إعادة المحاولة</button>
          </div>
        )}
        {!isLoading && !error && tree.length === 0 && (
          <div className="text-sm text-slate-500">لا توجد فئات بعد.</div>
        )}
        {!isLoading && !error && tree.length > 0 && (
          <ul className="space-y-1">
            {tree.map((n) => <TreeNode key={n.id} node={n} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function TreeNode({ node }: { node: CategoryNode }) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(node.level <= 1);

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
        style={{ paddingInlineStart: `${node.level * 1.25 + 0.5}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="text-slate-500 hover:text-sky-700"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'طيّ' : 'توسيع'}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}
        <span className={`text-sm ${node.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
          {node.nameAr}
        </span>
        {node.nameEn && <span className="text-xs text-slate-400" dir="ltr">{node.nameEn}</span>}
        {hasChildren && (
          <span className="ms-auto text-xs text-slate-400">{node.children.length}</span>
        )}
      </div>
      {hasChildren && open && (
        <ul className="space-y-1">
          {node.children.map((child) => <TreeNode key={child.id} node={child} />)}
        </ul>
      )}
    </li>
  );
}
