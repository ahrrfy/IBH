-- Wave 5 — HR + Custom Orders + Marketing
CREATE TYPE "EmployeeStatus" AS ENUM ('active','on_leave','terminated','suspended');
CREATE TYPE "LeaveType" AS ENUM ('annual','sick','maternity','emergency','unpaid','hajj');
CREATE TYPE "LeaveStatus" AS ENUM ('draft','submitted','approved','rejected','cancelled');
CREATE TYPE "AttendanceSource" AS ENUM ('zkteco','mobile_geofence','manual','face_recognition');
CREATE TYPE "PayrollRunStatus" AS ENUM ('draft','calculated','reviewed','approved','posted','paid');
CREATE TYPE "JobOrderStatus" AS ENUM ('quotation','design_review','approved','in_production','quality_check','ready','delivered','cancelled');
CREATE TYPE "CampaignStatus" AS ENUM ('draft','scheduled','sending','completed','paused');
CREATE TYPE "CampaignChannel" AS ENUM ('whatsapp','sms','email','facebook','tiktok','instagram','in_store');

-- ── DEPARTMENTS ──
CREATE TABLE "departments" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  "parentId" CHAR(26),
  "managerId" CHAR(26),
  "costCenterId" CHAR(26),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dept_parent_fk" FOREIGN KEY ("parentId") REFERENCES "departments"("id")
);
CREATE UNIQUE INDEX "dept_company_code_uk" ON "departments"("companyId","code");
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "departments" USING ("companyId" = current_company_id());
CREATE TRIGGER dept_updated_at BEFORE UPDATE ON "departments" FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── PAY GRADES ──
CREATE TABLE "pay_grades" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "code" VARCHAR(10) NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "minSalaryIqd" DECIMAL(18,3) NOT NULL,
  "midSalaryIqd" DECIMAL(18,3) NOT NULL,
  "maxSalaryIqd" DECIMAL(18,3) NOT NULL,
  "annualIncreasePct" DECIMAL(5,2) NOT NULL DEFAULT 5,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_grades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pg_ranges_chk" CHECK ("minSalaryIqd" <= "midSalaryIqd" AND "midSalaryIqd" <= "maxSalaryIqd")
);
CREATE UNIQUE INDEX "pg_company_code_uk" ON "pay_grades"("companyId","code");
ALTER TABLE "pay_grades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pay_grades" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pay_grades" USING ("companyId" = current_company_id());

-- ── EMPLOYEES ──
CREATE TABLE "employees" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "employeeNumber" VARCHAR(20) NOT NULL,
  "userId" CHAR(26),
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  "nationalId" VARCHAR(30),
  "passportNumber" VARCHAR(30),
  "dateOfBirth" DATE,
  "gender" VARCHAR(10),
  "maritalStatus" VARCHAR(20),
  "phone" VARCHAR(20),
  "whatsapp" VARCHAR(20),
  "email" VARCHAR(200),
  "address" TEXT,
  "emergencyContact" VARCHAR(200),
  "emergencyPhone" VARCHAR(20),
  "departmentId" CHAR(26),
  "positionTitle" VARCHAR(100),
  "payGradeId" CHAR(26),
  "managerId" CHAR(26),
  "hireDate" DATE NOT NULL,
  "contractEndDate" DATE,
  "baseSalaryIqd" DECIMAL(18,3) NOT NULL,
  "housingAllowanceIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "transportAllowanceIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "otherAllowancesIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "bankAccountId" CHAR(26),
  "bankAccountNumber" VARCHAR(50),
  "socialSecurityEnrolled" BOOLEAN NOT NULL DEFAULT false,
  "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
  "terminationDate" DATE,
  "terminationReason" VARCHAR(500),
  "photoUrl" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "emp_dept_fk" FOREIGN KEY ("departmentId") REFERENCES "departments"("id"),
  CONSTRAINT "emp_paygrade_fk" FOREIGN KEY ("payGradeId") REFERENCES "pay_grades"("id"),
  CONSTRAINT "emp_manager_fk" FOREIGN KEY ("managerId") REFERENCES "employees"("id"),
  CONSTRAINT "emp_base_salary_chk" CHECK ("baseSalaryIqd" >= 0)
);
CREATE UNIQUE INDEX "emp_company_number_uk" ON "employees"("companyId","employeeNumber");
CREATE INDEX "emp_company_dept_ix" ON "employees"("companyId","departmentId");
CREATE INDEX "emp_company_status_ix" ON "employees"("companyId","status");
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employees" USING ("companyId" = current_company_id());
CREATE TRIGGER emp_updated_at BEFORE UPDATE ON "employees" FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ATTENDANCE ──
CREATE TABLE "attendance_records" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "employeeId" CHAR(26) NOT NULL,
  "date" DATE NOT NULL,
  "checkInAt" TIMESTAMP(3),
  "checkOutAt" TIMESTAMP(3),
  "checkInSource" "AttendanceSource",
  "checkOutSource" "AttendanceSource",
  "checkInLat" DECIMAL(10,7),
  "checkInLng" DECIMAL(10,7),
  "hoursWorked" DECIMAL(6,2),
  "lateMinutes" INT NOT NULL DEFAULT 0,
  "overtimeMinutes" INT NOT NULL DEFAULT 0,
  "isAbsent" BOOLEAN NOT NULL DEFAULT false,
  "isLeave" BOOLEAN NOT NULL DEFAULT false,
  "leaveRequestId" CHAR(26),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ar_emp_fk" FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
);
CREATE UNIQUE INDEX "ar_emp_date_uk" ON "attendance_records"("employeeId","date");
CREATE INDEX "ar_company_date_ix" ON "attendance_records"("companyId","date");

-- ── LEAVE REQUESTS ──
CREATE TABLE "leave_requests" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "employeeId" CHAR(26) NOT NULL,
  "type" "LeaveType" NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "totalDays" DECIMAL(5,1) NOT NULL,
  "reason" TEXT,
  "status" "LeaveStatus" NOT NULL DEFAULT 'draft',
  "attachmentUrl" TEXT,
  "approvedBy" CHAR(26),
  "approvedAt" TIMESTAMP(3),
  "rejectedBy" CHAR(26),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lr_emp_fk" FOREIGN KEY ("employeeId") REFERENCES "employees"("id"),
  CONSTRAINT "lr_dates_chk" CHECK ("endDate" >= "startDate")
);
CREATE INDEX "lr_company_emp_status_ix" ON "leave_requests"("companyId","employeeId","status");
CREATE INDEX "lr_company_start_ix" ON "leave_requests"("companyId","startDate");

-- ── PAYROLL RUNS ──
CREATE TABLE "payroll_runs" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26),
  "number" VARCHAR(50) NOT NULL,
  "periodYear" INT NOT NULL,
  "periodMonth" INT NOT NULL,
  "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
  "totalGrossIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalDeductionsIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalNetIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalTaxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalSsIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "approvedBy" CHAR(26),
  "approvedAt" TIMESTAMP(3),
  "journalEntryId" CHAR(26),
  "postedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pr_month_chk" CHECK ("periodMonth" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX "pr_company_period_branch_uk" ON "payroll_runs"("companyId","periodYear","periodMonth", COALESCE("branchId", ''));
CREATE INDEX "pr_company_status_ix" ON "payroll_runs"("companyId","status");
ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payroll_runs" USING ("companyId" = current_company_id());

CREATE TABLE "payroll_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "payrollRunId" CHAR(26) NOT NULL,
  "employeeId" CHAR(26) NOT NULL,
  "baseSalaryIqd" DECIMAL(18,3) NOT NULL,
  "housingIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "transportIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "otherAllowIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "overtimeIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "bonusIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "commissionIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "grossIqd" DECIMAL(18,3) NOT NULL,
  "absenceDeductIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "lateDeductIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "advanceDeductIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "incomeTaxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "socialSecurityIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "otherDeductIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalDeductIqd" DECIMAL(18,3) NOT NULL,
  "netIqd" DECIMAL(18,3) NOT NULL,
  "daysWorked" DECIMAL(5,1) NOT NULL,
  "hoursOvertime" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "payslipPdfUrl" TEXT,
  "notes" TEXT,
  CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pl_run_fk" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "pl_emp_fk" FOREIGN KEY ("employeeId") REFERENCES "employees"("id"),
  CONSTRAINT "pl_net_chk" CHECK ("netIqd" = "grossIqd" - "totalDeductIqd")
);
CREATE UNIQUE INDEX "pl_run_emp_uk" ON "payroll_lines"("payrollRunId","employeeId");
CREATE INDEX "pl_emp_ix" ON "payroll_lines"("employeeId");

-- ── JOB ORDERS ──
CREATE TABLE "job_orders" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "customerId" CHAR(26) NOT NULL,
  "salesOrderId" CHAR(26),
  "productName" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "designFileUrl" TEXT,
  "quantity" INT NOT NULL,
  "expectedDate" DATE NOT NULL,
  "status" "JobOrderStatus" NOT NULL DEFAULT 'quotation',
  "estimatedCostIqd" DECIMAL(18,3) NOT NULL,
  "actualCostIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "pricePerUnitIqd" DECIMAL(18,3) NOT NULL,
  "totalPriceIqd" DECIMAL(18,3) NOT NULL,
  "depositIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "completedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "job_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jo_qty_chk" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "jo_company_number_uk" ON "job_orders"("companyId","number");
CREATE INDEX "jo_company_customer_ix" ON "job_orders"("companyId","customerId");
CREATE INDEX "jo_company_status_ix" ON "job_orders"("companyId","status");
ALTER TABLE "job_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "job_orders" USING ("companyId" = current_company_id());

CREATE TABLE "job_order_bom" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "jobOrderId" CHAR(26) NOT NULL,
  "variantId" CHAR(26),
  "description" VARCHAR(500) NOT NULL,
  "qtyRequired" DECIMAL(18,3) NOT NULL,
  "qtyConsumed" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "unitCostIqd" DECIMAL(18,6) NOT NULL,
  "totalCostIqd" DECIMAL(18,3) NOT NULL,
  "sourceType" VARCHAR(30) NOT NULL,
  "warehouseId" CHAR(26),
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "job_order_bom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bom_jo_fk" FOREIGN KEY ("jobOrderId") REFERENCES "job_orders"("id") ON DELETE CASCADE
);
CREATE INDEX "bom_jo_ix" ON "job_order_bom"("jobOrderId");

CREATE TABLE "job_order_stages" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "jobOrderId" CHAR(26) NOT NULL,
  "sequence" INT NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "assignedTo" CHAR(26),
  "plannedDate" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  CONSTRAINT "job_order_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stages_jo_fk" FOREIGN KEY ("jobOrderId") REFERENCES "job_orders"("id") ON DELETE CASCADE
);
CREATE INDEX "stages_jo_seq_ix" ON "job_order_stages"("jobOrderId","sequence");

-- ── CAMPAIGNS ──
CREATE TABLE "campaigns" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "channel" "CampaignChannel" NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
  "audienceCriteria" JSONB,
  "audienceSize" INT NOT NULL DEFAULT 0,
  "messageTemplate" TEXT,
  "messageTemplateId" CHAR(26),
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "budgetIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "spentIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "utmSource" VARCHAR(50),
  "utmMedium" VARCHAR(50),
  "utmCampaign" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "camp_company_status_ix" ON "campaigns"("companyId","status");
CREATE INDEX "camp_company_channel_ix" ON "campaigns"("companyId","channel");
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaigns" USING ("companyId" = current_company_id());

CREATE TABLE "campaign_recipients" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "campaignId" CHAR(26) NOT NULL,
  "customerId" CHAR(26),
  "phoneOrEmail" VARCHAR(200) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "conversionValueIqd" DECIMAL(18,3),
  "errorMessage" TEXT,
  CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cr_camp_fk" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE
);
CREATE INDEX "cr_camp_ix" ON "campaign_recipients"("campaignId");
CREATE INDEX "cr_customer_ix" ON "campaign_recipients"("customerId");

CREATE TABLE "promotions" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "code" VARCHAR(30),
  "nameAr" VARCHAR(200) NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "value" DECIMAL(18,3) NOT NULL,
  "minPurchaseIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "maxDiscountIqd" DECIMAL(18,3),
  "applicableCategories" JSONB,
  "applicableVariants" JSONB,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "maxUses" INT,
  "maxUsesPerCustomer" INT,
  "usedCount" INT NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promo_dates_chk" CHECK ("endDate" > "startDate")
);
CREATE UNIQUE INDEX "promo_company_code_uk" ON "promotions"("companyId","code");
CREATE INDEX "promo_active_ix" ON "promotions"("companyId","isActive","startDate","endDate");
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "promotions" USING ("companyId" = current_company_id());
