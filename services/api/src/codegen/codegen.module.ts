import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodegenService } from './codegen.service';
import { CodegenController } from './codegen.controller';
import { RepoExporterModule } from './repo-exporter.module';
import { GuardrailsModule } from './guardrails.module';
import { GoldenSuitesModule } from './golden-suites.module';
import { SBOMModule } from './sbom.module';
import { PerformanceModule } from './performance.module';
import { SecurityModule } from './security.module';
import { FileUploadModule } from './file-upload.module';
import { OpenApiParserModule } from './openapi-parser.module';
import { ApiSpecParserModule } from './api-spec-parser.module';
import { RAGInferenceModule } from './rag-inference.module';
import { GoldenTestHarnessModule } from './golden-test-harness.module';
import { AsyncAPIParserModule } from './asyncapi-parser.module';
import { WebhookValidatorModule } from './webhook-validator.module';
import { OAuthProvisioningModule } from './oauth-provisioning.module';
import { VaultSecretsModule } from './vault-secrets.module';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project]),
    RepoExporterModule,
    GuardrailsModule,
    GoldenSuitesModule,
    SBOMModule,
    PerformanceModule,
    SecurityModule,
    FileUploadModule,
    OpenApiParserModule,
    ApiSpecParserModule,
    RAGInferenceModule,
    GoldenTestHarnessModule,
    AsyncAPIParserModule,
    WebhookValidatorModule,
    OAuthProvisioningModule,
    VaultSecretsModule,
  ],
  controllers: [CodegenController],
  providers: [CodegenService],
  exports: [CodegenService],
})
export class CodegenModule {}
