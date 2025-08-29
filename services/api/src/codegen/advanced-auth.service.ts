import { Injectable, Logger } from '@nestjs/common';

export interface AuthPattern {
  type: 'oauth2' | 'hmac' | 'jwt' | 'api_key' | 'basic' | 'hybrid' | 'custom';
  subtype?: string;
  parameters: AuthParameter[];
  headers: AuthHeader[];
  flow?: string;
  confidence: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface AuthParameter {
  name: string;
  location: 'header' | 'query' | 'body' | 'cookie';
  required: boolean;
  format?: string;
  example?: string;
}

export interface AuthHeader {
  name: string;
  format: string;
  required: boolean;
  example?: string;
}

export interface HybridAuthConfig {
  primary: AuthPattern;
  secondary: AuthPattern;
  combination: 'sequential' | 'parallel' | 'conditional';
  condition?: string;
}

@Injectable()
export class AdvancedAuthService {
  private readonly logger = new Logger(AdvancedAuthService.name);

  /**
   * Detect authentication patterns from OpenAPI spec
   */
  detectAuthPatterns(spec: any): AuthPattern[] {
    const patterns: AuthPattern[] = [];
    
    // Analyze security schemes
    const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
    
    for (const [name, scheme] of Object.entries(securitySchemes)) {
      const pattern = this.analyzeSecurityScheme(name, scheme as any);
      if (pattern) {
        patterns.push(pattern);
      }
    }
    
    // Look for custom auth patterns in endpoints
    const customPatterns = this.detectCustomAuthPatterns(spec);
    patterns.push(...customPatterns);
    
    // Detect hybrid auth combinations
    const hybridPatterns = this.detectHybridAuth(patterns, spec);
    patterns.push(...hybridPatterns);
    
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate authentication helper code
   */
  generateAuthHelper(patterns: AuthPattern[]): string {
    const helpers: string[] = [];
    
    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'hmac':
          helpers.push(this.generateHMACHelper(pattern));
          break;
        case 'hybrid':
          helpers.push(this.generateHybridAuthHelper(pattern));
          break;
        case 'custom':
          helpers.push(this.generateCustomAuthHelper(pattern));
          break;
        default:
          helpers.push(this.generateStandardAuthHelper(pattern));
      }
    }
    
    return helpers.join('\n\n');
  }

  /**
   * Detect HMAC + OAuth hybrid pattern (e.g., AWS Signature + OAuth)
   */
  detectHMACOAuthHybrid(spec: any): HybridAuthConfig | null {
    const schemes = spec.components?.securitySchemes || {};
    
    const hmacScheme = Object.values(schemes).find((scheme: any) => 
      this.isHMACScheme(scheme)
    ) as any;
    
    const oauthScheme = Object.values(schemes).find((scheme: any) => 
      scheme.type === 'oauth2'
    ) as any;
    
    if (!hmacScheme || !oauthScheme) {
      return null;
    }
    
    return {
      primary: this.analyzeSecurityScheme('hmac', hmacScheme)!,
      secondary: this.analyzeSecurityScheme('oauth', oauthScheme)!,
      combination: 'sequential',
      condition: 'request.requiresSignature'
    };
  }

  /**
   * Handle AWS Signature Version 4 + OAuth
   */
  generateAWSSignatureOAuthHelper(): string {
    return `
export class AWSSignatureOAuthAuth {
  private accessToken?: string;
  private awsCredentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
    service: string;
  };

  constructor(
    oauthToken?: string,
    awsCredentials?: AWSSignatureOAuthAuth['awsCredentials']
  ) {
    this.accessToken = oauthToken;
    this.awsCredentials = awsCredentials;
  }

  async signRequest(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<Record<string, string>> {
    const headers = { ...request.headers };

    // Add OAuth token if available
    if (this.accessToken) {
      headers['Authorization'] = \`Bearer \${this.accessToken}\`;
    }

    // Add AWS Signature if credentials available
    if (this.awsCredentials) {
      const awsHeaders = await this.createAWSSignature(request);
      Object.assign(headers, awsHeaders);
    }

    return headers;
  }

  private async createAWSSignature(request: any): Promise<Record<string, string>> {
    const { accessKeyId, secretAccessKey, sessionToken, region, service } = this.awsCredentials!;
    
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
    
    const headers: Record<string, string> = {
      'X-Amz-Date': timeStamp,
      'Host': new URL(request.url).host
    };
    
    if (sessionToken) {
      headers['X-Amz-Security-Token'] = sessionToken;
    }
    
    // Create canonical request
    const canonicalRequest = this.createCanonicalRequest(request, headers);
    
    // Create string to sign
    const credentialScope = \`\${dateStamp}/\${region}/\${service}/aws4_request\`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timeStamp,
      credentialScope,
      await this.sha256(canonicalRequest)
    ].join('\\n');
    
    // Calculate signature
    const signature = await this.calculateSignature(
      secretAccessKey,
      dateStamp,
      region,
      service,
      stringToSign
    );
    
    // Create authorization header
    headers['Authorization'] = [
      'AWS4-HMAC-SHA256',
      \`Credential=\${accessKeyId}/\${credentialScope}\`,
      \`SignedHeaders=\${Object.keys(headers).map(h => h.toLowerCase()).sort().join(';')}\`,
      \`Signature=\${signature}\`
    ].join(' ');
    
    return headers;
  }

  private createCanonicalRequest(request: any, headers: Record<string, string>): string {
    const url = new URL(request.url);
    const canonicalUri = url.pathname || '/';
    const canonicalQueryString = url.searchParams.toString();
    
    const canonicalHeaders = Object.entries(headers)
      .map(([key, value]) => \`\${key.toLowerCase()}:\${value.trim()}\`)
      .sort()
      .join('\\n') + '\\n';
    
    const signedHeaders = Object.keys(headers)
      .map(h => h.toLowerCase())
      .sort()
      .join(';');
    
    const payloadHash = this.sha256(request.body || '');
    
    return [
      request.method.toUpperCase(),
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\\n');
  }

  private async sha256(data: string): Promise<string> {
    // In browser environment, use SubtleCrypto
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // In Node.js environment, use crypto module
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async calculateSignature(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string,
    stringToSign: string
  ): Promise<string> {
    const kDate = await this.hmacSha256(\`AWS4\${secretKey}\`, dateStamp);
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, service);
    const kSigning = await this.hmacSha256(kService, 'aws4_request');
    
    return this.hmacSha256(kSigning, stringToSign);
  }

  private async hmacSha256(key: string | ArrayBuffer, data: string): Promise<string> {
    // Implementation depends on environment (browser vs Node.js)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const keyBuffer = typeof key === 'string' ? encoder.encode(key) : key;
      const dataBuffer = encoder.encode(data);
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
      const signatureArray = Array.from(new Uint8Array(signature));
      return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Node.js fallback
    const crypto = require('crypto');
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }
}`;
  }

  /**
   * Handle Shopify-style HMAC + OAuth
   */
  generateShopifyAuthHelper(): string {
    return `
export class ShopifyAuth {
  private accessToken?: string;
  private apiSecret?: string;
  
  constructor(accessToken?: string, apiSecret?: string) {
    this.accessToken = accessToken;
    this.apiSecret = apiSecret;
  }
  
  async signRequest(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<Record<string, string>> {
    const headers = { ...request.headers };
    
    // Add OAuth token for API access
    if (this.accessToken) {
      headers['X-Shopify-Access-Token'] = this.accessToken;
    }
    
    // Add HMAC signature for webhooks and admin API
    if (this.apiSecret && request.body) {
      const hmac = await this.calculateHMAC(request.body);
      headers['X-Shopify-Hmac-Sha256'] = hmac;
    }
    
    return headers;
  }
  
  async verifyWebhook(body: string, hmacHeader: string): Promise<boolean> {
    if (!this.apiSecret) {
      throw new Error('API secret required for webhook verification');
    }
    
    const calculatedHmac = await this.calculateHMAC(body);
    return calculatedHmac === hmacHeader;
  }
  
  private async calculateHMAC(data: string): Promise<string> {
    if (!this.apiSecret) {
      throw new Error('API secret required for HMAC calculation');
    }
    
    // Use crypto API (browser or Node.js)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const keyBuffer = encoder.encode(this.apiSecret);
      const dataBuffer = encoder.encode(data);
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
      return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }
    
    // Node.js fallback
    const crypto = require('crypto');
    return crypto.createHmac('sha256', this.apiSecret).update(data).digest('base64');
  }
}`;
  }

  private analyzeSecurityScheme(name: string, scheme: any): AuthPattern | null {
    if (!scheme) return null;

    switch (scheme.type) {
      case 'oauth2':
        return {
          type: 'oauth2',
          subtype: scheme.flows ? Object.keys(scheme.flows)[0] : 'unknown',
          parameters: [
            { name: 'access_token', location: 'header', required: true, format: 'Bearer {token}' }
          ],
          headers: [
            { name: 'Authorization', format: 'Bearer {token}', required: true }
          ],
          flow: scheme.flows ? Object.keys(scheme.flows)[0] : undefined,
          confidence: 0.9,
          complexity: 'moderate'
        };

      case 'apiKey':
        return {
          type: 'api_key',
          parameters: [
            { 
              name: scheme.name, 
              location: scheme.in as any, 
              required: true,
              example: 'your-api-key-here'
            }
          ],
          headers: scheme.in === 'header' ? [
            { name: scheme.name, format: '{api_key}', required: true }
          ] : [],
          confidence: 0.8,
          complexity: 'simple'
        };

      case 'http':
        if (scheme.scheme === 'bearer') {
          return {
            type: 'jwt',
            parameters: [
              { name: 'token', location: 'header', required: true, format: 'Bearer {jwt}' }
            ],
            headers: [
              { name: 'Authorization', format: 'Bearer {jwt}', required: true }
            ],
            confidence: 0.85,
            complexity: 'moderate'
          };
        } else if (scheme.scheme === 'basic') {
          return {
            type: 'basic',
            parameters: [
              { name: 'username', location: 'header', required: true },
              { name: 'password', location: 'header', required: true }
            ],
            headers: [
              { name: 'Authorization', format: 'Basic {base64(username:password)}', required: true }
            ],
            confidence: 0.9,
            complexity: 'simple'
          };
        }
        break;

      default:
        if (this.isHMACScheme(scheme)) {
          return {
            type: 'hmac',
            parameters: [
              { name: 'signature', location: 'header', required: true, format: 'HMAC-SHA256' },
              { name: 'timestamp', location: 'header', required: true },
              { name: 'nonce', location: 'header', required: false }
            ],
            headers: [
              { name: 'X-Signature', format: 'HMAC-SHA256={signature}', required: true },
              { name: 'X-Timestamp', format: '{unix_timestamp}', required: true }
            ],
            confidence: 0.7,
            complexity: 'complex'
          };
        }
    }

    return null;
  }

  private isHMACScheme(scheme: any): boolean {
    const hmacIndicators = [
      'hmac', 'signature', 'sign', 'hash', 'sha256', 'sha1', 'md5'
    ];
    
    const schemeStr = JSON.stringify(scheme).toLowerCase();
    return hmacIndicators.some(indicator => schemeStr.includes(indicator));
  }

  private detectCustomAuthPatterns(spec: any): AuthPattern[] {
    const patterns: AuthPattern[] = [];
    
    // Look for custom headers in endpoints
    const customHeaders = this.extractCustomAuthHeaders(spec);
    if (customHeaders.length > 0) {
      patterns.push({
        type: 'custom',
        parameters: customHeaders.map(header => ({
          name: header,
          location: 'header' as const,
          required: true
        })),
        headers: customHeaders.map(header => ({
          name: header,
          format: '{custom_value}',
          required: true
        })),
        confidence: 0.6,
        complexity: 'moderate'
      });
    }
    
    return patterns;
  }

  private detectHybridAuth(patterns: AuthPattern[], spec: any): AuthPattern[] {
    const hybridPatterns: AuthPattern[] = [];
    
    // Look for HMAC + OAuth combination
    const hmacPattern = patterns.find(p => p.type === 'hmac');
    const oauthPattern = patterns.find(p => p.type === 'oauth2');
    
    if (hmacPattern && oauthPattern) {
      hybridPatterns.push({
        type: 'hybrid',
        subtype: 'hmac_oauth',
        parameters: [...hmacPattern.parameters, ...oauthPattern.parameters],
        headers: [...hmacPattern.headers, ...oauthPattern.headers],
        confidence: 0.75,
        complexity: 'complex'
      });
    }
    
    return hybridPatterns;
  }

  private extractCustomAuthHeaders(spec: any): string[] {
    const customHeaders: Set<string> = new Set();
    const authHeaders = [
      'x-api-key', 'x-auth-token', 'x-signature', 'x-timestamp',
      'x-client-id', 'x-request-id', 'x-nonce', 'x-hmac'
    ];
    
    // Scan through all endpoints for custom auth headers
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, endpoint] of Object.entries(methods as any)) {
        const parameters = (endpoint as any).parameters || [];
        for (const param of parameters) {
          if (param.in === 'header' && 
              authHeaders.some(header => param.name.toLowerCase().includes(header))) {
            customHeaders.add(param.name);
          }
        }
      }
    }
    
    return Array.from(customHeaders);
  }

  private generateHMACHelper(pattern: AuthPattern): string {
    return `
export class HMACAuth {
  constructor(
    private apiKey: string,
    private secretKey: string,
    private algorithm: string = 'SHA256'
  ) {}

  async signRequest(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<Record<string, string>> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.generateNonce();
    
    const stringToSign = this.createStringToSign(
      request.method,
      request.url,
      timestamp,
      nonce,
      request.body
    );
    
    const signature = await this.calculateHMAC(stringToSign);
    
    return {
      ...request.headers,
      'X-API-Key': this.apiKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature
    };
  }

  private createStringToSign(
    method: string,
    url: string,
    timestamp: string,
    nonce: string,
    body?: string
  ): string {
    const parts = [method.toUpperCase(), url, timestamp, nonce];
    if (body) {
      parts.push(body);
    }
    return parts.join('\\n');
  }

  private async calculateHMAC(data: string): Promise<string> {
    // Implementation for HMAC calculation
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const keyBuffer = encoder.encode(this.secretKey);
      const dataBuffer = encoder.encode(data);
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: \`SHA-\${this.algorithm.replace('SHA', '')}\` },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
      const signatureArray = Array.from(new Uint8Array(signature));
      return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Node.js fallback
    const crypto = require('crypto');
    return crypto.createHmac(this.algorithm.toLowerCase(), this.secretKey)
      .update(data)
      .digest('hex');
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}`;
  }

  private generateHybridAuthHelper(pattern: AuthPattern): string {
    if (pattern.subtype === 'hmac_oauth') {
      return this.generateAWSSignatureOAuthHelper();
    }
    
    return `
export class HybridAuth {
  // Generic hybrid auth implementation
  // Customize based on specific requirements
}`;
  }

  private generateCustomAuthHelper(pattern: AuthPattern): string {
    return `
export class CustomAuth {
  constructor(private credentials: Record<string, string>) {}

  async signRequest(request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<Record<string, string>> {
    const headers = { ...request.headers };
    
    // Add custom authentication headers
    ${pattern.headers.map(header => 
      `headers['${header.name}'] = this.credentials['${header.name.toLowerCase()}'] || '';`
    ).join('\n    ')}
    
    return headers;
  }
}`;
  }

  private generateStandardAuthHelper(pattern: AuthPattern): string {
    switch (pattern.type) {
      case 'oauth2':
        return `
export class OAuth2Auth {
  constructor(private accessToken: string) {}

  async signRequest(request: any): Promise<Record<string, string>> {
    return {
      ...request.headers,
      'Authorization': \`Bearer \${this.accessToken}\`
    };
  }
}`;

      case 'api_key':
        const param = pattern.parameters[0];
        return `
export class ApiKeyAuth {
  constructor(private apiKey: string) {}

  async signRequest(request: any): Promise<Record<string, string>> {
    ${param.location === 'header' ? 
      `return { ...request.headers, '${param.name}': this.apiKey };` :
      `// Add to query parameters: ${param.name}=${this.apiKey}`
    }
  }
}`;

      default:
        return `
export class StandardAuth {
  // Standard authentication implementation
}`;
    }
  }
}
