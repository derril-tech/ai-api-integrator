import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization, OrganizationStatus } from './entities/organization.entity';
import { OrganizationUser, UserRole } from './entities/organization-user.entity';
import { User } from '../auth/entities/user.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(OrganizationUser)
    private organizationUserRepository: Repository<OrganizationUser>,
  ) {}

  async create(createOrganizationDto: CreateOrganizationDto, user: User): Promise<Organization> {
    const organization = this.organizationRepository.create({
      ...createOrganizationDto,
      status: OrganizationStatus.ACTIVE,
    });

    const savedOrganization = await this.organizationRepository.save(organization);

    // Add creator as owner
    const orgUser = this.organizationUserRepository.create({
      organizationId: savedOrganization.id,
      userId: user.id,
      role: UserRole.OWNER,
    });
    await this.organizationUserRepository.save(orgUser);

    return savedOrganization;
  }

  async findAll(user: User): Promise<Organization[]> {
    const orgUsers = await this.organizationUserRepository.find({
      where: { userId: user.id },
      relations: ['organization'],
    });

    return orgUsers.map(orgUser => orgUser.organization);
  }

  async findOne(id: string, user: User): Promise<Organization> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }

    // Check if user has access to this organization
    const orgUser = await this.organizationUserRepository.findOne({
      where: { organizationId: id, userId: user.id },
    });

    if (!orgUser) {
      throw new ForbiddenException('Access denied to organization');
    }

    return organization;
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto, user: User): Promise<Organization> {
    const organization = await this.findOne(id, user);

    // Check if user has admin/owner permissions
    const orgUser = await this.organizationUserRepository.findOne({
      where: { organizationId: id, userId: user.id },
    });

    if (!orgUser || ![UserRole.OWNER, UserRole.ADMIN].includes(orgUser.role)) {
      throw new ForbiddenException('Insufficient permissions to update organization');
    }

    Object.assign(organization, updateOrganizationDto);
    return this.organizationRepository.save(organization);
  }

  async remove(id: string, user: User): Promise<void> {
    const organization = await this.findOne(id, user);

    // Check if user is owner
    const orgUser = await this.organizationUserRepository.findOne({
      where: { organizationId: id, userId: user.id },
    });

    if (!orgUser || orgUser.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only organization owner can delete organization');
    }

    await this.organizationRepository.update(id, { status: OrganizationStatus.DELETED });
  }

  async addUser(organizationId: string, userId: string, role: UserRole, currentUser: User): Promise<void> {
    // Check if current user has permission to add users
    const currentOrgUser = await this.organizationUserRepository.findOne({
      where: { organizationId, userId: currentUser.id },
    });

    if (!currentOrgUser || ![UserRole.OWNER, UserRole.ADMIN].includes(currentOrgUser.role)) {
      throw new ForbiddenException('Insufficient permissions to add users');
    }

    // Check if user is already in organization
    const existingOrgUser = await this.organizationUserRepository.findOne({
      where: { organizationId, userId },
    });

    if (existingOrgUser) {
      throw new ForbiddenException('User is already in organization');
    }

    const orgUser = this.organizationUserRepository.create({
      organizationId,
      userId,
      role,
    });

    await this.organizationUserRepository.save(orgUser);
  }

  async updateUserRole(organizationId: string, userId: string, role: UserRole, currentUser: User): Promise<void> {
    // Check if current user has permission to update roles
    const currentOrgUser = await this.organizationUserRepository.findOne({
      where: { organizationId, userId: currentUser.id },
    });

    if (!currentOrgUser || ![UserRole.OWNER, UserRole.ADMIN].includes(currentOrgUser.role)) {
      throw new ForbiddenException('Insufficient permissions to update user roles');
    }

    // Cannot change owner's role
    const targetOrgUser = await this.organizationUserRepository.findOne({
      where: { organizationId, userId },
    });

    if (!targetOrgUser) {
      throw new NotFoundException('User not found in organization');
    }

    if (targetOrgUser.role === UserRole.OWNER) {
      throw new ForbiddenException('Cannot change organization owner role');
    }

    await this.organizationUserRepository.update(
      { organizationId, userId },
      { role }
    );
  }
}
