import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthProvisioningService } from './oauth-provisioning.service';

@Module({
  imports: [TypeOrmModule.forFeature([])], // No entities needed for this service
  providers: [OAuthProvisioningService],
  exports: [OAuthProvisioningService],
})
export class OAuthProvisioningModule {}
