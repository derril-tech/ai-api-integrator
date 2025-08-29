import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookValidatorService } from './webhook-validator.service';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  providers: [WebhookValidatorService],
  exports: [WebhookValidatorService],
})
export class WebhookValidatorModule {}
