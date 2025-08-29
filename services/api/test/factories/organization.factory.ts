import { Organization } from '../../src/organizations/entities/organization.entity';
import { OrganizationMember, OrganizationRole } from '../../src/organizations/entities/organization-member.entity';
import { User } from '../../src/auth/entities/user.entity';
import { Repository } from 'typeorm';

export interface CreateOrganizationOptions {
  name?: string;
  slug?: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface CreateMembershipOptions {
  role?: OrganizationRole;
  permissions?: any;
}

export class OrganizationFactory {
  constructor(
    private organizationRepository: Repository<Organization>,
    private memberRepository: Repository<OrganizationMember>,
  ) {}

  /**
   * Create an organization entity (not saved to database)
   */
  build(options: CreateOrganizationOptions = {}): Organization {
    const org = new Organization();
    
    const timestamp = Date.now();
    org.name = options.name || `Test Organization ${timestamp}`;
    org.slug = options.slug || `test-org-${timestamp}`;
    org.description = options.description || 'Test organization description';
    org.settings = options.settings || {};
    org.createdAt = new Date();
    org.updatedAt = new Date();

    return org;
  }

  /**
   * Create and save an organization to the database
   */
  async create(options: CreateOrganizationOptions = {}): Promise<Organization> {
    const org = this.build(options);
    return this.organizationRepository.save(org);
  }

  /**
   * Create an organization with an owner
   */
  async createWithOwner(
    owner: User,
    orgOptions: CreateOrganizationOptions = {},
    memberOptions: CreateMembershipOptions = {}
  ): Promise<{ organization: Organization; membership: OrganizationMember }> {
    const organization = await this.create(orgOptions);
    
    const membership = await this.addMember(
      organization,
      owner,
      { ...memberOptions, role: OrganizationRole.OWNER }
    );

    return { organization, membership };
  }

  /**
   * Add a member to an organization
   */
  async addMember(
    organization: Organization,
    user: User,
    options: CreateMembershipOptions = {}
  ): Promise<OrganizationMember> {
    const member = new OrganizationMember();
    
    member.organizationId = organization.id;
    member.userId = user.id;
    member.role = options.role || OrganizationRole.MEMBER;
    member.permissions = options.permissions || {};
    member.joinedAt = new Date();
    member.createdAt = new Date();
    member.updatedAt = new Date();

    return this.memberRepository.save(member);
  }

  /**
   * Create an organization with multiple members
   */
  async createWithMembers(
    users: User[],
    orgOptions: CreateOrganizationOptions = {},
    memberRoles: OrganizationRole[] = []
  ): Promise<{
    organization: Organization;
    memberships: OrganizationMember[];
  }> {
    const organization = await this.create(orgOptions);
    const memberships: OrganizationMember[] = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const role = memberRoles[i] || (i === 0 ? OrganizationRole.OWNER : OrganizationRole.MEMBER);
      
      const membership = await this.addMember(organization, user, { role });
      memberships.push(membership);
    }

    return { organization, memberships };
  }

  /**
   * Create test data for organization tests
   */
  async createTestData(users: User[]) {
    if (users.length < 4) {
      throw new Error('Need at least 4 users for organization test data');
    }

    const [owner, admin, member, viewer] = users;

    const { organization, memberships } = await this.createWithMembers(
      [owner, admin, member, viewer],
      { name: 'Test Organization', slug: 'test-org' },
      [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.MEMBER, OrganizationRole.VIEWER]
    );

    return {
      organization,
      owner,
      admin,
      member,
      viewer,
      memberships,
      ownerMembership: memberships[0],
      adminMembership: memberships[1],
      memberMembership: memberships[2],
      viewerMembership: memberships[3],
    };
  }

  /**
   * Create multiple organizations
   */
  async createMany(count: number, options: CreateOrganizationOptions = {}): Promise<Organization[]> {
    const organizations: Organization[] = [];
    
    for (let i = 0; i < count; i++) {
      const orgOptions = {
        ...options,
        name: options.name || `Test Organization ${i + 1}`,
        slug: options.slug || `test-org-${Date.now()}-${i}`,
      };
      
      organizations.push(await this.create(orgOptions));
    }
    
    return organizations;
  }

  /**
   * Create organization with custom settings
   */
  async createWithSettings(
    settings: Record<string, any>,
    options: CreateOrganizationOptions = {}
  ): Promise<Organization> {
    return this.create({
      ...options,
      settings,
    });
  }
}
