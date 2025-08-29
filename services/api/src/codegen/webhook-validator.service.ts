import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface WebhookSignatureConfig {
  secret: string;
  algorithm: 'sha256' | 'sha1' | 'sha512';
  headerName: string;
  encoding: 'hex' | 'base64';
  prefix?: string; // Some services prefix signatures (e.g., "sha256=")
  tolerance?: number; // Time tolerance for timestamp-based signatures (in seconds)
}

export interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
  signature?: string;
  expectedSignature?: string;
  algorithm?: string;
  timestamp?: number;
  isReplay?: boolean;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  timestamp?: number;
  signature?: string;
  headers?: Record<string, string>;
}

@Injectable()
export class WebhookValidatorService {
  private readonly processedEvents = new Set<string>();
  private readonly maxProcessedEvents = 10000;

  /**
   * Validate webhook signature using HMAC
   */
  validateSignature(
    payload: string | Buffer,
    signature: string,
    config: WebhookSignatureConfig
  ): WebhookValidationResult {
    try {
      // Remove prefix if present
      let cleanSignature = signature;
      if (config.prefix && signature.startsWith(config.prefix)) {
        cleanSignature = signature.slice(config.prefix.length);
      }

      // Decode signature based on encoding
      let signatureBuffer: Buffer;
      if (config.encoding === 'base64') {
        signatureBuffer = Buffer.from(cleanSignature, 'base64');
      } else {
        signatureBuffer = Buffer.from(cleanSignature, 'hex');
      }

      // Create expected signature
      const hmac = createHmac(config.algorithm, config.secret);
      hmac.update(typeof payload === 'string' ? payload : payload);
      const expectedSignature = hmac.digest();

      // Use timing-safe comparison to prevent timing attacks
      const isValid = timingSafeEqual(signatureBuffer, expectedSignature);

      return {
        isValid,
        signature: cleanSignature,
        expectedSignature: expectedSignature.toString(config.encoding),
        algorithm: config.algorithm,
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Signature validation failed: ${error.message}`,
      };
    }
  }

  /**
   * Validate webhook with timestamp tolerance (replay attack protection)
   */
  validateTimestampedWebhook(
    payload: string | Buffer,
    signature: string,
    timestamp: number,
    config: WebhookSignatureConfig
  ): WebhookValidationResult {
    const now = Math.floor(Date.now() / 1000);
    const tolerance = config.tolerance || 300; // 5 minutes default

    // Check timestamp tolerance
    if (Math.abs(now - timestamp) > tolerance) {
      return {
        isValid: false,
        error: `Timestamp outside tolerance window (±${tolerance}s)`,
        timestamp,
        isReplay: true,
      };
    }

    // Create payload with timestamp for signature verification
    const timestampedPayload = `${timestamp}.${typeof payload === 'string' ? payload : payload.toString()}`;

    const result = this.validateSignature(timestampedPayload, signature, config);
    return {
      ...result,
      timestamp,
    };
  }

  /**
   * Prevent replay attacks by tracking processed event IDs
   */
  checkReplayAttack(eventId: string): boolean {
    if (this.processedEvents.has(eventId)) {
      return true; // This is a replay
    }

    // Add to processed events
    this.processedEvents.add(eventId);

    // Maintain size limit
    if (this.processedEvents.size > this.maxProcessedEvents) {
      const iterator = this.processedEvents.values();
      const firstValue = iterator.next().value;
      this.processedEvents.delete(firstValue);
    }

    return false;
  }

  /**
   * Validate complete webhook event
   */
  async validateWebhookEvent(
    event: WebhookEvent,
    config: WebhookSignatureConfig
  ): Promise<WebhookValidationResult> {
    try {
      // Check for replay attack
      if (event.id) {
        if (this.checkReplayAttack(event.id)) {
          return {
            isValid: false,
            error: 'Event ID already processed (potential replay attack)',
            isReplay: true,
          };
        }
      }

      // Get signature from headers or event
      const signature = event.signature || (event.headers && event.headers[config.headerName]);

      if (!signature) {
        return {
          isValid: false,
          error: `Missing signature in header '${config.headerName}'`,
        };
      }

      // Prepare payload
      const payload = typeof event.data === 'string'
        ? event.data
        : JSON.stringify(event.data);

      // Validate with or without timestamp
      if (event.timestamp) {
        return this.validateTimestampedWebhook(payload, signature, event.timestamp, config);
      } else {
        return this.validateSignature(payload, signature, config);
      }
    } catch (error) {
      return {
        isValid: false,
        error: `Webhook validation failed: ${error.message}`,
      };
    }
  }

  /**
   * Generate webhook signature for testing or sending webhooks
   */
  generateSignature(
    payload: string | Buffer,
    config: WebhookSignatureConfig,
    timestamp?: number
  ): string {
    const hmac = createHmac(config.algorithm, config.secret);

    let signaturePayload: string;
    if (timestamp) {
      signaturePayload = `${timestamp}.${typeof payload === 'string' ? payload : payload.toString()}`;
    } else {
      signaturePayload = typeof payload === 'string' ? payload : payload.toString();
    }

    hmac.update(signaturePayload);
    const signature = hmac.digest(config.encoding);

    return config.prefix ? `${config.prefix}${signature}` : signature;
  }

  /**
   * Create webhook signature config for common providers
   */
  createProviderConfig(provider: string, secret: string): WebhookSignatureConfig {
    const configs: Record<string, WebhookSignatureConfig> = {
      'github': {
        secret,
        algorithm: 'sha256',
        headerName: 'X-Hub-Signature-256',
        encoding: 'hex',
        prefix: 'sha256=',
      },
      'gitlab': {
        secret,
        algorithm: 'sha256',
        headerName: 'X-Gitlab-Token',
        encoding: 'hex',
      },
      'stripe': {
        secret,
        algorithm: 'sha256',
        headerName: 'Stripe-Signature',
        encoding: 'hex',
        tolerance: 300,
      },
      'slack': {
        secret,
        algorithm: 'sha256',
        headerName: 'X-Slack-Signature',
        encoding: 'hex',
        tolerance: 300,
      },
      'twilio': {
        secret,
        algorithm: 'sha1',
        headerName: 'X-Twilio-Signature',
        encoding: 'base64',
      },
      'sendgrid': {
        secret,
        algorithm: 'sha256',
        headerName: 'X-Twilio-Email-Event-Webhook-Signature',
        encoding: 'hex',
      },
      'discord': {
        secret,
        algorithm: 'sha256',
        headerName: 'X-Signature-Ed25519',
        encoding: 'hex',
      },
    };

    const config = configs[provider];
    if (!config) {
      throw new Error(`Unsupported webhook provider: ${provider}`);
    }

    return { ...config, secret };
  }

  /**
   * Validate raw webhook data from HTTP request
   */
  async validateWebhookRequest(
    body: string | Buffer,
    headers: Record<string, string>,
    config: WebhookSignatureConfig
  ): Promise<WebhookValidationResult> {
    try {
      const signature = headers[config.headerName];
      if (!signature) {
        return {
          isValid: false,
          error: `Missing signature header: ${config.headerName}`,
        };
      }

      return this.validateSignature(body, signature, config);
    } catch (error) {
      return {
        isValid: false,
        error: `Webhook request validation failed: ${error.message}`,
      };
    }
  }

  /**
   * Create middleware for webhook signature validation
   */
  createValidationMiddleware(config: WebhookSignatureConfig) {
    return async (req: any, res: any, next: any) => {
      try {
        // Get raw body (needs raw-body middleware)
        const body = req.rawBody || JSON.stringify(req.body) || '';

        const validation = await this.validateWebhookRequest(body, req.headers, config);

        if (!validation.isValid) {
          return res.status(401).json({
            error: 'Invalid webhook signature',
            details: validation.error,
          });
        }

        // Add validation info to request
        req.webhookValidation = validation;
        next();
      } catch (error) {
        return res.status(500).json({
          error: 'Webhook validation error',
          details: error.message,
        });
      }
    };
  }

  /**
   * Get webhook security statistics
   */
  getSecurityStats(): {
    processedEvents: number;
    recentValidations: number;
    replayAttempts: number;
    validationErrors: number;
  } {
    // This would track statistics in a real implementation
    return {
      processedEvents: this.processedEvents.size,
      recentValidations: 0,
      replayAttempts: 0,
      validationErrors: 0,
    };
  }

  /**
   * Clear processed events (for testing or maintenance)
   */
  clearProcessedEvents(): void {
    this.processedEvents.clear();
  }
}
