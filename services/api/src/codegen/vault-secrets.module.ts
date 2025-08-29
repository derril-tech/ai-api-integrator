import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VaultSecretsService } from './vault-secrets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([]), // No entities needed for this service
    ConfigModule, // Make ConfigService available
  ],
  providers: [VaultSecretsService],
  exports: [VaultSecretsService],
})
export class VaultSecretsModule {}
