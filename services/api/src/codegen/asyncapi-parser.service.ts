import { Injectable, BadRequestException } from '@nestjs/common';

export interface AsyncAPISpec {
  asyncapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Record<string, AsyncAPIServer>;
  channels: Record<string, AsyncAPIChannel>;
  components?: {
    schemas?: Record<string, AsyncAPISchema>;
    messages?: Record<string, AsyncAPIMessage>;
    securitySchemes?: Record<string, AsyncAPISecurityScheme>;
    parameters?: Record<string, AsyncAPIParameter>;
  };
  defaultContentType?: string;
}

export interface AsyncAPIServer {
  url: string;
  protocol: string;
  protocolVersion?: string;
  description?: string;
  variables?: Record<string, AsyncAPIServerVariable>;
  security?: Array<Record<string, string[]>>;
  bindings?: Record<string, any>;
}

export interface AsyncAPIServerVariable {
  default?: string;
  description?: string;
  enum?: string[];
}

export interface AsyncAPIChannel {
  description?: string;
  subscribe?: AsyncAPIOperation;
  publish?: AsyncAPIOperation;
  parameters?: Record<string, AsyncAPIParameter>;
  bindings?: Record<string, any>;
}

export interface AsyncAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: AsyncAPITag[];
  externalDocs?: AsyncAPIExternalDocumentation;
  bindings?: Record<string, any>;
  message?: AsyncAPIMessage | AsyncAPIMessageReference;
}

export interface AsyncAPITag {
  name: string;
  description?: string;
  externalDocs?: AsyncAPIExternalDocumentation;
}

export interface AsyncAPIExternalDocumentation {
  description?: string;
  url: string;
}

export interface AsyncAPIMessage {
  messageId?: string;
  headers?: AsyncAPISchema;
  payload?: AsyncAPISchema;
  correlationId?: AsyncAPICorrelationId;
  schemaFormat?: string;
  contentType?: string;
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  tags?: AsyncAPITag[];
  externalDocs?: AsyncAPIExternalDocumentation;
  bindings?: Record<string, any>;
  examples?: AsyncAPIMessageExample[];
}

export interface AsyncAPIMessageReference {
  $ref: string;
}

export interface AsyncAPIMessageExample {
  name?: string;
  summary?: string;
  headers?: any;
  payload?: any;
}

export interface AsyncAPISchema {
  $ref?: string;
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  properties?: Record<string, AsyncAPISchema>;
  required?: string[];
  items?: AsyncAPISchema;
  enum?: any[];
  allOf?: AsyncAPISchema[];
  oneOf?: AsyncAPISchema[];
  anyOf?: AsyncAPISchema[];
  not?: AsyncAPISchema;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | AsyncAPISchema;
}

export interface AsyncAPICorrelationId {
  description?: string;
  location: string;
}

export interface AsyncAPIParameter {
  description?: string;
  schema?: AsyncAPISchema;
  location?: string;
}

export interface AsyncAPISecurityScheme {
  type: 'userPassword' | 'apiKey' | 'X509' | 'symmetricEncryption' | 'asymmetricEncryption' | 'httpApiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'user' | 'password' | 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: AsyncAPIOAuthFlows;
  openIdConnectUrl?: string;
}

export interface AsyncAPIOAuthFlows {
  implicit?: AsyncAPIOAuthFlow;
  password?: AsyncAPIOAuthFlow;
  clientCredentials?: AsyncAPIOAuthFlow;
  authorizationCode?: AsyncAPIOAuthFlow;
}

export interface AsyncAPIOAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface ParsedAsyncAPISpec {
  title: string;
  version: string;
  description?: string;
  servers: ParsedAsyncAPIServer[];
  channels: ParsedAsyncAPIChannel[];
  messages: ParsedAsyncAPIMessage[];
  securitySchemes: ParsedAsyncAPISecurityScheme[];
  defaultContentType?: string;
}

export interface ParsedAsyncAPIServer {
  name: string;
  url: string;
  protocol: string;
  protocolVersion?: string;
  description?: string;
  security: string[];
}

export interface ParsedAsyncAPIChannel {
  name: string;
  path: string;
  description?: string;
  subscribe?: ParsedAsyncAPIOperation;
  publish?: ParsedAsyncAPIOperation;
  parameters: ParsedAsyncAPIParameter[];
}

export interface ParsedAsyncAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  message?: ParsedAsyncAPIMessage;
}

export interface ParsedAsyncAPIMessage {
  name: string;
  title?: string;
  summary?: string;
  description?: string;
  headersSchema?: ParsedAsyncAPISchema;
  payloadSchema?: ParsedAsyncAPISchema;
  contentType?: string;
  examples?: ParsedAsyncAPIMessageExample[];
}

export interface ParsedAsyncAPIMessageExample {
  name?: string;
  summary?: string;
  headers?: any;
  payload?: any;
}

export interface ParsedAsyncAPISchema {
  type: string;
  format?: string;
  title?: string;
  description?: string;
  properties?: Record<string, ParsedAsyncAPISchema>;
  required: string[];
  items?: ParsedAsyncAPISchema;
  enum?: any[];
  nullable: boolean;
  readOnly: boolean;
  writeOnly: boolean;
  deprecated: boolean;
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | ParsedAsyncAPISchema;
}

export interface ParsedAsyncAPIParameter {
  name: string;
  description?: string;
  schema?: ParsedAsyncAPISchema;
}

export interface ParsedAsyncAPISecurityScheme {
  name: string;
  type: string;
  description?: string;
  location?: string;
  scheme?: string;
}

@Injectable()
export class AsyncAPIParserService {
  private schemaRefs = new Map<string, ParsedAsyncAPISchema>();

  /**
   * Parse AsyncAPI specification from JSON string
   */
  async parseSpec(specContent: string): Promise<ParsedAsyncAPISpec> {
    try {
      const spec: AsyncAPISpec = JSON.parse(specContent);

      // Validate AsyncAPI version
      if (!spec.asyncapi || !spec.asyncapi.startsWith('2.')) {
        throw new BadRequestException('Only AsyncAPI 2.x specifications are supported');
      }

      // Clear previous refs
      this.schemaRefs.clear();

      // Parse components first (for $ref resolution)
      const messages = this.parseMessages(spec);
      const securitySchemes = this.parseSecuritySchemes(spec);

      // Parse servers and channels
      const servers = this.parseServers(spec);
      const channels = this.parseChannels(spec);

      return {
        title: spec.info.title,
        version: spec.info.version,
        description: spec.info.description,
        servers,
        channels,
        messages,
        securitySchemes,
        defaultContentType: spec.defaultContentType,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to parse AsyncAPI specification: ${error.message}`);
    }
  }

  private parseServers(spec: AsyncAPISpec): ParsedAsyncAPIServer[] {
    if (!spec.servers) return [];

    return Object.entries(spec.servers).map(([name, server]) => ({
      name,
      url: server.url,
      protocol: server.protocol,
      protocolVersion: server.protocolVersion,
      description: server.description,
      security: this.parseServerSecurity(server.security || []),
    }));
  }

  private parseServerSecurity(security: Array<Record<string, string[]>>): string[] {
    const schemes: string[] = [];
    for (const secReq of security) {
      schemes.push(...Object.keys(secReq));
    }
    return [...new Set(schemes)]; // Remove duplicates
  }

  private parseChannels(spec: AsyncAPISpec): ParsedAsyncAPIChannel[] {
    const channels: ParsedAsyncAPIChannel[] = [];

    for (const [path, channel] of Object.entries(spec.channels)) {
      channels.push({
        name: this.generateChannelName(path),
        path,
        description: channel.description,
        subscribe: channel.subscribe ? this.parseOperation(channel.subscribe) : undefined,
        publish: channel.publish ? this.parseOperation(channel.publish) : undefined,
        parameters: this.parseChannelParameters(channel.parameters || {}),
      });
    }

    return channels;
  }

  private generateChannelName(path: string): string {
    // Convert path to camelCase name
    return path
      .replace(/^\//, '') // Remove leading slash
      .replace(/\/+/g, '_') // Replace slashes with underscores
      .replace(/\{([^}]+)\}/g, '$1') // Remove curly braces from path params
      .replace(/[^a-zA-Z0-9_]/g, '') // Remove special characters
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .toLowerCase();
  }

  private parseOperation(operation: AsyncAPIOperation): ParsedAsyncAPIOperation {
    return {
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      message: operation.message ? this.parseMessage(operation.message) : undefined,
    };
  }

  private parseChannelParameters(parameters: Record<string, AsyncAPIParameter>): ParsedAsyncAPIParameter[] {
    return Object.entries(parameters).map(([name, param]) => ({
      name,
      description: param.description,
      schema: param.schema ? this.parseSchema(param.schema) : undefined,
    }));
  }

  private parseMessages(spec: AsyncAPISpec): ParsedAsyncAPIMessage[] {
    const messages: ParsedAsyncAPIMessage[] = [];

    if (spec.components?.messages) {
      for (const [name, message] of Object.entries(spec.components.messages)) {
        messages.push({
          name,
          title: message.title,
          summary: message.summary,
          description: message.description,
          headersSchema: message.headers ? this.parseSchema(message.headers) : undefined,
          payloadSchema: message.payload ? this.parseSchema(message.payload) : undefined,
          contentType: message.contentType,
          examples: message.examples?.map(ex => this.parseMessageExample(ex)),
        });
      }
    }

    return messages;
  }

  private parseMessage(message: AsyncAPIMessage | AsyncAPIMessageReference): ParsedAsyncAPIMessage {
    if ('$ref' in message) {
      // Handle reference - this would need to be resolved
      const refName = message.$ref.split('/').pop() || '';
      return { name: refName };
    }

    return {
      name: message.name || message.messageId || 'unknown',
      title: message.title,
      summary: message.summary,
      description: message.description,
      headersSchema: message.headers ? this.parseSchema(message.headers) : undefined,
      payloadSchema: message.payload ? this.parseSchema(message.payload) : undefined,
      contentType: message.contentType,
      examples: message.examples?.map(ex => this.parseMessageExample(ex)),
    };
  }

  private parseMessageExample(example: AsyncAPIMessageExample): ParsedAsyncAPIMessageExample {
    return {
      name: example.name,
      summary: example.summary,
      headers: example.headers,
      payload: example.payload,
    };
  }

  private parseSchema(schema?: AsyncAPISchema): ParsedAsyncAPISchema {
    if (!schema) {
      return {
        type: 'object',
        required: [],
        nullable: false,
        readOnly: false,
        writeOnly: false,
        deprecated: false,
      };
    }

    // Handle $ref
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop()!;
      if (this.schemaRefs.has(refName)) {
        return this.schemaRefs.get(refName)!;
      }

      // Return a placeholder that will be resolved later
      return {
        type: 'object',
        reference: refName,
        required: [],
        nullable: false,
        readOnly: false,
        writeOnly: false,
        deprecated: false,
      };
    }

    const parsed: ParsedAsyncAPISchema = {
      type: schema.type || 'object',
      format: schema.format,
      title: schema.title,
      description: schema.description,
      required: schema.required || [],
      nullable: schema.nullable || false,
      readOnly: schema.readOnly || false,
      writeOnly: schema.writeOnly || false,
      deprecated: schema.deprecated || false,
      default: schema.default,
      minimum: schema.minimum,
      maximum: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
      pattern: schema.pattern,
    };

    // Parse properties
    if (schema.properties) {
      parsed.properties = {};
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        parsed.properties[propName] = this.parseSchema(propSchema);
      }
    }

    // Parse items for arrays
    if (schema.items) {
      parsed.items = this.parseSchema(schema.items);
    }

    // Handle enum
    if (schema.enum) {
      parsed.enum = schema.enum;
    }

    // Handle additional properties
    if (schema.additionalProperties !== undefined) {
      if (typeof schema.additionalProperties === 'boolean') {
        parsed.additionalProperties = schema.additionalProperties;
      } else {
        parsed.additionalProperties = this.parseSchema(schema.additionalProperties);
      }
    }

    return parsed;
  }

  private parseSecuritySchemes(spec: AsyncAPISpec): ParsedAsyncAPISecurityScheme[] {
    const schemes: ParsedAsyncAPISecurityScheme[] = [];

    if (spec.components?.securitySchemes) {
      for (const [name, scheme] of Object.entries(spec.components.securitySchemes)) {
        schemes.push({
          name,
          type: scheme.type,
          description: scheme.description,
          location: scheme.in,
          scheme: scheme.scheme,
        });
      }
    }

    return schemes;
  }

  /**
   * Extract streaming patterns and capabilities
   */
  extractStreamingPatterns(spec: ParsedAsyncAPISpec): {
    protocols: string[];
    messagePatterns: string[];
    channelTypes: string[];
    realTimeCapabilities: string[];
  } {
    const protocols = new Set<string>();
    const messagePatterns = new Set<string>();
    const channelTypes = new Set<string>();
    const realTimeCapabilities: string[] = [];

    // Extract protocols from servers
    spec.servers.forEach(server => {
      protocols.add(server.protocol);

      // Determine capabilities based on protocol
      switch (server.protocol.toLowerCase()) {
        case 'websocket':
        case 'ws':
        case 'wss':
          realTimeCapabilities.push('bidirectional_communication');
          realTimeCapabilities.push('persistent_connections');
          break;
        case 'mqtt':
          realTimeCapabilities.push('pub_sub_messaging');
          realTimeCapabilities.push('lightweight_protocol');
          break;
        case 'amqp':
        case 'amqps':
          realTimeCapabilities.push('message_queueing');
          realTimeCapabilities.push('reliable_delivery');
          break;
        case 'kafka':
          realTimeCapabilities.push('high_throughput_messaging');
          realTimeCapabilities.push('partitioning');
          break;
        case 'nats':
          realTimeCapabilities.push('high_performance_messaging');
          realTimeCapabilities.push('subject_based_messaging');
          break;
        case 'sse':
        case 'server-sent-events':
          realTimeCapabilities.push('server_to_client_streaming');
          break;
      }
    });

    // Analyze channel patterns
    spec.channels.forEach(channel => {
      if (channel.subscribe && channel.publish) {
        channelTypes.add('bidirectional');
      } else if (channel.subscribe) {
        channelTypes.add('subscribe_only');
      } else if (channel.publish) {
        channelTypes.add('publish_only');
      }

      // Check for wildcard patterns
      if (channel.path.includes('*') || channel.path.includes('>')) {
        messagePatterns.add('wildcard_subscriptions');
      }
    });

    // Analyze message patterns
    spec.messages.forEach(message => {
      if (message.headersSchema) {
        messagePatterns.add('structured_headers');
      }
      if (message.payloadSchema?.type === 'object') {
        messagePatterns.add('structured_payload');
      }
    });

    return {
      protocols: Array.from(protocols),
      messagePatterns: Array.from(messagePatterns),
      channelTypes: Array.from(channelTypes),
      realTimeCapabilities: [...new Set(realTimeCapabilities)],
    };
  }

  /**
   * Generate streaming client code for different protocols
   */
  generateStreamingClient(spec: ParsedAsyncAPISpec, language: 'typescript' | 'python' | 'go'): string {
    const patterns = this.extractStreamingPatterns(spec);

    switch (language) {
      case 'typescript':
        return this.generateTypeScriptStreamingClient(spec, patterns);
      case 'python':
        return this.generatePythonStreamingClient(spec, patterns);
      case 'go':
        return this.generateGoStreamingClient(spec, patterns);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  private generateTypeScriptStreamingClient(spec: ParsedAsyncAPISpec, patterns: any): string {
    const hasWebSocket = patterns.protocols.some((p: string) => p.includes('ws'));
    const hasSSE = patterns.protocols.some((p: string) => p.includes('sse'));

    let clientCode = `
// AsyncAPI Streaming Client for ${spec.title}
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface StreamingClientConfig {
  url: string;
  apiKey?: string;
  reconnectInterval?: number;
  maxReconnects?: number;
}

export class StreamingClient extends EventEmitter {
  private ws?: WebSocket;
  private config: StreamingClientConfig;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: StreamingClientConfig) {
    super();
    this.config = {
      reconnectInterval: 5000,
      maxReconnects: 10,
      ...config,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url, {
          headers: this.config.apiKey ? {
            'Authorization': \`Bearer \${this.config.apiKey}\`,
          } : undefined,
        });

        this.ws.on('open', () => {
          console.log('Connected to streaming service');
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
            this.emit('error', error);
          }
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          console.log(\`Connection closed: \${code} - \${reason}\`);
          this.emit('disconnected', code, reason);
          this.handleReconnect();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: any): void {
    // Route messages based on channel/type
    this.emit('message', message);

    // Emit specific events based on message type
    if (message.type) {
      this.emit(message.type, message.data);
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnects || 10)) {
      this.emit('maxReconnectsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = (this.config.reconnectInterval || 5000) * Math.pow(1.5, this.reconnectAttempts - 1);

    console.log(\`Reconnecting in \${delay}ms (attempt \${this.reconnectAttempts})\`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      throw new Error('WebSocket is not connected');
    }
  }
}
`;

    // Add channel-specific methods
    spec.channels.forEach(channel => {
      if (channel.subscribe) {
        clientCode += `

  // Subscribe to ${channel.name} channel
  subscribeTo${channel.name.charAt(0).toUpperCase() + channel.name.slice(1)}(callback: (data: any) => void): void {
    this.on('${channel.name}', callback);

    // Send subscription message
    this.send({
      type: 'subscribe',
      channel: '${channel.path}',
    });
  }`;
      }
    });

    return clientCode;
  }

  private generatePythonStreamingClient(spec: ParsedAsyncAPISpec, patterns: any): string {
    const hasWebSocket = patterns.protocols.some((p: string) => p.includes('ws'));

    let clientCode = `
"""
AsyncAPI Streaming Client for ${spec.title}
"""

import asyncio
import json
import logging
from typing import Any, Callable, Optional
import websockets
from websockets.exceptions import ConnectionClosedError, WebSocketException

logger = logging.getLogger(__name__)


class StreamingClient:
    """
    Async streaming client for ${spec.title} API.
    """

    def __init__(
        self,
        url: str,
        api_key: Optional[str] = None,
        reconnect_interval: float = 5.0,
        max_reconnects: int = 10,
    ):
        """
        Initialize streaming client.

        Args:
            url: WebSocket URL for the streaming service
            api_key: API key for authentication
            reconnect_interval: Initial reconnect interval in seconds
            max_reconnects: Maximum number of reconnection attempts
        """
        self.url = url
        self.api_key = api_key
        self.reconnect_interval = reconnect_interval
        self.max_reconnects = max_reconnects

        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.reconnect_attempts = 0
        self.reconnect_task: Optional[asyncio.Task] = None
        self.message_handlers: dict[str, list[Callable[[Any], None]]] = {}
        self.connected = False

    async def connect(self) -> None:
        """
        Connect to the streaming service.
        """
        try:
            headers = {}
            if self.api_key:
                headers['Authorization'] = f'Bearer {self.api_key}'

            self.websocket = await websockets.connect(
                self.url,
                extra_headers=headers,
            )

            self.connected = True
            self.reconnect_attempts = 0
            logger.info("Connected to streaming service")

            # Start message handling loop
            asyncio.create_task(self._message_loop())

        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            if self.reconnect_attempts < self.max_reconnects:
                await self._schedule_reconnect()
            else:
                raise

    async def disconnect(self) -> None:
        """
        Disconnect from the streaming service.
        """
        self.connected = False

        if self.reconnect_task:
            self.reconnect_task.cancel()

        if self.websocket:
            await self.websocket.close()
            self.websocket = None

    async def send(self, data: Any) -> None:
        """
        Send data to the streaming service.

        Args:
            data: Data to send (will be JSON encoded)
        """
        if not self.websocket or not self.connected:
            raise ConnectionError("Not connected to streaming service")

        try:
            await self.websocket.send(json.dumps(data))
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            raise

    def on_message(self, message_type: str, handler: Callable[[Any], None]) -> None:
        """
        Register a message handler for a specific message type.

        Args:
            message_type: Type of message to handle
            handler: Handler function that takes message data
        """
        if message_type not in self.message_handlers:
            self.message_handlers[message_type] = []
        self.message_handlers[message_type].append(handler)

    async def _message_loop(self) -> None:
        """
        Main message handling loop.
        """
        try:
            while self.connected and self.websocket:
                try:
                    message = await self.websocket.recv()
                    await self._handle_message(message)
                except websockets.exceptions.ConnectionClosed:
                    logger.info("Connection closed")
                    break
                except Exception as e:
                    logger.error(f"Error in message loop: {e}")
                    break
        finally:
            self.connected = False
            if self.reconnect_attempts < self.max_reconnects:
                await self._schedule_reconnect()

    async def _handle_message(self, message: str) -> None:
        """
        Handle incoming message.

        Args:
            message: Raw message string
        """
        try:
            data = json.loads(message)

            # Call general message handlers
            for handler in self.message_handlers.get('*', []):
                try:
                    await handler(data)
                except Exception as e:
                    logger.error(f"Message handler error: {e}")

            # Call type-specific handlers
            message_type = data.get('type', 'unknown')
            for handler in self.message_handlers.get(message_type, []):
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(data)
                    else:
                        handler(data)
                except Exception as e:
                    logger.error(f"Message handler error for type {message_type}: {e}")

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse message: {e}")

    async def _schedule_reconnect(self) -> None:
        """
        Schedule a reconnection attempt.
        """
        if self.reconnect_task:
            self.reconnect_task.cancel()

        self.reconnect_attempts += 1
        delay = self.reconnect_interval * (1.5 ** (self.reconnect_attempts - 1))

        logger.info(f"Scheduling reconnect in {delay:.2f}s (attempt {self.reconnect_attempts})")

        self.reconnect_task = asyncio.create_task(self._reconnect_with_delay(delay))

    async def _reconnect_with_delay(self, delay: float) -> None:
        """
        Attempt to reconnect after a delay.

        Args:
            delay: Delay in seconds before reconnecting
        """
        await asyncio.sleep(delay)
        try:
            await self.connect()
        except Exception as e:
            logger.error(f"Reconnection failed: {e}")
            if self.reconnect_attempts < self.max_reconnects:
                await self._schedule_reconnect()
`;

    // Add channel-specific methods
    spec.channels.forEach(channel => {
      if (channel.subscribe) {
        clientCode += `

    async def subscribe_to_${channel.name}(self, callback: Callable[[Any], None]) -> None:
        """
        Subscribe to ${channel.name} channel.

        Args:
            callback: Callback function for received messages
        """
        self.on_message('${channel.name}', callback)

        # Send subscription message
        await self.send({
            'type': 'subscribe',
            'channel': '${channel.path}'
        })`;
      }
    });

    clientCode += `
}
`;

    return clientCode;
  }

  private generateGoStreamingClient(spec: ParsedAsyncAPISpec, patterns: any): string {
    const hasWebSocket = patterns.protocols.some((p: string) => p.includes('ws'));

    let clientCode = `// Streaming client for ${spec.title} API
package ${spec.title.toLowerCase().replace(/\s+/g, '')}

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// StreamingClient represents a streaming client
type StreamingClient struct {
	url       string
	apiKey    string
	conn      *websocket.Conn
	mu        sync.RWMutex
	connected bool
	handlers  map[string][]MessageHandler
	reconnectAttempts int
	maxReconnects    int
	reconnectInterval time.Duration
}

// MessageHandler represents a message handler function
type MessageHandler func(data interface{}) error

// NewStreamingClient creates a new streaming client
func NewStreamingClient(rawURL, apiKey string) (*StreamingClient, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	return &StreamingClient{
		url:               rawURL,
		apiKey:            apiKey,
		handlers:          make(map[string][]MessageHandler),
		maxReconnects:     10,
		reconnectInterval: 5 * time.Second,
	}, nil
}

// Connect establishes connection to the streaming service
func (c *StreamingClient) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	headers := make(http.Header)
	if c.apiKey != "" {
		headers.Set("Authorization", "Bearer "+c.apiKey)
	}

	dialer := websocket.DefaultDialer
	conn, _, err := dialer.DialContext(ctx, c.url, headers)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.conn = conn
	c.connected = true
	c.reconnectAttempts = 0

	log.Printf("Connected to streaming service at %s", c.url)

	// Start message handling
	go c.handleMessages()

	return nil
}

// Disconnect closes the connection
func (c *StreamingClient) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.connected = false

	if c.conn != nil {
		err := c.conn.Close()
		c.conn = nil
		return err
	}

	return nil
}

// Send sends a message to the streaming service
func (c *StreamingClient) Send(data interface{}) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected || c.conn == nil {
		return fmt.Errorf("not connected")
	}

	message, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	return c.conn.WriteMessage(websocket.TextMessage, message)
}

// OnMessage registers a message handler for a specific message type
func (c *StreamingClient) OnMessage(messageType string, handler MessageHandler) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.handlers[messageType] == nil {
		c.handlers[messageType] = make([]MessageHandler, 0)
	}
	c.handlers[messageType] = append(c.handlers[messageType], handler)
}

// handleMessages handles incoming messages
func (c *StreamingClient) handleMessages() {
	for {
		c.mu.RLock()
		conn := c.conn
		connected := c.connected
		c.mu.RUnlock()

		if !connected || conn == nil {
			break
		}

		messageType, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Read error: %v", err)
			c.handleReconnect()
			break
		}

		if messageType == websocket.TextMessage {
			c.processMessage(message)
		}
	}
}

// processMessage processes an incoming message
func (c *StreamingClient) processMessage(message []byte) {
	var data interface{}
	if err := json.Unmarshal(message, &data); err != nil {
		log.Printf("Failed to unmarshal message: %v", err)
		return
	}

	// Call general message handlers
	c.callHandlers("*", data)

	// Call type-specific handlers
	if messageMap, ok := data.(map[string]interface{}); ok {
		if messageType, exists := messageMap["type"]; exists {
			if typeStr, ok := messageType.(string); ok {
				c.callHandlers(typeStr, data)
			}
		}
	}
}

// callHandlers calls all handlers for a message type
func (c *StreamingClient) callHandlers(messageType string, data interface{}) {
	c.mu.RLock()
	handlers := c.handlers[messageType]
	c.mu.RUnlock()

	for _, handler := range handlers {
		go func(h MessageHandler) {
			if err := h(data); err != nil {
				log.Printf("Handler error: %v", err)
			}
		}(handler)
	}
}

// handleReconnect handles reconnection logic
func (c *StreamingClient) handleReconnect() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected {
		return
	}

	c.connected = false
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}

	if c.reconnectAttempts >= c.maxReconnects {
		log.Printf("Max reconnection attempts reached")
		return
	}

	c.reconnectAttempts++
	delay := time.Duration(float64(c.reconnectInterval) * (1.5 * float64(c.reconnectAttempts-1)))

	log.Printf("Reconnecting in %v (attempt %d)", delay, c.reconnectAttempts)

	time.Sleep(delay)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := c.Connect(ctx); err != nil {
			log.Printf("Reconnection failed: %v", err)
			c.handleReconnect()
		}
	}()
}`;

    // Add channel-specific methods
    spec.channels.forEach(channel => {
      if (channel.subscribe) {
        clientCode += `

// SubscribeTo${channel.name.charAt(0).toUpperCase() + channel.name.slice(1)} subscribes to ${channel.name} channel
func (c *StreamingClient) SubscribeTo${channel.name.charAt(0).toUpperCase() + channel.name.slice(1)}(handler MessageHandler) {
	c.OnMessage("${channel.name}", handler)

	// Send subscription message
	c.Send(map[string]interface{}{
		"type":    "subscribe",
		"channel": "${channel.path}",
	})
}`;

      }
    });

    return clientCode;
  }
}
