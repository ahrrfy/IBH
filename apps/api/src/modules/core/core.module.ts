import { Module } from '@nestjs/common';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { CompaniesController } from './companies/companies.controller';
import { CompaniesService } from './companies/companies.service';
import { AuthModule } from '../../engines/auth/auth.module';
import { AuditModule } from '../../engines/audit/audit.module';

@Module({
  imports: [
    AuthModule,   // provides AuthService (for hashPassword)
    AuditModule,
  ],
  controllers: [
    UsersController,
    CompaniesController,
  ],
  providers: [
    UsersService,
    CompaniesService,
  ],
  exports: [
    UsersService,
    CompaniesService,
  ],
})
export class CoreModule {}
