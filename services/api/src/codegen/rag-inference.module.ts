import { Module } from '@nestjs/common';
import { RAGInferenceService } from './rag-inference.service';
import { RAGInferenceController } from './rag-inference.controller';
import { PerformanceModule } from './performance.module';

@Module({
  imports: [PerformanceModule],
  controllers: [RAGInferenceController],
  providers: [RAGInferenceService],
  exports: [RAGInferenceService],
})
export class RAGInferenceModule {}
