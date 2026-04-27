'use client';

/**
 * POS Sync Conflict Review — I003
 *
 * Manager screen to review and resolve POS offline sync conflicts.
 *
 * A conflict is logged when a POS receipt syncs and:
 *   - The unit price differs from the server price list by more than 5%
 *   - The requested quantity exceeds available server stock at sync time
 *   - The product/variant is marked inactive on the server
 *
 * The receipt is ALWAYS posted (business continuity). This screen lets the
 * manager review the divergence and mark it accepted or rejected.
 *
 * Permissions required: pos.conflict.read (view) + pos.conflict.resolve (resolve)
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Resolution =
  | 'pending_review'
  | 'auto_accepted'
  | 'manager_accepted'
  | 'manager_rejected';

type ConflictType = 'price_mismatch' | 'insufficient_stock' | 'product_inactive';

interface PosConflict {
  id: string;
  companyId: string;
  branchId: string;
  receiptId: string;
  clientUlid: string | null;
  conflictType: ConflictType;
  variantId: string | null;
  posValue: string;
  serverValue: string;
  resolution: Resolution;
  notes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  receipt: {
    number: string;
    totalIqd: string;
    createdAt: string;
  };
}

interface ConflictsResponse {
  items: PosConflict[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  price_mismatch: 'تغيير السعر',
  insufficient_stock: 'نقص المخزون',
  product_inactive: 'منتج غير نشط',
};

const RESOLUTION_LABELS: Record<Resolution, string> = {
  pending_review: 'قيد المراجعة',
  auto_accepted: 'مقبول تلقائياً',
  manager_accepted: 'مقبول من المدير',
  manager_rejected: 'مرفوض من المدير',
};

function ConflictTypeBadge({ type }: { type: ConflictType }) {
  const variant =
    type === 'price_mismatch'
      ? 'warning'
      : type === 'insufficient_stock'
        ? 'destructive'
        : 'secondary';
  return <Badge variant={variant as any}>{CONFLICT_TYPE_LABELS[type]}</Badge>;
}

function ResolutionIcon({ resolution }: { resolution: Resolution }) {
  switch (resolution) {
    case 'pending_review':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'auto_accepted':
      return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
    case 'manager_accepted':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'manager_rejected':
      return <XCircle className="h-4 w-4 text-red-600" />;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ar-IQ', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatIqd(raw: string) {
  const n = Number(raw);
  return isNaN(n) ? raw : `${n.toLocaleString('ar-IQ')} د.ع`;
}

// ── Resolve Dialog ────────────────────────────────────────────────────────────

interface ResolveDialogProps {
  conflict: PosConflict | null;
  onClose: () => void;
  onResolve: (id: string, resolution: 'manager_accepted' | 'manager_rejected', notes: string) => void;
  isLoading: boolean;
}

function ResolveDialog({ conflict, onClose, onResolve, isLoading }: ResolveDialogProps) {
  const [notes, setNotes] = useState('');

  if (!conflict) return null;

  return (
    <Dialog open={!!conflict} onOpenChange={() => onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مراجعة تعارض الفاتورة {conflict.receipt.number}</DialogTitle>
          <DialogDescription>
            نوع التعارض: {CONFLICT_TYPE_LABELS[conflict.conflictType]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4 rounded-md border p-3 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">قيمة الكاشير (POS):</span>
              <p className="mt-1 font-mono">{conflict.posValue}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">قيمة الخادم:</span>
              <p className="mt-1 font-mono">{conflict.serverValue}</p>
            </div>
          </div>

          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mb-1 inline h-4 w-4" /> الفاتورة تم ترحيلها بالفعل.
            قبولك أو رفضك هنا للتوثيق فقط — لا يلغي الفاتورة.
          </div>

          <div className="space-y-1">
            <Label htmlFor="resolve-notes">ملاحظات المدير (اختياري)</Label>
            <Textarea
              id="resolve-notes"
              placeholder="أضف أي ملاحظة للتوضيح..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            إلغاء
          </Button>
          <Button
            variant="destructive"
            onClick={() => onResolve(conflict.id, 'manager_rejected', notes)}
            disabled={isLoading}
          >
            <XCircle className="me-1 h-4 w-4" />
            رفض (يحتاج تصحيح)
          </Button>
          <Button
            onClick={() => onResolve(conflict.id, 'manager_accepted', notes)}
            disabled={isLoading}
          >
            <CheckCircle2 className="me-1 h-4 w-4" />
            قبول
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PosConflictsPage() {
  const queryClient = useQueryClient();
  const [resolutionFilter, setResolutionFilter] = useState<string>('pending_review');
  const [page, setPage] = useState(1);
  const [selectedConflict, setSelectedConflict] = useState<PosConflict | null>(null);

  const { data, isLoading, isError } = useQuery<ConflictsResponse>({
    queryKey: ['pos-conflicts', resolutionFilter, page],
    queryFn: () =>
      apiFetch(
        `/pos/conflicts?resolution=${resolutionFilter}&page=${page}&pageSize=25`,
      ),
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      resolution,
      notes,
    }: {
      id: string;
      resolution: 'manager_accepted' | 'manager_rejected';
      notes: string;
    }) =>
      apiFetch(`/pos/conflicts/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution, notes: notes || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-conflicts'] });
      setSelectedConflict(null);
    },
  });

  const pendingCount = resolutionFilter === 'pending_review' ? (data?.total ?? 0) : undefined;

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">تعارضات المزامنة — POS</h1>
          <p className="text-sm text-muted-foreground">
            فواتير الكاشير المتعارضة مع بيانات الخادم أثناء المزامنة
          </p>
        </div>

        {pendingCount !== undefined && pendingCount > 0 && (
          <Badge variant="destructive" className="text-base">
            {pendingCount} قيد المراجعة
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تصفية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="min-w-max">حالة المراجعة:</Label>
            <Select
              value={resolutionFilter}
              onValueChange={(v) => {
                setResolutionFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">قيد المراجعة</SelectItem>
                <SelectItem value="auto_accepted">مقبول تلقائياً</SelectItem>
                <SelectItem value="manager_accepted">مقبول من المدير</SelectItem>
                <SelectItem value="manager_rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">جاري التحميل...</div>
          ) : isError ? (
            <div className="py-12 text-center text-destructive">فشل تحميل البيانات</div>
          ) : !data?.items.length ? (
            <div className="py-12 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
              لا توجد تعارضات في هذه الفئة
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الفاتورة</TableHead>
                  <TableHead className="text-right">نوع التعارض</TableHead>
                  <TableHead className="text-right">قيمة الكاشير</TableHead>
                  <TableHead className="text-right">قيمة الخادم</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((conflict) => (
                  <TableRow key={conflict.id}>
                    <TableCell>
                      <div className="font-medium">{conflict.receipt.number}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatIqd(conflict.receipt.totalIqd)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ConflictTypeBadge type={conflict.conflictType} />
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate font-mono text-xs">
                      {conflict.posValue}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate font-mono text-xs">
                      {conflict.serverValue}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <ResolutionIcon resolution={conflict.resolution} />
                        <span className="text-xs">
                          {RESOLUTION_LABELS[conflict.resolution]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(conflict.createdAt)}
                    </TableCell>
                    <TableCell>
                      {conflict.resolution === 'pending_review' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedConflict(conflict)}
                        >
                          مراجعة
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            يعرض {(page - 1) * data.pageSize + 1}–
            {Math.min(page * data.pageSize, data.total)} من {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * data.pageSize >= data.total}
            >
              التالي
            </Button>
          </div>
        </div>
      )}

      {/* Resolve Dialog */}
      <ResolveDialog
        conflict={selectedConflict}
        onClose={() => setSelectedConflict(null)}
        onResolve={(id, resolution, notes) =>
          resolveMutation.mutate({ id, resolution, notes })
        }
        isLoading={resolveMutation.isPending}
      />
    </div>
  );
}
