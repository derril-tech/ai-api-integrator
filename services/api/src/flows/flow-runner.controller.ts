import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { FlowDefinition, FlowRunOptions, FlowRunnerService } from './flow-runner.service';

class RunFlowDto {
  flow!: FlowDefinition;
  options?: FlowRunOptions;
}

class RunLiveFlowDto {
  flow!: FlowDefinition;
  options?: FlowRunOptions & {
    temporalEnabled?: boolean;
    workflowId?: string;
    taskQueue?: string;
  };
}

@ApiTags('flows')
@Controller('flows')
export class FlowRunnerController {
  constructor(private readonly flowRunner: FlowRunnerService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run a flow in sandbox mode (no external side effects)' })
  @ApiResponse({ status: 200, description: 'Flow run result' })
  async run(@Body() dto: RunFlowDto) {
    return this.flowRunner.runSandbox(dto.flow, { ...dto.options, sandbox: true });
  }

  @Post('run-live')
  @ApiOperation({ summary: 'Run a flow in live mode with real external calls' })
  @ApiResponse({ status: 200, description: 'Live flow run result' })
  @ApiQuery({ name: 'temporal', required: false, description: 'Enable Temporal workflow execution' })
  async runLive(
    @Body() dto: RunLiveFlowDto,
    @Query('temporal') temporal?: string
  ) {
    const options = {
      ...dto.options,
      temporalEnabled: temporal === 'true' || dto.options?.temporalEnabled,
      sandbox: false,
    };
    return this.flowRunner.runLive(dto.flow, options);
  }

  @Post('run-temporal')
  @ApiOperation({ summary: 'Run a flow using Temporal Cloud/Server' })
  @ApiResponse({ status: 200, description: 'Temporal workflow execution result' })
  async runTemporal(@Body() dto: RunLiveFlowDto) {
    const options = {
      ...dto.options,
      temporalEnabled: true,
      sandbox: false,
    };
    return this.flowRunner.runLive(dto.flow, options);
  }
}


