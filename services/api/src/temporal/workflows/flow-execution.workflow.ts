import { 
  defineSignal, 
  defineQuery, 
  setHandler, 
  condition, 
  sleep,
  proxyActivities,
  log,
  workflowInfo,
  continueAsNew,
} from '@temporalio/workflow';

// Import activity types
import type * as activities from '../activities/flow-activities';

// Define signals and queries
export const pauseSignal = defineSignal('pause');
export const resumeSignal = defineSignal('resume');
export const cancelSignal = defineSignal('cancel');
export const updateVariablesSignal = defineSignal<[Record<string, any>]>('updateVariables');

export const getStatusQuery = defineQuery<string>('getStatus');
export const getProgressQuery = defineQuery<number>('getProgress');
export const getVariablesQuery = defineQuery<Record<string, any>>('getVariables');
export const getLogsQuery = defineQuery<Array<{ level: string; message: string; timestamp: number }>>('getLogs');

// Workflow state
interface WorkflowState {
  status: 'running' | 'paused' | 'cancelled' | 'completed' | 'failed';
  progress: number;
  variables: Record<string, any>;
  logs: Array<{ level: string; message: string; timestamp: number }>;
  currentNodeId?: string;
  error?: string;
}

// Flow execution input
export interface FlowExecutionInput {
  flowDefinition: {
    id: string;
    name: string;
    nodes: Array<{
      id: string;
      type: string;
      config: Record<string, any>;
      next?: string[];
      retryPolicy?: {
        maxAttempts: number;
        backoffMs: number;
        jitter: boolean;
      };
    }>;
    entry: string;
  };
  options: {
    variables?: Record<string, any>;
    timeoutMs?: number;
    maxRetries?: number;
  };
}

// Workflow result
export interface FlowExecutionResult {
  flowId: string;
  success: boolean;
  outputs: any[];
  logs: Array<{ level: string; message: string; timestamp: number }>;
  durationMs: number;
  finalVariables: Record<string, any>;
}

/**
 * Main flow execution workflow
 */
export async function flowExecutionWorkflow(input: FlowExecutionInput): Promise<FlowExecutionResult> {
  const { workflowId } = workflowInfo();
  const startTime = Date.now();
  
  // Initialize workflow state
  const state: WorkflowState = {
    status: 'running',
    progress: 0,
    variables: input.options.variables || {},
    logs: [],
    currentNodeId: input.flowDefinition.entry,
  };

  // Set up activity proxy with retry policies
  const { 
    executeHttpNode,
    executeTransformNode,
    executeDelayNode,
    executeBranchNode,
    executeLoopNode,
    executeCallNode,
    executeWebhookNode,
    executeScheduleNode,
  } = proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    retry: {
      initialInterval: '1 second',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  });

  // Set up signal and query handlers
  setHandler(pauseSignal, () => {
    if (state.status === 'running') {
      state.status = 'paused';
      addLog('info', 'Workflow paused');
    }
  });

  setHandler(resumeSignal, () => {
    if (state.status === 'paused') {
      state.status = 'running';
      addLog('info', 'Workflow resumed');
    }
  });

  setHandler(cancelSignal, () => {
    state.status = 'cancelled';
    addLog('info', 'Workflow cancelled');
  });

  setHandler(updateVariablesSignal, (variables: Record<string, any>) => {
    state.variables = { ...state.variables, ...variables };
    addLog('info', `Variables updated: ${Object.keys(variables).join(', ')}`);
  });

  setHandler(getStatusQuery, () => state.status);
  setHandler(getProgressQuery, () => state.progress);
  setHandler(getVariablesQuery, () => state.variables);
  setHandler(getLogsQuery, () => state.logs);

  // Helper function to add logs
  function addLog(level: 'info' | 'warn' | 'error', message: string) {
    const logEntry = {
      level,
      message,
      timestamp: Date.now(),
    };
    state.logs.push(logEntry);
    log[level](`[${input.flowDefinition.name}] ${message}`);
  }

  addLog('info', `Starting flow execution: ${input.flowDefinition.name}`);

  try {
    const outputs: any[] = [];
    const totalNodes = input.flowDefinition.nodes.length;
    let processedNodes = 0;

    // Execute flow nodes
    await executeFlowNodes(
      input.flowDefinition.nodes,
      input.flowDefinition.entry,
      state,
      outputs,
      {
        executeHttpNode,
        executeTransformNode,
        executeDelayNode,
        executeBranchNode,
        executeLoopNode,
        executeCallNode,
        executeWebhookNode,
        executeScheduleNode,
      },
      () => {
        processedNodes++;
        state.progress = Math.round((processedNodes / totalNodes) * 100);
      }
    );

    // Check if workflow was cancelled
    if (state.status === 'cancelled') {
      addLog('info', 'Flow execution cancelled');
      return {
        flowId: input.flowDefinition.id,
        success: false,
        outputs,
        logs: state.logs,
        durationMs: Date.now() - startTime,
        finalVariables: state.variables,
      };
    }

    state.status = 'completed';
    addLog('info', 'Flow execution completed successfully');

    return {
      flowId: input.flowDefinition.id,
      success: true,
      outputs,
      logs: state.logs,
      durationMs: Date.now() - startTime,
      finalVariables: state.variables,
    };

  } catch (error) {
    state.status = 'failed';
    state.error = error instanceof Error ? error.message : String(error);
    addLog('error', `Flow execution failed: ${state.error}`);

    return {
      flowId: input.flowDefinition.id,
      success: false,
      outputs: [],
      logs: state.logs,
      durationMs: Date.now() - startTime,
      finalVariables: state.variables,
    };
  }
}

/**
 * Execute flow nodes recursively
 */
async function executeFlowNodes(
  nodes: FlowExecutionInput['flowDefinition']['nodes'],
  currentNodeId: string,
  state: WorkflowState,
  outputs: any[],
  activities: any,
  onNodeProcessed: () => void
): Promise<void> {
  const visited = new Set<string>();
  const nodeMap = new Map(nodes.map(node => [node.id, node]));

  async function executeNode(nodeId: string): Promise<void> {
    // Check for cancellation
    if (state.status === 'cancelled') {
      return;
    }

    // Wait if paused
    await condition(() => state.status !== 'paused');

    // Prevent infinite loops
    if (visited.has(nodeId)) {
      return;
    }

    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    visited.add(nodeId);
    state.currentNodeId = nodeId;

    log.info(`Executing node: ${node.id} (${node.type})`);

    try {
      let result: any;

      // Execute node based on type
      switch (node.type) {
        case 'http':
          result = await activities.executeHttpNode(node.config, state.variables);
          break;
        case 'transform':
          result = await activities.executeTransformNode(node.config, state.variables);
          break;
        case 'delay':
          result = await activities.executeDelayNode(node.config, state.variables);
          break;
        case 'branch':
          result = await activities.executeBranchNode(node.config, state.variables);
          break;
        case 'loop':
          result = await activities.executeLoopNode(node.config, state.variables);
          break;
        case 'call':
          result = await activities.executeCallNode(node.config, state.variables);
          break;
        case 'webhook':
          result = await activities.executeWebhookNode(node.config, state.variables);
          break;
        case 'schedule':
          result = await activities.executeScheduleNode(node.config, state.variables);
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      // Store result
      outputs.push({
        nodeId: node.id,
        type: node.type,
        result,
        timestamp: Date.now(),
      });

      // Update variables if result contains them
      if (result && typeof result === 'object' && result.variables) {
        state.variables = { ...state.variables, ...result.variables };
      }

      onNodeProcessed();

      // Execute next nodes
      if (node.next && node.next.length > 0) {
        // For branch nodes, the result might specify which path to take
        if (node.type === 'branch' && result && result.nextNodeId) {
          await executeNode(result.nextNodeId);
        } else {
          // Execute all next nodes (parallel execution)
          await Promise.all(node.next.map(nextNodeId => executeNode(nextNodeId)));
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Node execution failed: ${node.id} - ${errorMessage}`);

      // Apply retry policy if configured
      if (node.retryPolicy && node.retryPolicy.maxAttempts > 1) {
        // Temporal will handle retries automatically based on activity retry policy
        throw error;
      } else {
        // Store error and continue with next nodes if any
        outputs.push({
          nodeId: node.id,
          type: node.type,
          error: errorMessage,
          timestamp: Date.now(),
        });

        onNodeProcessed();

        // Continue with next nodes even if this one failed (depending on flow design)
        if (node.next && node.next.length > 0) {
          await Promise.all(node.next.map(nextNodeId => executeNode(nextNodeId)));
        }
      }
    }
  }

  await executeNode(currentNodeId);
}

/**
 * Scheduled flow execution workflow (for cron jobs)
 */
export async function scheduledFlowExecutionWorkflow(input: FlowExecutionInput): Promise<void> {
  const result = await flowExecutionWorkflow(input);
  
  // Log the result
  log.info(`Scheduled flow execution completed: ${input.flowDefinition.name}`, {
    success: result.success,
    duration: result.durationMs,
  });

  // Continue as new for recurring executions
  if (input.flowDefinition.nodes.some(node => node.type === 'schedule' && node.config.recurring)) {
    await continueAsNew<typeof scheduledFlowExecutionWorkflow>(input);
  }
}
