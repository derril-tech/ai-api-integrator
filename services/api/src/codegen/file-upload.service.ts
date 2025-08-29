import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';

export interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  key: string;
  bucket: string;
  url: string;
  uploadedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, string>;
}

export interface UploadOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
  contentDisposition?: string;
}

export interface SignedUrlOptions {
  expiresInSeconds: number;
  contentType?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class FileUploadService {
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;
  private cdnUrl?: string;

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.bucketName = this.configService.get<string>('S3_BUCKET_NAME', 'ai-api-integrator-files');
    this.cdnUrl = this.configService.get<string>('CDN_URL');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
      // For local development with LocalStack or similar
      endpoint: this.configService.get<string>('S3_ENDPOINT'),
      forcePathStyle: this.configService.get<boolean>('S3_FORCE_PATH_STYLE', false),
    });
  }

  /**
   * Generate a signed URL for direct file upload to S3
   */
  async generateSignedUploadUrl(
    fileName: string,
    options: SignedUrlOptions = { expiresInSeconds: 3600 }
  ): Promise<{
    signedUrl: string;
    key: string;
    fileId: string;
    expiresAt: Date;
  }> {
    const fileId = randomUUID();
    const fileExtension = path.extname(fileName);
    const sanitizedName = path.basename(fileName, fileExtension).replace(/[^a-zA-Z0-9-_]/g, '_');
    const key = `uploads/${fileId}/${sanitizedName}${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: options.contentType,
      ContentDisposition: options.contentDisposition,
      Metadata: options.metadata,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: options.expiresInSeconds,
    });

    const expiresAt = new Date(Date.now() + options.expiresInSeconds * 1000);

    return {
      signedUrl,
      key,
      fileId,
      expiresAt,
    };
  }

  /**
   * Generate a signed URL for file download
   */
  async generateSignedDownloadUrl(
    key: string,
    expiresInSeconds: number = 3600,
    options: { contentDisposition?: string } = {}
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition: options.contentDisposition,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Upload file directly (for server-side uploads)
   */
  async uploadFile(
    file: Buffer,
    fileName: string,
    options: UploadOptions = {}
  ): Promise<UploadedFile> {
    const { maxSizeBytes = 10 * 1024 * 1024, allowedMimeTypes } = options; // 10MB default

    // Validate file size
    if (file.length > maxSizeBytes) {
      throw new Error(`File size ${file.length} exceeds maximum allowed size ${maxSizeBytes}`);
    }

    // Generate file metadata
    const fileId = randomUUID();
    const fileExtension = path.extname(fileName);
    const sanitizedName = path.basename(fileName, fileExtension).replace(/[^a-zA-Z0-9-_]/g, '_');
    const key = `uploads/${fileId}/${sanitizedName}${fileExtension}`;

    // Determine MIME type (basic detection)
    const mimeType = this.detectMimeType(fileName);

    // Validate MIME type if restrictions are specified
    if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ContentType: mimeType,
      ContentDisposition: options.contentDisposition,
      Metadata: options.metadata,
    });

    await this.s3Client.send(command);

    const publicUrl = this.cdnUrl
      ? `${this.cdnUrl}/${key}`
      : `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

    return {
      id: fileId,
      originalName: fileName,
      mimeType,
      size: file.length,
      key,
      bucket: this.bucketName,
      url: publicUrl,
      uploadedAt: new Date(),
      metadata: options.metadata,
    };
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<{
    exists: boolean;
    size?: number;
    lastModified?: Date;
    etag?: string;
    metadata?: Record<string, string>;
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        exists: true,
        size: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag,
        metadata: response.Metadata,
      };
    } catch (error) {
      if (error.name === 'NotFound') {
        return { exists: false };
      }
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  /**
   * List files in a prefix
   */
  async listFiles(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    // This would require ListObjectsCommand, but for simplicity we'll return a basic implementation
    // In a real implementation, you'd paginate through results
    return [];
  }

  /**
   * Validate file upload request
   */
  validateUploadRequest(
    fileName: string,
    fileSize: number,
    options: UploadOptions = {}
  ): { valid: boolean; error?: string } {
    const { maxSizeBytes = 10 * 1024 * 1024, allowedMimeTypes } = options;

    // Check file size
    if (fileSize > maxSizeBytes) {
      return {
        valid: false,
        error: `File size ${fileSize} exceeds maximum allowed size ${maxSizeBytes}`,
      };
    }

    // Check file extension security
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
    const extension = path.extname(fileName).toLowerCase();
    if (dangerousExtensions.includes(extension)) {
      return {
        valid: false,
        error: `File extension ${extension} is not allowed for security reasons`,
      };
    }

    // Check MIME type
    const mimeType = this.detectMimeType(fileName);
    if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: `File type ${mimeType} is not allowed`,
      };
    }

    return { valid: true };
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(prefix?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    averageFileSize: number;
  }> {
    // In a real implementation, this would use ListObjects to calculate stats
    // For now, return mock data
    return {
      totalFiles: 0,
      totalSize: 0,
      averageFileSize: 0,
    };
  }

  private detectMimeType(fileName: string): string {
    const extension = path.extname(fileName).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.json': 'application/json',
      '.yaml': 'application/yaml',
      '.yml': 'application/yaml',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Generate a unique key for artifact storage
   */
  generateArtifactKey(projectId: string, artifactType: string, fileName: string): string {
    const timestamp = Date.now();
    const sanitizedName = path.basename(fileName).replace(/[^a-zA-Z0-9-_.]/g, '_');
    return `artifacts/${projectId}/${artifactType}/${timestamp}_${sanitizedName}`;
  }

  /**
   * Store API specification artifact
   */
  async storeApiSpec(projectId: string, specContent: string, format: 'openapi' | 'graphql' | 'postman'): Promise<UploadedFile> {
    const fileName = `api-spec.${format === 'openapi' ? 'json' : format === 'graphql' ? 'graphql' : 'json'}`;
    const key = this.generateArtifactKey(projectId, 'specs', fileName);

    const buffer = Buffer.from(specContent, 'utf-8');

    return this.uploadFile(buffer, fileName, {
      contentDisposition: `attachment; filename="${fileName}"`,
      metadata: {
        projectId,
        artifactType: 'api_spec',
        format,
        uploadedBy: 'system',
      },
    });
  }

  /**
   * Store generated code artifact
   */
  async storeGeneratedCode(projectId: string, codeContent: string, language: string, fileName: string): Promise<UploadedFile> {
    const key = this.generateArtifactKey(projectId, 'generated', fileName);
    const buffer = Buffer.from(codeContent, 'utf-8');

    return this.uploadFile(buffer, fileName, {
      contentDisposition: `attachment; filename="${fileName}"`,
      metadata: {
        projectId,
        artifactType: 'generated_code',
        language,
        uploadedBy: 'codegen',
      },
    });
  }
}
