import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
