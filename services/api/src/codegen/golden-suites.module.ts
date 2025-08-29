import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoldenSuitesService } from './golden-suites.service';
import { GoldenSuitesController } from './golden-suites.controller';
import { CIIntegrationService } from './ci-integration.service';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [GoldenSuitesController],
  providers: [GoldenSuitesService, CIIntegrationService],
  exports: [GoldenSuitesService, CIIntegrationService],
})
export class GoldenSuitesModule {}
