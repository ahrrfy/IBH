import type { ImportableEntityType } from '../dto/data-migration.dto';

export interface FieldDefinition {
  field: string;
  labelAr: string;
  labelEn: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'phone';
  synonyms: string[];
  example: string;
  referenceEntity?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Source of Truth — drives auto-mapper + validation + dynamic templates
// All field names below match the actual Prisma schema (verified 2026-04-30)
// ─────────────────────────────────────────────────────────────────────────────

export const ENTITY_FIELD_REGISTRY: Record<ImportableEntityType, FieldDefinition[]> = {
  // ProductCategory: nameAr is unique identifier (no `code` column)
  product_category: [
    { field: 'nameAr', labelAr: 'اسم الفئة (عربي)', labelEn: 'Category Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'category_name', 'code'], example: 'إلكترونيات' },
    { field: 'nameEn', labelAr: 'اسم الفئة (إنجليزي)', labelEn: 'Category Name (EN)', required: false, type: 'string', synonyms: ['name_en', 'english_name'], example: 'Electronics' },
    { field: 'parentNameAr', labelAr: 'اسم الفئة الأب', labelEn: 'Parent Category Name', required: false, type: 'string', synonyms: ['parent', 'parent_category', 'الأب'], example: 'الكل', referenceEntity: 'product_category' },
    { field: 'sortOrder', labelAr: 'ترتيب العرض', labelEn: 'Sort Order', required: false, type: 'number', synonyms: ['order', 'sort', 'ترتيب'], example: '0' },
  ],

  // UnitOfMeasure: abbreviation is unique (no `code`); no `category` column on table
  unit_of_measure: [
    { field: 'abbreviation', labelAr: 'الرمز المختصر', labelEn: 'Abbreviation', required: true, type: 'string', synonyms: ['abbr', 'code', 'symbol', 'رمز'], example: 'PCS' },
    { field: 'nameAr', labelAr: 'اسم الوحدة (عربي)', labelEn: 'UoM Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'قطعة' },
    { field: 'nameEn', labelAr: 'اسم الوحدة (إنجليزي)', labelEn: 'UoM Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Piece' },
    { field: 'isBaseUnit', labelAr: 'وحدة أساسية', labelEn: 'Is Base Unit', required: false, type: 'boolean', synonyms: ['base_unit', 'base'], example: 'true' },
  ],

  // ProductTemplate: defaultSalePriceIqd / defaultPurchasePriceIqd / minSalePriceIqd are required Decimal
  // 3 unit fields: baseUnitId, saleUnitId, purchaseUnitId — we accept ONE `uomAbbr` and use it for all 3
  product_template: [
    { field: 'sku', labelAr: 'رمز المنتج (SKU)', labelEn: 'SKU', required: true, type: 'string', synonyms: ['product_code', 'code', 'رمز', 'كود'], example: 'SAM-A54' },
    { field: 'nameAr', labelAr: 'اسم المنتج (عربي)', labelEn: 'Product Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'product_name'], example: 'هاتف سامسونج A54' },
    { field: 'nameEn', labelAr: 'اسم المنتج (إنجليزي)', labelEn: 'Product Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Samsung A54 Phone' },
    { field: 'categoryNameAr', labelAr: 'اسم الفئة', labelEn: 'Category Name', required: true, type: 'string', synonyms: ['category', 'فئة', 'الفئة'], example: 'إلكترونيات', referenceEntity: 'product_category' },
    { field: 'uomAbbreviation', labelAr: 'رمز وحدة القياس', labelEn: 'UoM Abbreviation', required: true, type: 'string', synonyms: ['uom', 'unit', 'وحدة'], example: 'PCS', referenceEntity: 'unit_of_measure' },
    { field: 'type', labelAr: 'نوع المنتج', labelEn: 'Product Type', required: false, type: 'string', synonyms: ['product_type'], example: 'storable' },
    { field: 'defaultSalePriceIqd', labelAr: 'سعر البيع (IQD)', labelEn: 'Sale Price (IQD)', required: true, type: 'number', synonyms: ['price', 'sale_price', 'salePrice', 'سعر'], example: '500000' },
    { field: 'defaultPurchasePriceIqd', labelAr: 'سعر التكلفة (IQD)', labelEn: 'Cost Price (IQD)', required: true, type: 'number', synonyms: ['cost', 'cost_price', 'costPrice', 'تكلفة'], example: '400000' },
    { field: 'minSalePriceIqd', labelAr: 'أدنى سعر بيع', labelEn: 'Min Sale Price', required: true, type: 'number', synonyms: ['min_price', 'floor_price'], example: '450000' },
    { field: 'description', labelAr: 'الوصف', labelEn: 'Description', required: false, type: 'string', synonyms: ['desc', 'وصف'], example: 'هاتف ذكي' },
  ],

  // ProductVariant: NO direct salePrice/costPrice columns
  product_variant: [
    { field: 'sku', labelAr: 'رمز المتغير (SKU)', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['variant_code', 'code', 'رمز', 'باركود'], example: 'SAM-A54-BLK' },
    { field: 'templateSku', labelAr: 'رمز المنتج الأب', labelEn: 'Product SKU', required: true, type: 'string', synonyms: ['product_sku', 'parent_sku', 'المنتج'], example: 'SAM-A54', referenceEntity: 'product_template' },
    { field: 'attributes', labelAr: 'الخصائص (مثلاً: اللون=أسود;الحجم=كبير)', labelEn: 'Attributes (e.g. Color=Black;Size=L)', required: false, type: 'string', synonyms: ['attrs', 'options', 'خصائص'], example: 'اللون=أسود' },
    { field: 'barcode', labelAr: 'الباركود', labelEn: 'Barcode', required: false, type: 'string', synonyms: ['ean', 'upc', 'باركود'], example: '6291234567890' },
    { field: 'weight', labelAr: 'الوزن (كغ)', labelEn: 'Weight (kg)', required: false, type: 'number', synonyms: ['وزن'], example: '0.2' },
    { field: 'volume', labelAr: 'الحجم (لتر)', labelEn: 'Volume (L)', required: false, type: 'number', synonyms: ['حجم'], example: '0.001' },
  ],

  // Warehouse: code is required; branchId is required FK
  warehouse: [
    { field: 'code', labelAr: 'رمز المستودع', labelEn: 'Warehouse Code', required: true, type: 'string', synonyms: ['warehouse_code', 'رمز', 'كود'], example: 'WH-01' },
    { field: 'nameAr', labelAr: 'اسم المستودع (عربي)', labelEn: 'Warehouse Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'مستودع'], example: 'المستودع الرئيسي' },
    { field: 'nameEn', labelAr: 'اسم المستودع (إنجليزي)', labelEn: 'Warehouse Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Main Warehouse' },
    { field: 'type', labelAr: 'نوع المستودع', labelEn: 'Warehouse Type', required: false, type: 'string', synonyms: ['warehouse_type'], example: 'main' },
    { field: 'address', labelAr: 'العنوان', labelEn: 'Address', required: false, type: 'string', synonyms: ['location', 'عنوان'], example: 'بغداد - الكرادة' },
    { field: 'isDefault', labelAr: 'مستودع افتراضي', labelEn: 'Is Default', required: false, type: 'boolean', synonyms: ['default', 'افتراضي'], example: 'false' },
  ],

  customer: [
    { field: 'code', labelAr: 'رمز العميل', labelEn: 'Customer Code', required: true, type: 'string', synonyms: ['customer_code', 'رمز', 'كود'], example: 'CUST-001' },
    { field: 'nameAr', labelAr: 'اسم العميل (عربي)', labelEn: 'Customer Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'customer_name'], example: 'أحمد محمد' },
    { field: 'nameEn', labelAr: 'اسم العميل (إنجليزي)', labelEn: 'Customer Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Ahmed Mohammed' },
    { field: 'type', labelAr: 'نوع العميل', labelEn: 'Customer Type', required: false, type: 'string', synonyms: ['customer_type', 'نوع'], example: 'regular' },
    { field: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', required: false, type: 'phone', synonyms: ['mobile', 'هاتف', 'موبايل'], example: '07701234567' },
    { field: 'whatsapp', labelAr: 'واتساب', labelEn: 'WhatsApp', required: false, type: 'phone', synonyms: ['wa'], example: '07701234567' },
    { field: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', required: false, type: 'email', synonyms: ['بريد', 'ايميل'], example: 'ahmed@example.com' },
    { field: 'address', labelAr: 'العنوان', labelEn: 'Address', required: false, type: 'string', synonyms: ['عنوان'], example: 'بغداد - المنصور' },
    { field: 'city', labelAr: 'المدينة', labelEn: 'City', required: false, type: 'string', synonyms: ['مدينة'], example: 'بغداد' },
    { field: 'creditLimitIqd', labelAr: 'حد الائتمان (IQD)', labelEn: 'Credit Limit (IQD)', required: false, type: 'number', synonyms: ['credit_limit', 'credit'], example: '5000000' },
    { field: 'taxNumber', labelAr: 'الرقم الضريبي', labelEn: 'Tax Number', required: false, type: 'string', synonyms: ['tax_id', 'vat_number'], example: '1234567890' },
  ],

  supplier: [
    { field: 'code', labelAr: 'رمز المورد', labelEn: 'Supplier Code', required: true, type: 'string', synonyms: ['supplier_code', 'رمز', 'كود'], example: 'SUP-001' },
    { field: 'nameAr', labelAr: 'اسم المورد (عربي)', labelEn: 'Supplier Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'supplier_name'], example: 'شركة التوريدات' },
    { field: 'nameEn', labelAr: 'اسم المورد (إنجليزي)', labelEn: 'Supplier Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'General Supplies' },
    { field: 'type', labelAr: 'نوع المورد', labelEn: 'Supplier Type', required: false, type: 'string', synonyms: ['supplier_type'], example: 'local' },
    { field: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', required: false, type: 'phone', synonyms: ['mobile', 'هاتف'], example: '07801234567' },
    { field: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', required: false, type: 'email', synonyms: ['بريد'], example: 'info@supplier.com' },
    { field: 'address', labelAr: 'العنوان', labelEn: 'Address', required: false, type: 'string', synonyms: ['عنوان'], example: 'بغداد' },
    { field: 'paymentTermsDays', labelAr: 'مدة الدفع (أيام)', labelEn: 'Payment Terms (Days)', required: false, type: 'number', synonyms: ['payment_terms', 'paymentTermDays'], example: '30' },
    { field: 'taxNumber', labelAr: 'الرقم الضريبي', labelEn: 'Tax Number', required: false, type: 'string', synonyms: ['tax_id'], example: '9876543210' },
    { field: 'creditLimitIqd', labelAr: 'حد الائتمان (IQD)', labelEn: 'Credit Limit (IQD)', required: false, type: 'number', synonyms: ['credit_limit'], example: '50000000' },
  ],

  // ChartOfAccount: category (AccountCategory enum) AND accountType (AccountType: debit_normal/credit_normal)
  chart_of_accounts: [
    { field: 'code', labelAr: 'رمز الحساب', labelEn: 'Account Code', required: true, type: 'string', synonyms: ['account_code', 'رمز'], example: '1101' },
    { field: 'nameAr', labelAr: 'اسم الحساب (عربي)', labelEn: 'Account Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'الصندوق' },
    { field: 'nameEn', labelAr: 'اسم الحساب (إنجليزي)', labelEn: 'Account Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Cash' },
    { field: 'category', labelAr: 'فئة الحساب', labelEn: 'Account Category', required: true, type: 'string', synonyms: ['account_category'], example: 'current_assets' },
    { field: 'accountType', labelAr: 'طبيعة الحساب', labelEn: 'Account Nature', required: true, type: 'string', synonyms: ['type', 'normal_balance'], example: 'debit_normal' },
    { field: 'parentCode', labelAr: 'رمز الحساب الأب', labelEn: 'Parent Account Code', required: false, type: 'string', synonyms: ['parent'], example: '11', referenceEntity: 'chart_of_accounts' },
    { field: 'isHeader', labelAr: 'حساب رئيسي', labelEn: 'Is Header', required: false, type: 'boolean', synonyms: ['header'], example: 'false' },
    { field: 'allowDirectPosting', labelAr: 'يسمح بالترحيل المباشر', labelEn: 'Allow Direct Posting', required: false, type: 'boolean', synonyms: ['postable', 'isPostable'], example: 'true' },
    { field: 'currency', labelAr: 'العملة', labelEn: 'Currency', required: false, type: 'string', synonyms: ['عملة'], example: 'IQD' },
  ],

  opening_stock: [
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product_code'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'warehouseCode', labelAr: 'رمز المستودع', labelEn: 'Warehouse Code', required: true, type: 'string', synonyms: ['warehouse', 'مستودع'], example: 'WH-01', referenceEntity: 'warehouse' },
    { field: 'qty', labelAr: 'الكمية', labelEn: 'Quantity', required: true, type: 'number', synonyms: ['quantity', 'كمية'], example: '100' },
    { field: 'unitCostIqd', labelAr: 'تكلفة الوحدة (IQD)', labelEn: 'Unit Cost (IQD)', required: true, type: 'number', synonyms: ['cost', 'unit_cost', 'تكلفة'], example: '400000' },
  ],

  opening_balance: [
    { field: 'accountCode', labelAr: 'رمز الحساب', labelEn: 'Account Code', required: true, type: 'string', synonyms: ['account', 'رمز'], example: '1101', referenceEntity: 'chart_of_accounts' },
    { field: 'debit', labelAr: 'مدين', labelEn: 'Debit', required: false, type: 'number', synonyms: ['debit_amount', 'مدين'], example: '5000000' },
    { field: 'credit', labelAr: 'دائن', labelEn: 'Credit', required: false, type: 'number', synonyms: ['credit_amount', 'دائن'], example: '0' },
    { field: 'description', labelAr: 'البيان', labelEn: 'Description', required: false, type: 'string', synonyms: ['memo', 'note', 'بيان'], example: 'رصيد افتتاحي' },
  ],

  // PriceListItem: priceIqd (not price), effectiveFrom required, NO minQty
  price_list: [
    { field: 'listNameAr', labelAr: 'اسم القائمة', labelEn: 'Price List Name', required: true, type: 'string', synonyms: ['name', 'اسم', 'listName'], example: 'أسعار الجملة' },
    { field: 'listType', labelAr: 'نوع القائمة', labelEn: 'List Type', required: false, type: 'string', synonyms: ['type'], example: 'wholesale' },
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'priceIqd', labelAr: 'السعر (IQD)', labelEn: 'Price (IQD)', required: true, type: 'number', synonyms: ['amount', 'price', 'سعر'], example: '480000' },
    { field: 'effectiveFrom', labelAr: 'يبدأ من تاريخ', labelEn: 'Effective From', required: false, type: 'date', synonyms: ['from', 'start'], example: '01/01/2026' },
    { field: 'effectiveTo', labelAr: 'ينتهي بتاريخ', labelEn: 'Effective To', required: false, type: 'date', synonyms: ['to', 'end'], example: '31/12/2026' },
  ],

  // Employee: branchId required, hireDate required, baseSalaryIqd required, employeeNumber required
  employee: [
    { field: 'employeeNumber', labelAr: 'الرقم الوظيفي', labelEn: 'Employee Number', required: true, type: 'string', synonyms: ['employee_code', 'code', 'رمز'], example: 'EMP-001' },
    { field: 'nameAr', labelAr: 'اسم الموظف (عربي)', labelEn: 'Employee Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'علي حسن' },
    { field: 'nameEn', labelAr: 'اسم الموظف (إنجليزي)', labelEn: 'Employee Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Ali Hassan' },
    { field: 'nationalId', labelAr: 'رقم الهوية', labelEn: 'National ID', required: false, type: 'string', synonyms: ['id_number', 'هوية'], example: '1234567' },
    { field: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', required: false, type: 'phone', synonyms: ['mobile', 'هاتف'], example: '07901234567' },
    { field: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', required: false, type: 'email', synonyms: ['بريد'], example: 'ali@company.com' },
    { field: 'departmentCode', labelAr: 'رمز القسم', labelEn: 'Department Code', required: false, type: 'string', synonyms: ['department', 'قسم'], example: 'SALES', referenceEntity: 'department' },
    { field: 'positionTitle', labelAr: 'المسمى الوظيفي', labelEn: 'Position Title', required: false, type: 'string', synonyms: ['title', 'jobTitle', 'وظيفة'], example: 'مندوب مبيعات' },
    { field: 'hireDate', labelAr: 'تاريخ التعيين', labelEn: 'Hire Date', required: true, type: 'date', synonyms: ['start_date', 'join_date'], example: '01/01/2024' },
    { field: 'baseSalaryIqd', labelAr: 'الراتب الأساسي (IQD)', labelEn: 'Base Salary (IQD)', required: true, type: 'number', synonyms: ['salary', 'راتب'], example: '750000' },
  ],

  department: [
    { field: 'code', labelAr: 'رمز القسم', labelEn: 'Department Code', required: true, type: 'string', synonyms: ['department_code', 'رمز'], example: 'SALES' },
    { field: 'nameAr', labelAr: 'اسم القسم (عربي)', labelEn: 'Department Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'قسم المبيعات' },
    { field: 'nameEn', labelAr: 'اسم القسم (إنجليزي)', labelEn: 'Department Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Sales Department' },
    { field: 'parentCode', labelAr: 'رمز القسم الأب', labelEn: 'Parent Department Code', required: false, type: 'string', synonyms: ['parent'], example: '', referenceEntity: 'department' },
  ],

  // ReorderPoint: reorderQty + reorderAmount + safetyStock + leadTimeDays. NO maxQty/minQty.
  reorder_point: [
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'warehouseCode', labelAr: 'رمز المستودع', labelEn: 'Warehouse Code', required: true, type: 'string', synonyms: ['warehouse'], example: 'WH-01', referenceEntity: 'warehouse' },
    { field: 'reorderQty', labelAr: 'كمية إعادة الطلب', labelEn: 'Reorder Quantity', required: true, type: 'number', synonyms: ['reorder', 'quantity'], example: '50' },
    { field: 'reorderAmount', labelAr: 'مبلغ إعادة الطلب', labelEn: 'Reorder Amount (IQD)', required: true, type: 'number', synonyms: ['amount', 'reorder_amount'], example: '20000000' },
    { field: 'safetyStock', labelAr: 'مخزون الأمان', labelEn: 'Safety Stock', required: false, type: 'number', synonyms: ['safety'], example: '10' },
    { field: 'leadTimeDays', labelAr: 'مدة التوريد (أيام)', labelEn: 'Lead Time (Days)', required: false, type: 'number', synonyms: ['lead_time'], example: '7' },
  ],

  // SupplierPrice: priceIqd, currency, minQty (Decimal default 1), leadTimeDays (Int default 7)
  supplier_price: [
    { field: 'supplierCode', labelAr: 'رمز المورد', labelEn: 'Supplier Code', required: true, type: 'string', synonyms: ['supplier', 'مورد'], example: 'SUP-001', referenceEntity: 'supplier' },
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'priceIqd', labelAr: 'السعر (IQD)', labelEn: 'Price (IQD)', required: true, type: 'number', synonyms: ['price', 'cost'], example: '380000' },
    { field: 'currency', labelAr: 'العملة', labelEn: 'Currency', required: false, type: 'string', synonyms: ['عملة'], example: 'IQD' },
    { field: 'leadTimeDays', labelAr: 'مدة التوريد (أيام)', labelEn: 'Lead Time (Days)', required: false, type: 'number', synonyms: ['lead_time'], example: '7' },
    { field: 'minQty', labelAr: 'أقل كمية طلب', labelEn: 'Min Order Qty', required: false, type: 'number', synonyms: ['moq', 'min_order'], example: '1' },
    { field: 'isPreferred', labelAr: 'مفضّل', labelEn: 'Is Preferred', required: false, type: 'boolean', synonyms: ['preferred'], example: 'false' },
  ],
};
