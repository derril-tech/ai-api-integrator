import { Module } from '@nestjs/common';
import { GoldenTestHarnessService } from './golden-test-harness.service';
import { GoldenTestHarnessController } from './golden-test-harness.controller';
import { CodegenModule } from './codegen.module';

@Module({
  imports: [CodegenModule],
  controllers: [GoldenTestHarnessController],
  providers: [GoldenTestHarnessService],
  exports: [GoldenTestHarnessService],
})
export class GoldenTestHarnessModule {}
