import { Module } from '@nestjs/common';
import { FlowRunnerService } from './flow-runner.service';
import { FlowRunnerController } from './flow-runner.controller';

@Module({
  providers: [FlowRunnerService],
  controllers: [FlowRunnerController],
  exports: [FlowRunnerService],
})
export class FlowsModule {}


