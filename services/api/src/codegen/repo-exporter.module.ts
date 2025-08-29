import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepoExporterService } from './repo-exporter.service';
import { RepoExporterController } from './repo-exporter.controller';
import { CodegenModule } from './codegen.module';
import { GuardrailsModule } from './guardrails.module';
import { PerformanceModule } from './performance.module';
import { ExportGuard } from './guards/export.guard';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project]),
    CodegenModule,
    GuardrailsModule,
    PerformanceModule,
  ],
  controllers: [RepoExporterController],
  providers: [RepoExporterService, ExportGuard],
  exports: [RepoExporterService, ExportGuard],
})
export class RepoExporterModule {}
