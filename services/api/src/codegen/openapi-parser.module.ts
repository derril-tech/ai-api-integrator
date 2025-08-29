import { Module } from '@nestjs/common';
import { OpenApiParserService } from './openapi-parser.service';
import { OpenApiParserController } from './openapi-parser.controller';

@Module({
  controllers: [OpenApiParserController],
  providers: [OpenApiParserService],
  exports: [OpenApiParserService],
})
export class OpenApiParserModule {}
