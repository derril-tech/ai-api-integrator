import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { NativeConnection } from '@temporalio/worker';

export interface TemporalConfig {
  serverUrl: string;
  namespace: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  serverRootCaCertPath?: string;
  identity?: string;
}

export interface WorkflowExecutionOptions {
  workflowId: string;
  taskQueue: string;
  workflowType: string;
  args?: any[];
  searchAttributes?: Record<string, string | number | boolean>;
  memo?: Record<string, any>;
  cronSchedule?: string;
  workflowExecutionTimeout?: string;
  workflowRunTimeout?: string;
  workflowTaskTimeout?: string;
}

export interface WorkflowExecutionResult {
  workflowId: string;
  runId: string;
  result?: any;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'terminated' | 'timed_out';
  startTime: Date;
  endTime?: Date;
  error?: string;
}

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemporalClientService.name);
  private client: Client | null = null;
  private connection: Connection | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Connect to Temporal server
   */
  async connect(): Promise<void> {
    try {
      const config = this.getTemporalConfig();
      
      if (!config.serverUrl) {
        this.logger.warn('Temporal server URL not configured, skipping connection');
        return;
      }

      this.logger.log(`Connecting to Temporal server: ${config.serverUrl}`);

      // Create connection
      const connectionOptions: any = {
        address: config.serverUrl,
      };

      // Add TLS configuration if provided
      if (config.clientCertPath && config.clientKeyPath) {
        const fs = require('fs');
        connectionOptions.tls = {
          clientCertPair: {
            crt: fs.readFileSync(config.clientCertPath),
            key: fs.readFileSync(config.clientKeyPath),
          },
        };

        if (config.serverRootCaCertPath) {
          connectionOptions.tls.serverRootCACertificate = fs.readFileSync(config.serverRootCaCertPath);
        }
      }

      this.connection = await Connection.connect(connectionOptions);

      // Create client
      this.client = new Client({
        connection: this.connection,
        namespace: config.namespace,
        identity: config.identity || 'ai-api-integrator',
      });

      this.isConnected = true;
      this.logger.log('Successfully connected to Temporal server');

    } catch (error) {
      this.logger.error('Failed to connect to Temporal server:', error);
      this.isConnected = false;
      
      // In development, we can continue without Temporal
      if (this.configService.get('NODE_ENV') === 'development') {
        this.logger.warn('Continuing without Temporal connection in development mode');
      } else {
        throw error;
      }
    }
  }

  /**
   * Disconnect from Temporal server
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.client = null;
      this.isConnected = false;
      this.logger.log('Disconnected from Temporal server');
    } catch (error) {
      this.logger.error('Error disconnecting from Temporal server:', error);
    }
  }

  /**
   * Check if connected to Temporal
   */
  isTemporalConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Start a workflow execution
   */
  async startWorkflow(options: WorkflowExecutionOptions): Promise<WorkflowExecutionResult> {
    if (!this.isTemporalConnected()) {
      throw new Error('Temporal client is not connected');
    }

    try {
      this.logger.debug(`Starting workflow: ${options.workflowType}`, {
        workflowId: options.workflowId,
        taskQueue: options.taskQueue,
      });

      const handle = await this.client!.workflow.start(options.workflowType, {
        workflowId: options.workflowId,
        taskQueue: options.taskQueue,
        args: options.args || [],
        searchAttributes: options.searchAttributes,
        memo: options.memo,
        cronSchedule: options.cronSchedule,
        workflowExecutionTimeout: options.workflowExecutionTimeout,
        workflowRunTimeout: options.workflowRunTimeout,
        workflowTaskTimeout: options.workflowTaskTimeout,
      });

      return {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId,
        status: 'running',
        startTime: new Date(),
      };

    } catch (error) {
      this.logger.error('Failed to start workflow:', error);
      throw error;
    }
  }

  /**
   * Get workflow handle
   */
  async getWorkflowHandle(workflowId: string, runId?: string): Promise<WorkflowHandle | null> {
    if (!this.isTemporalConnected()) {
      return null;
    }

    try {
      return this.client!.workflow.getHandle(workflowId, runId);
    } catch (error) {
      this.logger.error('Failed to get workflow handle:', error);
      return null;
    }
  }

  /**
   * Get workflow result
   */
  async getWorkflowResult(workflowId: string, runId?: string): Promise<WorkflowExecutionResult> {
    const handle = await this.getWorkflowHandle(workflowId, runId);
    
    if (!handle) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    try {
      const description = await handle.describe();
      
      let result: any;
      let error: string | undefined;
      
      if (description.status.name === 'COMPLETED') {
        try {
          result = await handle.result();
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
      }

      return {
        workflowId: handle.workflowId,
        runId: description.runId,
        result,
        status: this.mapTemporalStatus(description.status.name),
        startTime: description.startTime,
        endTime: description.closeTime,
        error,
      };

    } catch (error) {
      this.logger.error('Failed to get workflow result:', error);
      throw error;
    }
  }

  /**
   * Cancel workflow execution
   */
  async cancelWorkflow(workflowId: string, runId?: string): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId, runId);
    
    if (!handle) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    try {
      await handle.cancel();
      this.logger.log(`Cancelled workflow: ${workflowId}`);
    } catch (error) {
      this.logger.error('Failed to cancel workflow:', error);
      throw error;
    }
  }

  /**
   * Terminate workflow execution
   */
  async terminateWorkflow(workflowId: string, reason?: string, runId?: string): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId, runId);
    
    if (!handle) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    try {
      await handle.terminate(reason);
      this.logger.log(`Terminated workflow: ${workflowId}`, { reason });
    } catch (error) {
      this.logger.error('Failed to terminate workflow:', error);
      throw error;
    }
  }

  /**
   * Signal workflow
   */
  async signalWorkflow(workflowId: string, signalName: string, args?: any[], runId?: string): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId, runId);
    
    if (!handle) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    try {
      await handle.signal(signalName, ...(args || []));
      this.logger.debug(`Sent signal to workflow: ${workflowId}`, { signalName, args });
    } catch (error) {
      this.logger.error('Failed to signal workflow:', error);
      throw error;
    }
  }

  /**
   * Query workflow
   */
  async queryWorkflow(workflowId: string, queryName: string, args?: any[], runId?: string): Promise<any> {
    const handle = await this.getWorkflowHandle(workflowId, runId);
    
    if (!handle) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    try {
      const result = await handle.query(queryName, ...(args || []));
      this.logger.debug(`Queried workflow: ${workflowId}`, { queryName, args });
      return result;
    } catch (error) {
      this.logger.error('Failed to query workflow:', error);
      throw error;
    }
  }

  /**
   * List workflow executions
   */
  async listWorkflows(query?: string): Promise<WorkflowExecutionResult[]> {
    if (!this.isTemporalConnected()) {
      return [];
    }

    try {
      const executions = this.client!.workflow.list({ query });
      const results: WorkflowExecutionResult[] = [];

      for await (const execution of executions) {
        results.push({
          workflowId: execution.workflowId,
          runId: execution.runId,
          status: this.mapTemporalStatus(execution.status.name),
          startTime: execution.startTime,
          endTime: execution.closeTime,
        });
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to list workflows:', error);
      return [];
    }
  }

  // Private helper methods
  private getTemporalConfig(): TemporalConfig {
    return {
      serverUrl: this.configService.get('TEMPORAL_SERVER_URL', ''),
      namespace: this.configService.get('TEMPORAL_NAMESPACE', 'default'),
      clientCertPath: this.configService.get('TEMPORAL_CLIENT_CERT_PATH'),
      clientKeyPath: this.configService.get('TEMPORAL_CLIENT_KEY_PATH'),
      serverRootCaCertPath: this.configService.get('TEMPORAL_SERVER_ROOT_CA_CERT_PATH'),
      identity: this.configService.get('TEMPORAL_IDENTITY', 'ai-api-integrator'),
    };
  }

  private mapTemporalStatus(temporalStatus: string): WorkflowExecutionResult['status'] {
    switch (temporalStatus) {
      case 'RUNNING':
        return 'running';
      case 'COMPLETED':
        return 'completed';
      case 'FAILED':
        return 'failed';
      case 'CANCELED':
        return 'cancelled';
      case 'TERMINATED':
        return 'terminated';
      case 'TIMED_OUT':
        return 'timed_out';
      default:
        return 'running';
    }
  }
}
