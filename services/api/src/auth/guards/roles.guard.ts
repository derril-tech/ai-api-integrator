import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { OrganizationRole, OrganizationMember } from '../../organizations/entities/organization-member.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(OrganizationMember)
    private readonly organizationMemberRepository: Repository<OrganizationMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No roles required
    }

    const request = context.switchToHttp().getRequest();
    const user: User = request.user;
    const organizationId = request.params.organizationId || request.body.organizationId || request.query.organizationId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    // Get user's membership in the organization
    const membership = await this.organizationMemberRepository.findOne({
      where: { userId: user.id, organizationId },
      relations: ['organization'],
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this organization');
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some(role => {
      if (role === OrganizationRole.OWNER) {
        return membership.isOwner();
      }
      if (role === OrganizationRole.ADMIN) {
        return membership.isAdmin();
      }
      return membership.role === role;
    });

    if (!hasRole) {
      throw new ForbiddenException(`Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`);
    }

    // Attach membership to request for use in controllers
    request.membership = membership;

    return true;
  }
}
