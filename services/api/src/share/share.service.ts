import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SharedSpec {
  id: string;
  shareToken: string;
  spec: any;
  metadata: {
    title: string;
    version: string;
    description?: string;
    endpoints: number;
    models: number;
  };
  permissions: {
    allowDownload: boolean;
    allowCopy: boolean;
    allowPrint: boolean;
    watermark?: string;
  };
  analytics: {
    views: number;
    lastViewed?: number;
    viewerIps: string[];
  };
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
  isActive: boolean;
}

export interface ShareCreateOptions {
  ttlSeconds?: number;
  allowDownload?: boolean;
  allowCopy?: boolean;
  allowPrint?: boolean;
  watermark?: string;
  createdBy: string;
}

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);
  private readonly store = new Map<string, SharedSpec>();

  constructor(private readonly configService: ConfigService) {}

  create(spec: any, options: ShareCreateOptions): SharedSpec {
    const id = this.generateId();
    const shareToken = this.generateShareToken();
    const now = Date.now();
    
    // Extract metadata from spec
    const metadata = this.extractSpecMetadata(spec);
    
    const item: SharedSpec = {
      id,
      shareToken,
      spec: this.sanitizeSpecForSharing(spec),
      metadata,
      permissions: {
        allowDownload: options.allowDownload ?? false,
        allowCopy: options.allowCopy ?? true,
        allowPrint: options.allowPrint ?? true,
        watermark: options.watermark,
      },
      analytics: {
        views: 0,
        viewerIps: [],
      },
      createdBy: options.createdBy,
      createdAt: now,
      expiresAt: options.ttlSeconds ? now + options.ttlSeconds * 1000 : undefined,
      isActive: true,
    };
    
    this.store.set(id, item);
    this.logger.log(`Created share link ${id} for spec ${metadata.title}`);
    
    return item;
  }

  get(id: string, viewerIp?: string): SharedSpec | null {
    const item = this.store.get(id);
    if (!item) return null;
    
    if (!item.isActive) {
      this.logger.warn(`Attempted access to deactivated share ${id}`);
      return null;
    }
    
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.logger.log(`Share ${id} expired, removing`);
      this.store.delete(id);
      return null;
    }
    
    // Track analytics
    if (viewerIp) {
      this.trackView(item, viewerIp);
    }
    
    return item;
  }

  getByToken(shareToken: string, viewerIp?: string): SharedSpec | null {
    for (const [id, item] of this.store.entries()) {
      if (item.shareToken === shareToken) {
        return this.get(id, viewerIp);
      }
    }
    return null;
  }

  deactivate(id: string, userId: string): boolean {
    const item = this.store.get(id);
    if (!item) return false;
    
    if (item.createdBy !== userId) {
      this.logger.warn(`User ${userId} attempted to deactivate share ${id} created by ${item.createdBy}`);
      return false;
    }
    
    item.isActive = false;
    this.logger.log(`Deactivated share ${id} by user ${userId}`);
    return true;
  }

  list(userId: string): SharedSpec[] {
    return Array.from(this.store.values())
      .filter(item => item.createdBy === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getAnalytics(id: string, userId: string): SharedSpec['analytics'] | null {
    const item = this.store.get(id);
    if (!item || item.createdBy !== userId) return null;
    return item.analytics;
  }

  private trackView(item: SharedSpec, viewerIp: string): void {
    item.analytics.views++;
    item.analytics.lastViewed = Date.now();
    
    // Track unique IPs (with privacy considerations)
    const hashedIp = this.hashIp(viewerIp);
    if (!item.analytics.viewerIps.includes(hashedIp)) {
      item.analytics.viewerIps.push(hashedIp);
      
      // Keep only last 100 unique IPs for privacy
      if (item.analytics.viewerIps.length > 100) {
        item.analytics.viewerIps = item.analytics.viewerIps.slice(-100);
      }
    }
  }

  private extractSpecMetadata(spec: any): SharedSpec['metadata'] {
    return {
      title: spec.title || spec.info?.title || 'Untitled API',
      version: spec.version || spec.info?.version || '1.0.0',
      description: spec.description || spec.info?.description,
      endpoints: spec.endpoints?.length || 0,
      models: spec.models?.length || spec.components?.schemas ? Object.keys(spec.components.schemas).length : 0,
    };
  }

  private sanitizeSpecForSharing(spec: any): any {
    // Remove sensitive information before sharing
    const sanitized = { ...spec };
    
    // Remove internal metadata
    delete sanitized.internal;
    delete sanitized.projectId;
    delete sanitized.userId;
    
    // Remove server URLs that might contain internal information
    if (sanitized.servers) {
      sanitized.servers = sanitized.servers.filter((server: any) => 
        !server.url.includes('localhost') && 
        !server.url.includes('127.0.0.1') &&
        !server.url.includes('internal')
      );
    }
    
    return sanitized;
  }

  private generateId(): string {
    // Generate a more secure ID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateShareToken(): string {
    // Generate a secure share token
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private hashIp(ip: string): string {
    // Simple hash for IP privacy (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      const char = ip.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}


