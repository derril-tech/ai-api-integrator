import { Injectable, BadRequestException, Logger } from '@nestjs/common';

export interface OAuthProvider {
  name: string;
  displayName: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdRequired: boolean;
  clientSecretRequired: boolean;
  redirectUriRequired: boolean;
  supportsPkce: boolean;
  documentationUrl: string;
}

export interface OAuthAppConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scopes: string[];
  additionalParams?: Record<string, string>;
}

export interface ProvisionedOAuthApp {
  id: string;
  provider: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface OAuthFlowState {
  state: string;
  provider: string;
  redirectUri: string;
  scopes: string[];
  codeVerifier?: string; // For PKCE
  expiresAt: Date;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
  scope?: string;
  idToken?: string; // For OpenID Connect
}

@Injectable()
export class OAuthProvisioningService {
  private readonly logger = new Logger(OAuthProvisioningService.name);

  // Supported OAuth providers
  private readonly providers: Record<string, OAuthProvider> = {
    github: {
      name: 'github',
      displayName: 'GitHub',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'user', 'read:org'],
      clientIdRequired: true,
      clientSecretRequired: true,
      redirectUriRequired: true,
      supportsPkce: true,
      documentationUrl: 'https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps',
    },
    gitlab: {
      name: 'gitlab',
      displayName: 'GitLab',
      authorizationUrl: 'https://gitlab.com/oauth/authorize',
      tokenUrl: 'https://gitlab.com/oauth/token',
      scopes: ['api', 'read_user', 'read_repository'],
      clientIdRequired: true,
      clientSecretRequired: true,
      redirectUriRequired: true,
      supportsPkce: true,
      documentationUrl: 'https://docs.gitlab.com/ee/api/oauth2.html',
    },
    google: {
      name: 'google',
      displayName: 'Google',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
      clientIdRequired: true,
      clientSecretRequired: true,
      redirectUriRequired: true,
      supportsPkce: true,
      documentationUrl: 'https://developers.google.com/identity/protocols/oauth2',
    },
    microsoft: {
      name: 'microsoft',
      displayName: 'Microsoft',
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: ['https://graph.microsoft.com/User.Read', 'https://graph.microsoft.com/Mail.Read'],
      clientIdRequired: true,
      clientSecretRequired: true,
      redirectUriRequired: true,
      supportsPkce: true,
      documentationUrl: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow',
    },
    slack: {
      name: 'slack',
      displayName: 'Slack',
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopes: ['channels:read', 'chat:write', 'users:read'],
      clientIdRequired: true,
      clientSecretRequired: true,
      redirectUriRequired: true,
      supportsPkce: true,
      documentationUrl: 'https://api.slack.com/docs/oauth',
    },
    discord: {
      name: 'discord',
      displayName: 'Discord',
      authorizationUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      scopes: ['identify', 'email', 'guilds'],
      clientIdRequired: true,
      clientSecretRequired: true,
      redirectUriRequired: true,
      supportsPkce: true,
      documentationUrl: 'https://discord.com/developers/docs/topics/oauth2',
    },
    stripe: {
      name: 'stripe',
      displayName: 'Stripe',
      authorizationUrl: 'https://connect.stripe.com/oauth/authorize',
      tokenUrl: 'https://connect.stripe.com/oauth/token',
      scopes: ['read_write'],
      clientIdRequired: false, // Stripe uses a fixed client_id
      clientSecretRequired: true,
      redirectUriRequired: true,
      supportsPkce: false,
      documentationUrl: 'https://stripe.com/docs/connect/oauth-reference',
    },
  };

  private flowStates: Map<string, OAuthFlowState> = new Map();

  constructor() {}

  /**
   * Get all supported OAuth providers
   */
  getSupportedProviders(): OAuthProvider[] {
    return Object.values(this.providers);
  }

  /**
   * Get a specific OAuth provider configuration
   */
  getProvider(providerName: string): OAuthProvider {
    const provider = this.providers[providerName];
    if (!provider) {
      throw new BadRequestException(`Unsupported OAuth provider: ${providerName}`);
    }
    return provider;
  }

  /**
   * Provision an OAuth application
   */
  async provisionOAuthApp(
    projectId: string,
    config: OAuthAppConfig
  ): Promise<ProvisionedOAuthApp> {
    // Validate OAuth configuration
    const provider = this.getProvider(config.provider);

    // Validate required fields
    this.validateOAuthConfig(config, provider);

    // Store in secure storage (Vault integration would go here)
    const provisionedApp: ProvisionedOAuthApp = {
      id: this.generateAppId(),
      provider: config.provider,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };

    // TODO: Store in Vault or secure database
    this.logger.log(`Provisioned OAuth app for ${config.provider} in project ${projectId}`);

    return provisionedApp;
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthorizationUrl(
    appId: string,
    redirectUri: string,
    scopes?: string[],
    state?: string
  ): { authorizationUrl: string; state: string } {
    // TODO: Retrieve app configuration from storage
    const app = this.getProvisionedApp(appId); // This would come from storage

    const provider = this.getProvider(app.provider);
    const finalScopes = scopes || app.scopes;
    const finalState = state || this.generateState();

    // Store flow state for security
    const flowState: OAuthFlowState = {
      state: finalState,
      provider: app.provider,
      redirectUri: redirectUri,
      scopes: finalScopes,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    };

    if (provider.supportsPkce) {
      flowState.codeVerifier = this.generateCodeVerifier();
    }

    this.flowStates.set(finalState, flowState);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: redirectUri,
      scope: finalScopes.join(' '),
      response_type: 'code',
      state: finalState,
    });

    // Add PKCE parameters if supported
    if (flowState.codeVerifier) {
      const codeChallenge = this.generateCodeChallenge(flowState.codeVerifier);
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    // Add provider-specific parameters
    if (app.additionalParams) {
      Object.entries(app.additionalParams).forEach(([key, value]) => {
        params.append(key, value);
      });
    }

    const authorizationUrl = `${provider.authorizationUrl}?${params.toString()}`;

    return { authorizationUrl, state: finalState };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    state: string,
    code: string,
    redirectUri: string
  ): Promise<OAuthTokenResponse> {
    const flowState = this.flowStates.get(state);
    if (!flowState) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    // Remove used state
    this.flowStates.delete(state);

    // Check expiration
    if (flowState.expiresAt < new Date()) {
      throw new BadRequestException('Authorization state has expired');
    }

    const provider = this.getProvider(flowState.provider);

    // Prepare token request
    const tokenParams = new URLSearchParams({
      client_id: 'placeholder', // TODO: Get from storage
      client_secret: 'placeholder', // TODO: Get from storage
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    // Add PKCE verifier if used
    if (flowState.codeVerifier) {
      tokenParams.append('code_verifier', flowState.codeVerifier);
    }

    try {
      // Make token request (would use HTTP client in real implementation)
      const response = await this.makeTokenRequest(provider.tokenUrl, tokenParams);

      return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        tokenType: response.token_type,
        expiresIn: response.expires_in,
        scope: response.scope,
        idToken: response.id_token,
      };
    } catch (error) {
      this.logger.error(`Token exchange failed: ${error.message}`);
      throw new BadRequestException('Failed to exchange authorization code for token');
    }
  }

  /**
   * Refresh an access token
   */
  async refreshAccessToken(
    refreshToken: string,
    appId: string
  ): Promise<OAuthTokenResponse> {
    const app = this.getProvisionedApp(appId);
    const provider = this.getProvider(app.provider);

    const refreshParams = new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    try {
      const response = await this.makeTokenRequest(provider.tokenUrl, refreshParams);

      return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token || refreshToken,
        tokenType: response.token_type,
        expiresIn: response.expires_in,
        scope: response.scope,
      };
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`);
      throw new BadRequestException('Failed to refresh access token');
    }
  }

  /**
   * Validate OAuth configuration
   */
  private validateOAuthConfig(config: OAuthAppConfig, provider: OAuthProvider): void {
    if (provider.clientIdRequired && !config.clientId) {
      throw new BadRequestException(`${provider.displayName} requires a client ID`);
    }

    if (provider.clientSecretRequired && !config.clientSecret) {
      throw new BadRequestException(`${provider.displayName} requires a client secret`);
    }

    if (provider.redirectUriRequired && !config.redirectUri) {
      throw new BadRequestException(`${provider.displayName} requires a redirect URI`);
    }

    // Validate scopes
    const invalidScopes = config.scopes.filter(scope => !provider.scopes.includes(scope));
    if (invalidScopes.length > 0) {
      throw new BadRequestException(
        `Invalid scopes for ${provider.displayName}: ${invalidScopes.join(', ')}`
      );
    }
  }

  /**
   * Generate a unique application ID
   */
  private generateAppId(): string {
    return `oauth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a secure state parameter
   */
  private generateState(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return require('crypto').randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(verifier: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Get provisioned OAuth app (placeholder - would retrieve from storage)
   */
  private getProvisionedApp(appId: string): ProvisionedOAuthApp {
    // TODO: Retrieve from Vault or secure database
    throw new BadRequestException(`OAuth app ${appId} not found`);
  }

  /**
   * Make token request (placeholder - would use HTTP client)
   */
  private async makeTokenRequest(url: string, params: URLSearchParams): Promise<any> {
    // TODO: Implement actual HTTP request
    // This would make a POST request to the token endpoint
    throw new Error('Token request not implemented');
  }

  /**
   * Clean up expired flow states
   */
  cleanupExpiredStates(): void {
    const now = new Date();
    for (const [state, flowState] of this.flowStates.entries()) {
      if (flowState.expiresAt < now) {
        this.flowStates.delete(state);
      }
    }
  }

  /**
   * Get OAuth flow statistics
   */
  getStats(): {
    supportedProviders: number;
    activeFlows: number;
    expiredFlows: number;
  } {
    const now = new Date();
    let expiredFlows = 0;

    for (const flowState of this.flowStates.values()) {
      if (flowState.expiresAt < now) {
        expiredFlows++;
      }
    }

    return {
      supportedProviders: Object.keys(this.providers).length,
      activeFlows: this.flowStates.size - expiredFlows,
      expiredFlows,
    };
  }
}
