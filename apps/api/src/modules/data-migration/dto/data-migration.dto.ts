import { z } from 'zod';

export const IMPORTABLE_ENTITY_TYPES = [
  'product_category',
  'unit_of_measure',
  'product_template',
  'product_variant',
  'warehouse',
  'customer',
  'supplier',
  'chart_of_accounts',
  'opening_stock',
  'opening_balance',
  'price_list',
  'employee',
  'department',
  'reorder_point',
  'supplier_price',
] as const;

export type ImportableEntityType = (typeof IMPORTABLE_ENTITY_TYPES)[number];

export const ENTITY_DEPENDENCIES: Record<ImportableEntityType, ImportableEntityType[]> = {
  product_category:  [],
  unit_of_measure:   [],
  department:        [],
  product_template:  ['product_category', 'unit_of_measure'],
  product_variant:   ['product_template'],
  warehouse:         [],
  customer:          [],
  supplier:          [],
  chart_of_accounts: [],
  opening_stock:     ['product_variant', 'warehouse'],
  opening_balance:   ['chart_of_accounts'],
  price_list:        ['product_variant'],
  employee:          ['department'],
  reorder_point:     ['product_variant', 'warehouse'],
  supplier_price:    ['supplier', 'product_variant'],
};

export const ENTITY_LABELS: Record<ImportableEntityType, { ar: string; en: string }> = {
  product_category:  { ar: 'فئات المنتجات', en: 'Product Categories' },
  unit_of_measure:   { ar: 'وحدات القياس', en: 'Units of Measure' },
  product_template:  { ar: 'المنتجات', en: 'Products' },
  product_variant:   { ar: 'متغيرات المنتج', en: 'Product Variants' },
  warehouse:         { ar: 'المستودعات', en: 'Warehouses' },
  customer:          { ar: 'العملاء', en: 'Customers' },
  supplier:          { ar: 'الموردين', en: 'Suppliers' },
  chart_of_accounts: { ar: 'شجرة الحسابات', en: 'Chart of Accounts' },
  opening_stock:     { ar: 'الأرصدة الافتتاحية (مخزون)', en: 'Opening Stock' },
  opening_balance:   { ar: 'الأرصدة الافتتاحية (مالية)', en: 'Opening Balances' },
  price_list:        { ar: 'قوائم الأسعار', en: 'Price Lists' },
  employee:          { ar: 'الموظفين', en: 'Employees' },
  department:        { ar: 'الأقسام', en: 'Departments' },
  reorder_point:     { ar: 'نقاط إعادة الطلب', en: 'Reorder Points' },
  supplier_price:    { ar: 'أسعار الموردين', en: 'Supplier Prices' },
};

const entityTypeSchema = z.enum(IMPORTABLE_ENTITY_TYPES);

export const createImportSessionSchema = z.object({
  entityType: entityTypeSchema,
});

export const selectSheetSchema = z.object({
  sheetName: z.string().min(1),
});

export const confirmMappingSchema = z.object({
  mapping: z.record(z.string(), z.string()),
  options: z
    .object({
      duplicateStrategy: z.enum(['skip', 'update', 'create_new']).default('skip'),
      dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'auto']).default('auto'),
      defaultCurrency: z.string().default('IQD'),
    })
    .optional(),
});

export const listSessionsQuerySchema = z.object({
  status: z.string().optional(),
  entityType: entityTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateImportSessionDto = z.infer<typeof createImportSessionSchema>;
export type SelectSheetDto = z.infer<typeof selectSheetSchema>;
export type ConfirmMappingDto = z.infer<typeof confirmMappingSchema>;
export type ListSessionsQueryDto = z.infer<typeof listSessionsQuerySchema>;
