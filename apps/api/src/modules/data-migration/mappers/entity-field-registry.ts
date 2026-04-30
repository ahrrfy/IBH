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

export const ENTITY_FIELD_REGISTRY: Record<ImportableEntityType, FieldDefinition[]> = {
  product_category: [
    { field: 'code', labelAr: 'رمز الفئة', labelEn: 'Category Code', required: true, type: 'string', synonyms: ['category_code', 'رمز', 'كود'], example: 'ELEC' },
    { field: 'nameAr', labelAr: 'اسم الفئة (عربي)', labelEn: 'Category Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'category_name'], example: 'إلكترونيات' },
    { field: 'nameEn', labelAr: 'اسم الفئة (إنجليزي)', labelEn: 'Category Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Electronics' },
    { field: 'parentCode', labelAr: 'رمز الفئة الأب', labelEn: 'Parent Category Code', required: false, type: 'string', synonyms: ['parent', 'parent_category'], example: 'ROOT', referenceEntity: 'product_category' },
    { field: 'description', labelAr: 'الوصف', labelEn: 'Description', required: false, type: 'string', synonyms: ['desc', 'وصف'], example: 'أجهزة إلكترونية' },
  ],

  unit_of_measure: [
    { field: 'code', labelAr: 'رمز الوحدة', labelEn: 'UoM Code', required: true, type: 'string', synonyms: ['uom_code', 'رمز'], example: 'PCS' },
    { field: 'nameAr', labelAr: 'اسم الوحدة (عربي)', labelEn: 'UoM Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'قطعة' },
    { field: 'nameEn', labelAr: 'اسم الوحدة (إنجليزي)', labelEn: 'UoM Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Piece' },
    { field: 'category', labelAr: 'فئة الوحدة', labelEn: 'Category', required: false, type: 'string', synonyms: ['uom_category'], example: 'count' },
    { field: 'baseUomCode', labelAr: 'الوحدة الأساسية', labelEn: 'Base UoM Code', required: false, type: 'string', synonyms: ['base_uom', 'base'], example: 'PCS', referenceEntity: 'unit_of_measure' },
    { field: 'conversionFactor', labelAr: 'معامل التحويل', labelEn: 'Conversion Factor', required: false, type: 'number', synonyms: ['factor', 'conversion'], example: '12' },
  ],

  product_template: [
    { field: 'sku', labelAr: 'رمز المنتج', labelEn: 'SKU', required: true, type: 'string', synonyms: ['product_code', 'code', 'رمز'], example: 'SAM-A54' },
    { field: 'nameAr', labelAr: 'اسم المنتج (عربي)', labelEn: 'Product Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'product_name'], example: 'هاتف سامسونج A54' },
    { field: 'nameEn', labelAr: 'اسم المنتج (إنجليزي)', labelEn: 'Product Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Samsung A54 Phone' },
    { field: 'categoryCode', labelAr: 'رمز الفئة', labelEn: 'Category Code', required: true, type: 'string', synonyms: ['category', 'فئة'], example: 'ELEC', referenceEntity: 'product_category' },
    { field: 'uomCode', labelAr: 'رمز وحدة القياس', labelEn: 'UoM Code', required: true, type: 'string', synonyms: ['uom', 'unit', 'وحدة'], example: 'PCS', referenceEntity: 'unit_of_measure' },
    { field: 'type', labelAr: 'نوع المنتج', labelEn: 'Product Type', required: false, type: 'string', synonyms: ['product_type'], example: 'storable' },
    { field: 'salePrice', labelAr: 'سعر البيع', labelEn: 'Sale Price', required: false, type: 'number', synonyms: ['price', 'selling_price', 'سعر'], example: '500000' },
    { field: 'costPrice', labelAr: 'سعر التكلفة', labelEn: 'Cost Price', required: false, type: 'number', synonyms: ['cost', 'purchase_price', 'تكلفة'], example: '400000' },
    { field: 'minSalePrice', labelAr: 'أدنى سعر بيع', labelEn: 'Min Sale Price', required: false, type: 'number', synonyms: ['min_price', 'floor_price'], example: '450000' },
    { field: 'taxRate', labelAr: 'نسبة الضريبة', labelEn: 'Tax Rate %', required: false, type: 'number', synonyms: ['tax', 'vat', 'ضريبة'], example: '0' },
    { field: 'description', labelAr: 'الوصف', labelEn: 'Description', required: false, type: 'string', synonyms: ['desc', 'وصف'], example: 'هاتف ذكي' },
  ],

  product_variant: [
    { field: 'sku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['variant_code', 'code', 'رمز'], example: 'SAM-A54-BLK' },
    { field: 'templateSku', labelAr: 'رمز المنتج الأب', labelEn: 'Product SKU', required: true, type: 'string', synonyms: ['product_sku', 'parent_sku'], example: 'SAM-A54', referenceEntity: 'product_template' },
    { field: 'nameAr', labelAr: 'اسم المتغير (عربي)', labelEn: 'Variant Name (AR)', required: false, type: 'string', synonyms: ['name', 'اسم'], example: 'أسود' },
    { field: 'barcode', labelAr: 'الباركود', labelEn: 'Barcode', required: false, type: 'string', synonyms: ['ean', 'upc', 'باركود'], example: '6291234567890' },
    { field: 'salePrice', labelAr: 'سعر البيع', labelEn: 'Sale Price', required: false, type: 'number', synonyms: ['price', 'سعر'], example: '500000' },
    { field: 'costPrice', labelAr: 'سعر التكلفة', labelEn: 'Cost Price', required: false, type: 'number', synonyms: ['cost', 'تكلفة'], example: '400000' },
  ],

  warehouse: [
    { field: 'code', labelAr: 'رمز المستودع', labelEn: 'Warehouse Code', required: true, type: 'string', synonyms: ['warehouse_code', 'رمز'], example: 'WH-01' },
    { field: 'nameAr', labelAr: 'اسم المستودع (عربي)', labelEn: 'Warehouse Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'مستودع'], example: 'المستودع الرئيسي' },
    { field: 'nameEn', labelAr: 'اسم المستودع (إنجليزي)', labelEn: 'Warehouse Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Main Warehouse' },
    { field: 'address', labelAr: 'العنوان', labelEn: 'Address', required: false, type: 'string', synonyms: ['location', 'عنوان'], example: 'بغداد - الكرادة' },
    { field: 'isDefault', labelAr: 'مستودع افتراضي', labelEn: 'Is Default', required: false, type: 'boolean', synonyms: ['default', 'افتراضي'], example: 'true' },
  ],

  customer: [
    { field: 'code', labelAr: 'رمز العميل', labelEn: 'Customer Code', required: false, type: 'string', synonyms: ['customer_code', 'رمز'], example: 'CUST-001' },
    { field: 'nameAr', labelAr: 'اسم العميل (عربي)', labelEn: 'Customer Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'customer_name'], example: 'أحمد محمد' },
    { field: 'nameEn', labelAr: 'اسم العميل (إنجليزي)', labelEn: 'Customer Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Ahmed Mohammed' },
    { field: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', required: false, type: 'phone', synonyms: ['mobile', 'هاتف', 'موبايل'], example: '07701234567' },
    { field: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', required: false, type: 'email', synonyms: ['بريد', 'ايميل'], example: 'ahmed@example.com' },
    { field: 'address', labelAr: 'العنوان', labelEn: 'Address', required: false, type: 'string', synonyms: ['عنوان'], example: 'بغداد - المنصور' },
    { field: 'creditLimitIqd', labelAr: 'حد الائتمان (IQD)', labelEn: 'Credit Limit (IQD)', required: false, type: 'number', synonyms: ['credit_limit', 'credit'], example: '5000000' },
    { field: 'taxNumber', labelAr: 'الرقم الضريبي', labelEn: 'Tax Number', required: false, type: 'string', synonyms: ['tax_id', 'vat_number'], example: '1234567890' },
    { field: 'type', labelAr: 'نوع العميل', labelEn: 'Customer Type', required: false, type: 'string', synonyms: ['customer_type'], example: 'retail' },
  ],

  supplier: [
    { field: 'code', labelAr: 'رمز المورد', labelEn: 'Supplier Code', required: true, type: 'string', synonyms: ['supplier_code', 'رمز'], example: 'SUP-001' },
    { field: 'nameAr', labelAr: 'اسم المورد (عربي)', labelEn: 'Supplier Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'supplier_name'], example: 'شركة التوريدات' },
    { field: 'nameEn', labelAr: 'اسم المورد (إنجليزي)', labelEn: 'Supplier Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'General Supplies' },
    { field: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', required: false, type: 'phone', synonyms: ['mobile', 'هاتف'], example: '07801234567' },
    { field: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', required: false, type: 'email', synonyms: ['بريد'], example: 'info@supplier.com' },
    { field: 'address', labelAr: 'العنوان', labelEn: 'Address', required: false, type: 'string', synonyms: ['عنوان'], example: 'بغداد' },
    { field: 'paymentTermDays', labelAr: 'مدة الدفع (أيام)', labelEn: 'Payment Terms (Days)', required: false, type: 'number', synonyms: ['payment_terms'], example: '30' },
    { field: 'taxNumber', labelAr: 'الرقم الضريبي', labelEn: 'Tax Number', required: false, type: 'string', synonyms: ['tax_id'], example: '9876543210' },
  ],

  chart_of_accounts: [
    { field: 'code', labelAr: 'رمز الحساب', labelEn: 'Account Code', required: true, type: 'string', synonyms: ['account_code', 'رمز'], example: '1101' },
    { field: 'nameAr', labelAr: 'اسم الحساب (عربي)', labelEn: 'Account Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم', 'account_name'], example: 'الصندوق' },
    { field: 'nameEn', labelAr: 'اسم الحساب (إنجليزي)', labelEn: 'Account Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Cash' },
    { field: 'accountType', labelAr: 'نوع الحساب', labelEn: 'Account Type', required: true, type: 'string', synonyms: ['type', 'نوع'], example: 'asset' },
    { field: 'parentCode', labelAr: 'رمز الحساب الأب', labelEn: 'Parent Account Code', required: false, type: 'string', synonyms: ['parent'], example: '11', referenceEntity: 'chart_of_accounts' },
    { field: 'isPostable', labelAr: 'قابل للترحيل', labelEn: 'Is Postable', required: false, type: 'boolean', synonyms: ['postable', 'leaf'], example: 'true' },
    { field: 'normalBalance', labelAr: 'الرصيد الطبيعي', labelEn: 'Normal Balance', required: false, type: 'string', synonyms: ['balance_type'], example: 'debit' },
  ],

  opening_stock: [
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product_code'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'warehouseCode', labelAr: 'رمز المستودع', labelEn: 'Warehouse Code', required: true, type: 'string', synonyms: ['warehouse', 'مستودع'], example: 'WH-01', referenceEntity: 'warehouse' },
    { field: 'qty', labelAr: 'الكمية', labelEn: 'Quantity', required: true, type: 'number', synonyms: ['quantity', 'كمية'], example: '100' },
    { field: 'unitCostIqd', labelAr: 'تكلفة الوحدة (IQD)', labelEn: 'Unit Cost (IQD)', required: true, type: 'number', synonyms: ['cost', 'unit_cost', 'تكلفة'], example: '400000' },
    { field: 'batchNumber', labelAr: 'رقم الدفعة', labelEn: 'Batch Number', required: false, type: 'string', synonyms: ['batch', 'lot'], example: 'B2024-001' },
    { field: 'expiryDate', labelAr: 'تاريخ الانتهاء', labelEn: 'Expiry Date', required: false, type: 'date', synonyms: ['expiry'], example: '31/12/2025' },
  ],

  opening_balance: [
    { field: 'accountCode', labelAr: 'رمز الحساب', labelEn: 'Account Code', required: true, type: 'string', synonyms: ['account', 'رمز'], example: '1101', referenceEntity: 'chart_of_accounts' },
    { field: 'debit', labelAr: 'مدين', labelEn: 'Debit', required: false, type: 'number', synonyms: ['debit_amount', 'مدين'], example: '5000000' },
    { field: 'credit', labelAr: 'دائن', labelEn: 'Credit', required: false, type: 'number', synonyms: ['credit_amount', 'دائن'], example: '0' },
    { field: 'description', labelAr: 'البيان', labelEn: 'Description', required: false, type: 'string', synonyms: ['memo', 'note', 'بيان'], example: 'رصيد افتتاحي' },
    { field: 'costCenterCode', labelAr: 'رمز مركز التكلفة', labelEn: 'Cost Center Code', required: false, type: 'string', synonyms: ['cost_center'], example: 'CC-01' },
  ],

  price_list: [
    { field: 'listName', labelAr: 'اسم القائمة', labelEn: 'Price List Name', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'أسعار الجملة' },
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'price', labelAr: 'السعر', labelEn: 'Price', required: true, type: 'number', synonyms: ['amount', 'سعر'], example: '480000' },
    { field: 'currency', labelAr: 'العملة', labelEn: 'Currency', required: false, type: 'string', synonyms: ['عملة'], example: 'IQD' },
    { field: 'minQty', labelAr: 'الحد الأدنى للكمية', labelEn: 'Min Qty', required: false, type: 'number', synonyms: ['min_quantity'], example: '10' },
  ],

  employee: [
    { field: 'code', labelAr: 'رمز الموظف', labelEn: 'Employee Code', required: true, type: 'string', synonyms: ['employee_code', 'رمز'], example: 'EMP-001' },
    { field: 'nameAr', labelAr: 'اسم الموظف (عربي)', labelEn: 'Employee Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'علي حسن' },
    { field: 'nameEn', labelAr: 'اسم الموظف (إنجليزي)', labelEn: 'Employee Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Ali Hassan' },
    { field: 'nationalId', labelAr: 'رقم الهوية', labelEn: 'National ID', required: false, type: 'string', synonyms: ['id_number', 'هوية'], example: '1234567' },
    { field: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', required: false, type: 'phone', synonyms: ['mobile', 'هاتف'], example: '07901234567' },
    { field: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', required: false, type: 'email', synonyms: ['بريد'], example: 'ali@company.com' },
    { field: 'departmentCode', labelAr: 'رمز القسم', labelEn: 'Department Code', required: false, type: 'string', synonyms: ['department', 'قسم'], example: 'SALES', referenceEntity: 'department' },
    { field: 'jobTitle', labelAr: 'المسمى الوظيفي', labelEn: 'Job Title', required: false, type: 'string', synonyms: ['title', 'position', 'وظيفة'], example: 'مندوب مبيعات' },
    { field: 'hireDate', labelAr: 'تاريخ التعيين', labelEn: 'Hire Date', required: false, type: 'date', synonyms: ['start_date', 'join_date'], example: '01/01/2024' },
    { field: 'baseSalaryIqd', labelAr: 'الراتب الأساسي (IQD)', labelEn: 'Base Salary (IQD)', required: false, type: 'number', synonyms: ['salary', 'راتب'], example: '750000' },
  ],

  department: [
    { field: 'code', labelAr: 'رمز القسم', labelEn: 'Department Code', required: true, type: 'string', synonyms: ['department_code', 'رمز'], example: 'SALES' },
    { field: 'nameAr', labelAr: 'اسم القسم (عربي)', labelEn: 'Department Name (AR)', required: true, type: 'string', synonyms: ['name', 'اسم'], example: 'قسم المبيعات' },
    { field: 'nameEn', labelAr: 'اسم القسم (إنجليزي)', labelEn: 'Department Name (EN)', required: false, type: 'string', synonyms: ['name_en'], example: 'Sales Department' },
    { field: 'managerId', labelAr: 'رمز المدير', labelEn: 'Manager Code', required: false, type: 'string', synonyms: ['manager', 'مدير'], example: 'EMP-001' },
  ],

  reorder_point: [
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'warehouseCode', labelAr: 'رمز المستودع', labelEn: 'Warehouse Code', required: true, type: 'string', synonyms: ['warehouse'], example: 'WH-01', referenceEntity: 'warehouse' },
    { field: 'minQty', labelAr: 'الحد الأدنى', labelEn: 'Min Quantity', required: true, type: 'number', synonyms: ['min', 'minimum'], example: '10' },
    { field: 'reorderQty', labelAr: 'كمية إعادة الطلب', labelEn: 'Reorder Quantity', required: true, type: 'number', synonyms: ['reorder', 'quantity'], example: '50' },
    { field: 'maxQty', labelAr: 'الحد الأقصى', labelEn: 'Max Quantity', required: false, type: 'number', synonyms: ['max', 'maximum'], example: '200' },
  ],

  supplier_price: [
    { field: 'supplierCode', labelAr: 'رمز المورد', labelEn: 'Supplier Code', required: true, type: 'string', synonyms: ['supplier', 'مورد'], example: 'SUP-001', referenceEntity: 'supplier' },
    { field: 'variantSku', labelAr: 'رمز المتغير', labelEn: 'Variant SKU', required: true, type: 'string', synonyms: ['sku', 'product'], example: 'SAM-A54-BLK', referenceEntity: 'product_variant' },
    { field: 'priceIqd', labelAr: 'السعر (IQD)', labelEn: 'Price (IQD)', required: true, type: 'number', synonyms: ['price', 'cost'], example: '380000' },
    { field: 'currency', labelAr: 'العملة', labelEn: 'Currency', required: false, type: 'string', synonyms: ['عملة'], example: 'IQD' },
    { field: 'leadTimeDays', labelAr: 'مدة التوريد (أيام)', labelEn: 'Lead Time (Days)', required: false, type: 'number', synonyms: ['lead_time'], example: '7' },
    { field: 'minOrderQty', labelAr: 'أقل كمية طلب', labelEn: 'Min Order Qty', required: false, type: 'number', synonyms: ['moq', 'min_order'], example: '10' },
  ],
};
