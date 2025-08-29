import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsyncAPIParserService } from './asyncapi-parser.service';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  providers: [AsyncAPIParserService],
  exports: [AsyncAPIParserService],
})
export class AsyncAPIParserModule {}
