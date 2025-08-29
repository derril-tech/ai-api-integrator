import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SBOMService } from './sbom.service';
import { SBOMController } from './sbom.controller';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [SBOMController],
  providers: [SBOMService],
  exports: [SBOMService],
})
export class SBOMModule {}
