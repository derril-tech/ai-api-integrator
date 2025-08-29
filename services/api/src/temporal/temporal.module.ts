import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TemporalClientService } from './temporal-client.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [TemporalClientService],
  exports: [TemporalClientService],
})
export class TemporalModule {}
