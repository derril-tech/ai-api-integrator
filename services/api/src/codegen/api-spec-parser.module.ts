import { Module } from '@nestjs/common';
import { ApiSpecParserService } from './api-spec-parser.service';
import { ApiSpecParserController } from './api-spec-parser.controller';

@Module({
  controllers: [ApiSpecParserController],
  providers: [ApiSpecParserService],
  exports: [ApiSpecParserService],
})
export class ApiSpecParserModule {}
