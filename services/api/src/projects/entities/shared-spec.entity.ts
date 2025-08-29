import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiSpec } from './api-spec.entity';
import { User } from '../../auth/entities/user.entity';

export interface SharePermissions {
  allowDownload: boolean;
  allowCopy: boolean;
  allowPrint: boolean;
  watermark?: string;
}

export interface ShareAnalytics {
  views: number;
  lastViewed?: number;
  viewerIps: string[];
  uniqueViewers?: number;
  referrers?: Record<string, number>;
  countries?: Record<string, number>;
}

@Entity('shared_specs')
@Index(['share_token'], { unique: true })
@Index(['is_active'])
export class SharedSpec {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'spec_id' })
  specId: string;

  @Column({ name: 'share_token', unique: true })
  @Index()
  shareToken: string;

  @Column({ type: 'jsonb', default: {} })
  permissions: SharePermissions;

  @Column({ type: 'jsonb', default: { views: 0, viewerIps: [] } })
  analytics: ShareAnalytics;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'is_active', default: true })
  @Index()
  isActive: boolean;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ApiSpec, spec => spec.shares, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'spec_id' })
  spec: ApiSpec;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  // Helper methods
  isExpired(): boolean {
    return this.expiresAt ? this.expiresAt < new Date() : false;
  }

  isAccessible(): boolean {
    return this.isActive && !this.isExpired();
  }

  getPublicUrl(): string {
    return `/public/share/${this.shareToken}`;
  }

  getTimeRemaining(): number | null {
    if (!this.expiresAt) return null;
    return Math.max(0, this.expiresAt.getTime() - Date.now());
  }

  getTimeRemainingFormatted(): string | null {
    const remaining = this.getTimeRemaining();
    if (remaining === null) return null;
    if (remaining <= 0) return 'Expired';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
    return 'Less than 1 minute remaining';
  }

  incrementViews(viewerIp?: string): void {
    this.analytics.views = (this.analytics.views || 0) + 1;
    this.analytics.lastViewed = Date.now();

    if (viewerIp) {
      const hashedIp = this.hashIp(viewerIp);
      if (!this.analytics.viewerIps.includes(hashedIp)) {
        this.analytics.viewerIps.push(hashedIp);
        
        // Keep only last 100 unique IPs for privacy
        if (this.analytics.viewerIps.length > 100) {
          this.analytics.viewerIps = this.analytics.viewerIps.slice(-100);
        }
      }
      
      this.analytics.uniqueViewers = this.analytics.viewerIps.length;
    }
  }

  deactivate(): void {
    this.isActive = false;
  }

  activate(): void {
    this.isActive = true;
  }

  extendExpiry(additionalHours: number): void {
    const now = new Date();
    const newExpiry = new Date(now.getTime() + additionalHours * 60 * 60 * 1000);
    
    if (!this.expiresAt || newExpiry > this.expiresAt) {
      this.expiresAt = newExpiry;
    }
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
