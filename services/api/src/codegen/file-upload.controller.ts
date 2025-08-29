import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileUploadService, UploadOptions, SignedUrlOptions } from './file-upload.service';

class GenerateUploadUrlDto {
  fileName: string;
  expiresInSeconds?: number;
  contentType?: string;
  contentDisposition?: string;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

class DirectUploadDto {
  fileName: string;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  metadata?: Record<string, string>;
}

@ApiTags('file-upload')
@Controller('file-upload')
export class FileUploadController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  @Post('signed-url')
  @ApiOperation({ summary: 'Generate signed URL for file upload' })
  @ApiResponse({ status: 200, description: 'Signed URL generated successfully' })
  async generateSignedUploadUrl(@Body() dto: GenerateUploadUrlDto) {
    try {
      const options: SignedUrlOptions = {
        expiresInSeconds: dto.expiresInSeconds || 3600,
        contentType: dto.contentType,
        contentDisposition: dto.contentDisposition,
      };

      const result = await this.fileUploadService.generateSignedUploadUrl(dto.fileName, options);

      return {
        success: true,
        data: result,
        instructions: {
          method: 'PUT',
          headers: {
            'Content-Type': dto.contentType || 'application/octet-stream',
          },
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('direct')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File upload',
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload',
        },
        options: {
          type: 'object',
          description: 'Upload options as JSON string',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload file directly to server' })
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  async uploadFileDirect(
    @UploadedFile() file: Express.Multer.File,
    @Body('options') optionsJson?: string
  ) {
    try {
      if (!file) {
        throw new BadRequestException('No file provided');
      }

      const options: UploadOptions = optionsJson ? JSON.parse(optionsJson) : {};

      // Validate the upload request
      const validation = this.fileUploadService.validateUploadRequest(
        file.originalname,
        file.size,
        options
      );

      if (!validation.valid) {
        throw new BadRequestException(validation.error);
      }

      const result = await this.fileUploadService.uploadFile(
        file.buffer,
        file.originalname,
        options
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('download/:key')
  @ApiOperation({ summary: 'Generate signed download URL' })
  @ApiResponse({ status: 200, description: 'Download URL generated' })
  async generateDownloadUrl(
    @Param('key') key: string,
    @Query('expiresIn') expiresInSeconds?: number,
    @Query('disposition') contentDisposition?: string
  ) {
    try {
      const signedUrl = await this.fileUploadService.generateSignedDownloadUrl(
        key,
        expiresInSeconds || 3600,
        { contentDisposition }
      );

      return {
        success: true,
        downloadUrl: signedUrl,
        expiresIn: expiresInSeconds || 3600,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('metadata/:key')
  @ApiOperation({ summary: 'Get file metadata' })
  @ApiResponse({ status: 200, description: 'File metadata retrieved' })
  async getFileMetadata(@Param('key') key: string) {
    try {
      const metadata = await this.fileUploadService.getFileMetadata(key);

      if (!metadata.exists) {
        throw new NotFoundException('File not found');
      }

      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete file' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  async deleteFile(@Param('key') key: string) {
    try {
      await this.fileUploadService.deleteFile(key);

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get storage statistics' })
  @ApiResponse({ status: 200, description: 'Storage stats retrieved' })
  async getStorageStats(@Query('prefix') prefix?: string) {
    try {
      const stats = await this.fileUploadService.getStorageStats(prefix);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate file upload request' })
  @ApiResponse({ status: 200, description: 'Validation completed' })
  validateUploadRequest(@Body() body: { fileName: string; fileSize: number; options?: UploadOptions }) {
    const validation = this.fileUploadService.validateUploadRequest(
      body.fileName,
      body.fileSize,
      body.options
    );

    return {
      valid: validation.valid,
      error: validation.error,
    };
  }

  // API Specification specific endpoints
  @Post('specs/:projectId')
  @UseInterceptors(FileInterceptor('spec'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'API specification upload',
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        spec: {
          type: 'string',
          format: 'binary',
          description: 'API specification file (OpenAPI, GraphQL, Postman)',
        },
        format: {
          type: 'string',
          enum: ['openapi', 'graphql', 'postman'],
          description: 'Specification format',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload API specification' })
  @ApiResponse({ status: 200, description: 'API spec uploaded successfully' })
  async uploadApiSpec(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('format') format: string
  ) {
    try {
      if (!file) {
        throw new BadRequestException('No specification file provided');
      }

      const allowedFormats = ['openapi', 'graphql', 'postman'];
      if (!allowedFormats.includes(format)) {
        throw new BadRequestException(`Invalid format. Supported: ${allowedFormats.join(', ')}`);
      }

      const specContent = file.buffer.toString('utf-8');

      const result = await this.fileUploadService.storeApiSpec(
        projectId,
        specContent,
        format as 'openapi' | 'graphql' | 'postman'
      );

      return {
        success: true,
        data: result,
        message: 'API specification uploaded successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }

  // Generated code specific endpoints
  @Post('generated/:projectId')
  @ApiOperation({ summary: 'Store generated code artifact' })
  @ApiResponse({ status: 200, description: 'Generated code stored successfully' })
  async storeGeneratedCode(
    @Param('projectId') projectId: string,
    @Body() body: { code: string; language: string; fileName: string }
  ) {
    try {
      const result = await this.fileUploadService.storeGeneratedCode(
        projectId,
        body.code,
        body.language,
        body.fileName
      );

      return {
        success: true,
        data: result,
        message: 'Generated code stored successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        error: error.message,
      });
    }
  }
}
