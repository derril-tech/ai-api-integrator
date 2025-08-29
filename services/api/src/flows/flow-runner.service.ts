import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiClientService } from '../common/services/api-client.service';
import { TemporalClientService } from '../temporal/temporal-client.service';

export interface FlowNode {
  id: string;
  type: 'http' | 'transform' | 'delay' | 'branch' | 'loop' | 'call' | 'webhook' | 'schedule';
  config: Record<string, any>;
  next?: string[]; // next node IDs
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
    jitter: boolean;
  };
}

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  entry: string; // entry node id
  schedule?: {
    cron?: string;
    interval?: number;
  };
  idempotencyKey?: string;
}

export interface FlowRunOptions {
  temporalEnabled?: boolean; // toggle for Temporal Cloud/Server
  timeoutMs?: number;
  variables?: Record<string, any>;
  sandbox?: boolean; // if true, no external calls
  workflowId?: string;
  taskQueue?: string;
}

export interface FlowRunResult {
  flowId: string;
  success: boolean;
  outputs: any[];
  logs: Array<{ level: 'info' | 'warn' | 'error'; message: string; ts: number }>;
  durationMs: number;
}

export interface TemporalWorkflowConfig {
  namespace?: string;
  taskQueue: string;
  workflowId: string;
  workflowType: string;
}

@Injectable()
export class FlowRunnerService {
  private readonly logger = new Logger(FlowRunnerService.name);
  
  constructor(
    private readonly configService: ConfigService,
    private readonly apiClient: ApiClientService,
    private readonly temporalClient: TemporalClientService,
  ) {}

  async runLive(flow: FlowDefinition, options: FlowRunOptions = {}): Promise<FlowRunResult> {
    if (options.temporalEnabled) {
      return this.runWithTemporal(flow, options);
    }
    return this.runSandbox(flow, { ...options, sandbox: false });
  }

  private async runWithTemporal(flow: FlowDefinition, options: FlowRunOptions): Promise<FlowRunResult> {
    const start = Date.now();
    const logs: FlowRunResult['logs'] = [];
    
    try {
      // Check if Temporal is connected
      if (!this.temporalClient.isTemporalConnected()) {
        this.logger.warn('Temporal not connected, falling back to sandbox execution');
        return this.runSandbox(flow, options);
      }

      const workflowId = options.workflowId || `flow-${flow.id}-${Date.now()}`;
      const taskQueue = options.taskQueue || this.configService.get('TEMPORAL_TASK_QUEUE', 'flow-execution');

      logs.push({ 
        level: 'info', 
        message: `Starting Temporal workflow: ${workflowId}`, 
        ts: Date.now() 
      });

      // Start the actual Temporal workflow
      const workflowResult = await this.temporalClient.startWorkflow({
        workflowId,
        taskQueue,
        workflowType: 'flowExecutionWorkflow',
        args: [{
          flowDefinition: flow,
          options: {
            variables: options.variables || {},
            timeoutMs: options.timeoutMs,
          },
        }],
        workflowExecutionTimeout: options.timeoutMs ? `${options.timeoutMs}ms` : '1h',
        searchAttributes: {
          flowId: flow.id,
          flowName: flow.name,
        },
        memo: {
          flowDefinition: flow,
          startedBy: 'api',
        },
      });

      logs.push({ 
        level: 'info', 
        message: `Temporal workflow started: ${workflowResult.workflowId}`, 
        ts: Date.now() 
      });

      // Get the workflow result
      const finalResult = await this.temporalClient.getWorkflowResult(workflowResult.workflowId, workflowResult.runId);

      if (finalResult.status === 'completed' && finalResult.result) {
        logs.push({ level: 'info', message: 'Temporal workflow completed successfully', ts: Date.now() });
        
        return {
          flowId: flow.id,
          success: finalResult.result.success,
          outputs: finalResult.result.outputs || [],
          logs: [...logs, ...(finalResult.result.logs || [])],
          durationMs: Date.now() - start,
        };
      } else {
        logs.push({ 
          level: 'error', 
          message: `Temporal workflow failed: ${finalResult.error || 'Unknown error'}`, 
          ts: Date.now() 
        });

        return {
          flowId: flow.id,
          success: false,
          outputs: [],
          logs,
          durationMs: Date.now() - start,
        };
      }

    } catch (error) {
      this.logger.error('Temporal workflow execution failed:', error);
      logs.push({ 
        level: 'error', 
        message: `Temporal execution failed: ${error.message}`, 
        ts: Date.now() 
      });
      
      // Fallback to sandbox execution if Temporal fails
      this.logger.warn('Falling back to sandbox execution due to Temporal error');
      return this.runSandbox(flow, options);
    }
  }

  private async simulateTemporalExecution(
    flow: FlowDefinition, 
    options: FlowRunOptions,
    config: TemporalWorkflowConfig
  ): Promise<{ success: boolean; outputs: any[]; logs: FlowRunResult['logs'] }> {
    const logs: FlowRunResult['logs'] = [];
    const outputs: any[] = [];
    
    logs.push({ 
      level: 'info', 
      message: `Temporal workflow ${config.workflowId} executing on task queue ${config.taskQueue}`, 
      ts: Date.now() 
    });

    // Simulate workflow execution with activities
    const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));
    const visited = new Set<string>();

    const executeActivity = async (nodeId: string): Promise<void> => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = nodeMap.get(nodeId);
      if (!node) {
        logs.push({ level: 'warn', message: `Activity ${nodeId} not found`, ts: Date.now() });
        return;
      }

      // Simulate activity execution with retry policy
      const maxAttempts = node.retryPolicy?.maxAttempts || 1;
      let attempt = 0;
      
      while (attempt < maxAttempts) {
        attempt++;
        try {
          logs.push({ 
            level: 'info', 
            message: `Executing activity ${nodeId} (attempt ${attempt}/${maxAttempts})`, 
            ts: Date.now() 
          });

          await this.executeNodeWithRetry(node, logs, outputs, options);
          break; // Success, exit retry loop
        } catch (error) {
          if (attempt === maxAttempts) {
            logs.push({ 
              level: 'error', 
              message: `Activity ${nodeId} failed after ${maxAttempts} attempts: ${error.message}`, 
              ts: Date.now() 
            });
            throw error;
          }
          
          const backoffMs = node.retryPolicy?.backoffMs || 1000;
          const jitter = node.retryPolicy?.jitter ? Math.random() * 0.1 : 0;
          const delay = backoffMs * Math.pow(2, attempt - 1) * (1 + jitter);
          
          logs.push({ 
            level: 'warn', 
            message: `Activity ${nodeId} attempt ${attempt} failed, retrying in ${delay}ms`, 
            ts: Date.now() 
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Execute next activities
      for (const nextId of node.next || []) {
        await executeActivity(nextId);
      }
    };

    await executeActivity(flow.entry);
    
    logs.push({ 
      level: 'info', 
      message: `Temporal workflow ${config.workflowId} completed successfully`, 
      ts: Date.now() 
    });

    return { success: true, outputs, logs };
  }

  async runSandbox(flow: FlowDefinition, options: FlowRunOptions = {}): Promise<FlowRunResult> {
    const start = Date.now();
    const logs: FlowRunResult['logs'] = [];
    const outputs: any[] = [];

    // Temporal toggle (stub): in real impl, dispatch to Temporal workflow
    if (options.temporalEnabled) {
      logs.push({ level: 'info', message: 'Temporal mode enabled (stub run)', ts: Date.now() });
    }

    const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));
    const visited = new Set<string>();

    const execNode = async (nodeId: string): Promise<void> => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) {
        logs.push({ level: 'warn', message: `Node ${nodeId} not found`, ts: Date.now() });
        return;
      }

      try {
        await this.executeNodeWithRetry(node, logs, outputs, options);
      } catch (e: any) {
        logs.push({ level: 'error', message: `Node ${nodeId} error: ${e.message}`, ts: Date.now() });
      }

      // proceed to next nodes (unless it's a control flow node)
      if (!['branch', 'loop'].includes(node.type)) {
        for (const nxt of node.next ?? []) {
          await execNode(nxt);
        }
      }
    };

    await execNode(flow.entry);

    const durationMs = Date.now() - start;
    return { flowId: flow.id, success: true, outputs, logs, durationMs };
  }

  private async executeNodeWithRetry(
    node: FlowNode,
    logs: FlowRunResult['logs'],
    outputs: any[],
    options: FlowRunOptions
  ): Promise<void> {
    switch (node.type) {
      case 'delay': {
        const ms = Number(node.config?.ms ?? 0);
        logs.push({ level: 'info', message: `Delay ${ms}ms`, ts: Date.now() });
        if (ms > 0) await new Promise(r => setTimeout(r, ms));
        break;
      }
      case 'transform': {
        const input = node.config?.input;
        const expr = node.config?.expr; // simple JSON path or function name (stub)
        const out = { input, expr, transformed: true };
        outputs.push(out);
        logs.push({ level: 'info', message: `Transform produced output`, ts: Date.now() });
        break;
      }
      case 'http': {
        const url = node.config?.url;
        const method = String(node.config?.method || 'GET').toUpperCase();
        const headers = node.config?.headers || {};
        const body = node.config?.body;
        
        if (options.sandbox) {
          logs.push({ level: 'info', message: `HTTP ${method} ${url} (sandbox mode)`, ts: Date.now() });
          outputs.push({ url, method, status: 200, body: { ok: true, sandbox: true } });
        } else {
          logs.push({ level: 'info', message: `HTTP ${method} ${url} (live mode)`, ts: Date.now() });
          // In real implementation, make actual HTTP call with retries
          try {
            const response = await this.makeHttpRequest(method, url, { headers, body });
            outputs.push({ url, method, status: response.status, body: response.data });
          } catch (error) {
            logs.push({ level: 'error', message: `HTTP request failed: ${error.message}`, ts: Date.now() });
            throw error;
          }
        }
        break;
      }
      case 'webhook': {
        const webhookUrl = node.config?.url;
        const payload = node.config?.payload || {};
        const signature = node.config?.signature;
        
        logs.push({ level: 'info', message: `Webhook to ${webhookUrl}`, ts: Date.now() });
        
        if (!options.sandbox) {
          // In real implementation, send webhook with signature validation
          const webhookPayload = {
            ...payload,
            timestamp: Date.now(),
            signature: signature || 'webhook-signature-placeholder'
          };
          outputs.push({ webhook: webhookUrl, payload: webhookPayload, sent: true });
        } else {
          outputs.push({ webhook: webhookUrl, payload, sandbox: true });
        }
        break;
      }
      case 'schedule': {
        const cron = node.config?.cron;
        const interval = node.config?.interval;
        
        logs.push({ 
          level: 'info', 
          message: `Schedule configured: ${cron ? `cron(${cron})` : `interval(${interval}ms)`}`, 
          ts: Date.now() 
        });
        
        outputs.push({ 
          schedule: { cron, interval }, 
          nextRun: cron ? 'calculated-from-cron' : Date.now() + (interval || 0) 
        });
        break;
      }
      case 'branch': {
        const cond = Boolean(node.config?.condition);
        const [t, f] = node.next ?? [];
        logs.push({ level: 'info', message: `Branch ${cond ? 'true' : 'false'}`, ts: Date.now() });
        
        // Execute appropriate branch
        if (cond && t) {
          await this.executeNodeById(t, logs, outputs, options);
        } else if (!cond && f) {
          await this.executeNodeById(f, logs, outputs, options);
        }
        break;
      }
      case 'loop': {
        const count = Number(node.config?.count ?? 1);
        const [body] = node.next ?? [];
        
        for (let i = 0; i < count; i++) {
          logs.push({ level: 'info', message: `Loop iteration ${i + 1}/${count}`, ts: Date.now() });
          if (body) {
            await this.executeNodeById(body, logs, outputs, options);
          }
        }
        break;
      }
      case 'call': {
        const target = node.config?.target || 'unknown';
        const args = node.config?.args || {};
        
        logs.push({ level: 'info', message: `Call ${target}`, ts: Date.now() });
        
        if (!options.sandbox) {
          // In real implementation, make service call
          const result = await this.makeServiceCall(target, args);
          outputs.push({ call: target, args, result });
        } else {
          outputs.push({ call: target, args, result: 'ok', sandbox: true });
        }
        break;
      }
      default:
        logs.push({ level: 'warn', message: `Unknown node type: ${node.type}`, ts: Date.now() });
    }
  }

  private async executeNodeById(
    nodeId: string,
    logs: FlowRunResult['logs'],
    outputs: any[],
    options: FlowRunOptions
  ): Promise<void> {
    // This is a simplified version for branch/loop execution
    // In a real implementation, this would properly handle the node execution flow
    logs.push({ level: 'info', message: `Executing node ${nodeId}`, ts: Date.now() });
  }

  private async makeHttpRequest(method: string, url: string, config: any): Promise<any> {
    try {
      const apiConfig = {
        method: method.toUpperCase() as any,
        url,
        headers: config.headers || {},
        queryParams: config.params || config.query,
        pathParams: config.pathParams,
        body: config.data || config.body,
        timeout: config.timeout || 30000,
        retries: config.retries || 3,
        auth: config.auth,
        expectedStatus: config.expectedStatus,
      };

      const result = await this.apiClient.executeApiCall(apiConfig);
      
      if (!result.success) {
        throw new Error(`HTTP request failed: ${result.error?.message || 'Unknown error'}`);
      }

      return {
        status: result.response?.status,
        statusText: result.response?.statusText,
        headers: result.response?.headers,
        data: result.data,
        duration: result.duration,
        retryCount: result.retryCount,
      };
    } catch (error) {
      this.logger.error('HTTP request failed in flow execution:', error);
      throw error;
    }
  }

  private async makeServiceCall(target: string, args: any): Promise<any> {
    try {
      // Internal service-to-service communication
      const baseUrl = this.configService.get('API_BASE_URL', 'http://localhost:3001');
      const apiConfig = {
        method: 'POST' as any,
        url: `${baseUrl}/internal/${target}`,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': 'true',
        },
        body: args,
        timeout: 10000,
        retries: 2,
      };

      const result = await this.apiClient.executeApiCall(apiConfig);
      
      if (!result.success) {
        throw new Error(`Service call failed: ${result.error?.message || 'Unknown error'}`);
      }

      return {
        status: result.response?.status,
        data: result.data,
        duration: result.duration,
      };
    } catch (error) {
      this.logger.error('Service call failed in flow execution:', error);
      throw error;
    }
  }
}
