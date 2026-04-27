import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { EmployeesService } from './employees/employees.service';
import { EmployeesController } from './employees/employees.controller';
import { DepartmentsService } from './departments/departments.service';
import { DepartmentsController } from './departments/departments.controller';
import { PayGradesService } from './pay-grades/pay-grades.service';
import { PayGradesController } from './pay-grades/pay-grades.controller';
import { AttendanceService } from './attendance/attendance.service';
import { AttendanceController } from './attendance/attendance.controller';
import { LeavesService } from './leaves/leaves.service';
import { LeavesController } from './leaves/leaves.controller';
import { PayrollService } from './payroll/payroll.service';
import { PayrollController } from './payroll/payroll.controller';
import { PayrollCommissionBridge } from './payroll/commission-bridge';
import { SalesCommissionsModule } from '../sales/commissions/commissions.module';
import { RecruitmentService } from './recruitment/recruitment.service';
import { RecruitmentController } from './recruitment/recruitment.controller';
import { RecruitmentPublicController } from './recruitment/recruitment-public.controller';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule, SalesCommissionsModule],
  controllers: [
    EmployeesController,
    DepartmentsController,
    PayGradesController,
    AttendanceController,
    LeavesController,
    PayrollController,
    RecruitmentController,
    RecruitmentPublicController,
  ],
  providers: [
    EmployeesService,
    DepartmentsService,
    PayGradesService,
    AttendanceService,
    LeavesService,
    PayrollService,
    PayrollCommissionBridge,
    RecruitmentService,
  ],
  exports: [
    EmployeesService,
    DepartmentsService,
    PayGradesService,
    AttendanceService,
    LeavesService,
    PayrollService,
    PayrollCommissionBridge,
    RecruitmentService,
  ],
})
export class HrModule {}
