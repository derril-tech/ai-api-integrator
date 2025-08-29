import { log } from '@temporalio/activity';
import axios, { AxiosResponse } from 'axios';

// Activity result interface
export interface ActivityResult {
  success: boolean;
  data?: any;
  error?: string;
  variables?: Record<string, any>;
  nextNodeId?: string; // For branch nodes
  duration?: number;
}

/**
 * Execute HTTP request node
 */
export async function executeHttpNode(
  config: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    params?: Record<string, any>;
    data?: any;
    timeout?: number;
    auth?: {
      type: string;
      token?: string;
      username?: string;
      password?: string;
    };
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();
  
  try {
    log.info(`Executing HTTP request: ${config.method} ${config.url}`);

    // Replace variables in URL and config
    const processedConfig = replaceVariables(config, variables);

    // Prepare axios config
    const axiosConfig: any = {
      method: processedConfig.method.toLowerCase(),
      url: processedConfig.url,
      headers: processedConfig.headers || {},
      params: processedConfig.params,
      data: processedConfig.data,
      timeout: processedConfig.timeout || 30000,
      validateStatus: (status: number) => status < 500, // Don't throw on 4xx errors
    };

    // Add authentication
    if (processedConfig.auth) {
      switch (processedConfig.auth.type) {
        case 'bearer':
          axiosConfig.headers.Authorization = `Bearer ${processedConfig.auth.token}`;
          break;
        case 'basic':
          axiosConfig.auth = {
            username: processedConfig.auth.username,
            password: processedConfig.auth.password,
          };
          break;
      }
    }

    const response: AxiosResponse = await axios(axiosConfig);
    const duration = Date.now() - startTime;

    log.info(`HTTP request completed: ${response.status} ${response.statusText}`, {
      duration,
      dataSize: JSON.stringify(response.data).length,
    });

    return {
      success: response.status < 400,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
      },
      duration,
      variables: {
        [`http_${config.method.toLowerCase()}_status`]: response.status,
        [`http_${config.method.toLowerCase()}_data`]: response.data,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`HTTP request failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Execute data transformation node
 */
export async function executeTransformNode(
  config: {
    script: string;
    inputVariable?: string;
    outputVariable?: string;
    language?: 'javascript' | 'jsonpath' | 'jq';
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();

  try {
    log.info('Executing transform node', { language: config.language || 'javascript' });

    let result: any;
    const inputData = config.inputVariable ? variables[config.inputVariable] : variables;

    switch (config.language || 'javascript') {
      case 'javascript':
        // Safe JavaScript execution (in production, use a proper sandbox)
        const func = new Function('data', 'variables', config.script);
        result = func(inputData, variables);
        break;

      case 'jsonpath':
        // Simple JSONPath implementation (in production, use a proper library)
        const JSONPath = require('jsonpath-plus');
        result = JSONPath.JSONPath({ path: config.script, json: inputData });
        break;

      case 'jq':
        // JQ-style transformation (would need jq library in production)
        log.warn('JQ transformation not implemented, using identity transform');
        result = inputData;
        break;

      default:
        throw new Error(`Unsupported transformation language: ${config.language}`);
    }

    const duration = Date.now() - startTime;
    const outputVariable = config.outputVariable || 'transform_result';

    log.info('Transform completed', { duration, outputVariable });

    return {
      success: true,
      data: result,
      duration,
      variables: {
        [outputVariable]: result,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`Transform failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Execute delay node
 */
export async function executeDelayNode(
  config: {
    duration: number; // milliseconds
    unit?: 'ms' | 's' | 'm' | 'h';
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();

  try {
    let delayMs = config.duration;

    // Convert to milliseconds based on unit
    switch (config.unit) {
      case 's':
        delayMs *= 1000;
        break;
      case 'm':
        delayMs *= 60 * 1000;
        break;
      case 'h':
        delayMs *= 60 * 60 * 1000;
        break;
      case 'ms':
      default:
        // Already in milliseconds
        break;
    }

    log.info(`Executing delay: ${delayMs}ms`);

    await new Promise(resolve => setTimeout(resolve, delayMs));

    const duration = Date.now() - startTime;

    return {
      success: true,
      data: { delayMs },
      duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`Delay failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Execute branch/conditional node
 */
export async function executeBranchNode(
  config: {
    condition: string;
    trueNodeId: string;
    falseNodeId: string;
    language?: 'javascript' | 'simple';
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();

  try {
    log.info('Executing branch node', { condition: config.condition });

    let conditionResult: boolean;

    switch (config.language || 'javascript') {
      case 'javascript':
        // Safe JavaScript execution for condition
        const func = new Function('variables', `return ${config.condition}`);
        conditionResult = Boolean(func(variables));
        break;

      case 'simple':
        // Simple condition evaluation (e.g., "variable > 10")
        conditionResult = evaluateSimpleCondition(config.condition, variables);
        break;

      default:
        throw new Error(`Unsupported condition language: ${config.language}`);
    }

    const nextNodeId = conditionResult ? config.trueNodeId : config.falseNodeId;
    const duration = Date.now() - startTime;

    log.info(`Branch condition evaluated: ${conditionResult}`, { nextNodeId, duration });

    return {
      success: true,
      data: { condition: conditionResult, nextNodeId },
      duration,
      nextNodeId,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`Branch evaluation failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Execute loop node
 */
export async function executeLoopNode(
  config: {
    condition: string;
    maxIterations?: number;
    bodyNodeId: string;
    language?: 'javascript' | 'simple';
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();

  try {
    log.info('Executing loop node', { condition: config.condition, maxIterations: config.maxIterations });

    const iterations: any[] = [];
    let iterationCount = 0;
    const maxIterations = config.maxIterations || 100;

    while (iterationCount < maxIterations) {
      let shouldContinue: boolean;

      switch (config.language || 'javascript') {
        case 'javascript':
          const func = new Function('variables', 'iteration', `return ${config.condition}`);
          shouldContinue = Boolean(func(variables, iterationCount));
          break;

        case 'simple':
          shouldContinue = evaluateSimpleCondition(config.condition, { ...variables, iteration: iterationCount });
          break;

        default:
          throw new Error(`Unsupported condition language: ${config.language}`);
      }

      if (!shouldContinue) {
        break;
      }

      iterations.push({
        iteration: iterationCount,
        timestamp: Date.now(),
      });

      iterationCount++;
    }

    const duration = Date.now() - startTime;

    log.info(`Loop completed: ${iterationCount} iterations`, { duration });

    return {
      success: true,
      data: { iterations: iterationCount, details: iterations },
      duration,
      variables: {
        loop_iterations: iterationCount,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`Loop execution failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Execute service call node
 */
export async function executeCallNode(
  config: {
    service: string;
    method: string;
    args?: any;
    timeout?: number;
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();

  try {
    log.info(`Executing service call: ${config.service}.${config.method}`);

    // Process arguments with variable substitution
    const processedArgs = replaceVariables(config.args || {}, variables);

    // In a real implementation, this would call the actual service
    // For now, we'll simulate the call
    const result = {
      service: config.service,
      method: config.method,
      args: processedArgs,
      timestamp: Date.now(),
      success: true,
    };

    const duration = Date.now() - startTime;

    log.info(`Service call completed: ${config.service}.${config.method}`, { duration });

    return {
      success: true,
      data: result,
      duration,
      variables: {
        [`call_${config.service}_${config.method}_result`]: result,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`Service call failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Execute webhook node
 */
export async function executeWebhookNode(
  config: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    payload?: any;
    timeout?: number;
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();

  try {
    log.info(`Executing webhook: ${config.method || 'POST'} ${config.url}`);

    const processedConfig = replaceVariables(config, variables);

    const response = await axios({
      method: (processedConfig.method || 'POST').toLowerCase(),
      url: processedConfig.url,
      headers: {
        'Content-Type': 'application/json',
        ...processedConfig.headers,
      },
      data: processedConfig.payload,
      timeout: processedConfig.timeout || 30000,
    });

    const duration = Date.now() - startTime;

    log.info(`Webhook completed: ${response.status}`, { duration });

    return {
      success: response.status < 400,
      data: {
        status: response.status,
        response: response.data,
      },
      duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`Webhook failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Execute schedule node
 */
export async function executeScheduleNode(
  config: {
    cron?: string;
    interval?: number;
    timezone?: string;
    nextExecution?: number;
  },
  variables: Record<string, any>
): Promise<ActivityResult> {
  const startTime = Date.now();

  try {
    log.info('Executing schedule node', { cron: config.cron, interval: config.interval });

    // Calculate next execution time
    let nextExecution: number;

    if (config.cron) {
      // Parse cron expression (would use a proper cron library in production)
      nextExecution = Date.now() + 60000; // Placeholder: 1 minute from now
    } else if (config.interval) {
      nextExecution = Date.now() + config.interval;
    } else {
      throw new Error('Schedule node requires either cron or interval configuration');
    }

    const duration = Date.now() - startTime;

    log.info(`Schedule calculated: next execution at ${new Date(nextExecution).toISOString()}`, { duration });

    return {
      success: true,
      data: {
        nextExecution,
        scheduledAt: new Date(nextExecution).toISOString(),
      },
      duration,
      variables: {
        schedule_next_execution: nextExecution,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error(`Schedule calculation failed: ${errorMessage}`, { duration });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

// Helper functions
function replaceVariables(obj: any, variables: Record<string, any>): any {
  if (typeof obj === 'string') {
    return obj.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? String(variables[varName]) : match;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(item => replaceVariables(item, variables));
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceVariables(value, variables);
    }
    return result;
  }

  return obj;
}

function evaluateSimpleCondition(condition: string, variables: Record<string, any>): boolean {
  // Simple condition parser (e.g., "variable > 10", "status == 'success'")
  // In production, use a proper expression parser
  
  const operators = ['>=', '<=', '==', '!=', '>', '<'];
  let operator = '';
  let parts: string[] = [];

  for (const op of operators) {
    if (condition.includes(op)) {
      operator = op;
      parts = condition.split(op).map(p => p.trim());
      break;
    }
  }

  if (parts.length !== 2) {
    throw new Error(`Invalid condition format: ${condition}`);
  }

  const left = getValue(parts[0], variables);
  const right = getValue(parts[1], variables);

  switch (operator) {
    case '>':
      return Number(left) > Number(right);
    case '<':
      return Number(left) < Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<=':
      return Number(left) <= Number(right);
    case '==':
      return left == right;
    case '!=':
      return left != right;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

function getValue(expr: string, variables: Record<string, any>): any {
  // Remove quotes if present
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }

  // Check if it's a number
  if (!isNaN(Number(expr))) {
    return Number(expr);
  }

  // Check if it's a boolean
  if (expr === 'true') return true;
  if (expr === 'false') return false;

  // Assume it's a variable name
  return variables[expr];
}
