import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { TemporalModule } from './temporal/temporal.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CodegenModule } from './codegen/codegen.module';
import { FlowsModule } from './flows/flows.module';
import { ShareModule } from './share/share.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    CommonModule,
    TemporalModule,
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    CodegenModule,
    FlowsModule,
    ShareModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
