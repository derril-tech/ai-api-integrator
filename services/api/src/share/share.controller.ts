import { 
  Body, 
  Controller, 
  Get, 
  NotFoundException, 
  Param, 
  Post, 
  Delete,
  Query,
  Req,
  UseGuards,
  ForbiddenException 
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ShareService, ShareCreateOptions } from './share.service';

class CreateShareDto {
  spec!: any; // read-only spec payload
  ttlSeconds?: number; // optional expiry in seconds
  allowDownload?: boolean; // allow downloading the spec
  allowCopy?: boolean; // allow copying text
  allowPrint?: boolean; // allow printing
  watermark?: string; // optional watermark text
}

class ShareResponseDto {
  id!: string;
  shareToken!: string;
  url!: string;
  publicUrl!: string;
  metadata!: any;
  permissions!: any;
  expiresAt?: number;
}

@ApiTags('share')
@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post()
  @ApiOperation({ summary: 'Create a read-only share link for a spec' })
  @ApiResponse({ status: 201, description: 'Share created', type: ShareResponseDto })
  create(@Body() body: CreateShareDto, @Req() req: Request) {
    // In a real implementation, get user ID from JWT token
    const userId = req.headers['user-id'] as string || 'anonymous';
    
    const options: ShareCreateOptions = {
      ttlSeconds: body.ttlSeconds,
      allowDownload: body.allowDownload,
      allowCopy: body.allowCopy,
      allowPrint: body.allowPrint,
      watermark: body.watermark,
      createdBy: userId,
    };
    
    const item = this.shareService.create(body.spec, options);
    
    return {
      id: item.id,
      shareToken: item.shareToken,
      url: `/share/${item.id}`,
      publicUrl: `/public/share/${item.shareToken}`,
      metadata: item.metadata,
      permissions: item.permissions,
      expiresAt: item.expiresAt,
    };
  }

  @Get('list')
  @ApiOperation({ summary: 'List all shares created by the current user' })
  @ApiResponse({ status: 200, description: 'List of user shares' })
  listUserShares(@Req() req: Request) {
    const userId = req.headers['user-id'] as string || 'anonymous';
    const shares = this.shareService.list(userId);
    
    return shares.map(share => ({
      id: share.id,
      shareToken: share.shareToken,
      metadata: share.metadata,
      permissions: share.permissions,
      analytics: share.analytics,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      isActive: share.isActive,
      url: `/share/${share.id}`,
      publicUrl: `/public/share/${share.shareToken}`,
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a read-only shared spec by ID' })
  @ApiResponse({ status: 200, description: 'Shared spec returned' })
  get(@Param('id') id: string, @Req() req: Request) {
    const viewerIp = req.ip || req.connection.remoteAddress || 'unknown';
    const item = this.shareService.get(id, viewerIp);
    
    if (!item) {
      throw new NotFoundException('Share not found or expired');
    }
    
    return {
      id: item.id,
      spec: item.spec,
      metadata: item.metadata,
      permissions: item.permissions,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
    };
  }

  @Get('token/:token')
  @ApiOperation({ summary: 'Retrieve a read-only shared spec by share token' })
  @ApiResponse({ status: 200, description: 'Shared spec returned' })
  getByToken(@Param('token') token: string, @Req() req: Request) {
    const viewerIp = req.ip || req.connection.remoteAddress || 'unknown';
    const item = this.shareService.getByToken(token, viewerIp);
    
    if (!item) {
      throw new NotFoundException('Share not found or expired');
    }
    
    return {
      id: item.id,
      spec: item.spec,
      metadata: item.metadata,
      permissions: item.permissions,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
    };
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get analytics for a shared spec' })
  @ApiResponse({ status: 200, description: 'Share analytics returned' })
  getAnalytics(@Param('id') id: string, @Req() req: Request) {
    const userId = req.headers['user-id'] as string || 'anonymous';
    const analytics = this.shareService.getAnalytics(id, userId);
    
    if (!analytics) {
      throw new NotFoundException('Share not found or access denied');
    }
    
    return analytics;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a shared spec' })
  @ApiResponse({ status: 200, description: 'Share deactivated' })
  deactivate(@Param('id') id: string, @Req() req: Request) {
    const userId = req.headers['user-id'] as string || 'anonymous';
    const success = this.shareService.deactivate(id, userId);
    
    if (!success) {
      throw new ForbiddenException('Cannot deactivate share - not found or access denied');
    }
    
    return { success: true, message: 'Share deactivated successfully' };
  }
}


