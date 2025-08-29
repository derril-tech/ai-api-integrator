import { User, AuthProvider } from '../../src/auth/entities/user.entity';
import { Repository } from 'typeorm';

export interface CreateUserOptions {
  email?: string;
  name?: string;
  provider?: AuthProvider;
  providerId?: string;
  emailVerified?: boolean;
  isActive?: boolean;
}

export class UserFactory {
  constructor(private userRepository: Repository<User>) {}

  /**
   * Create a user entity (not saved to database)
   */
  build(options: CreateUserOptions = {}): User {
    const user = new User();
    
    user.email = options.email || `test-${Date.now()}@example.com`;
    user.name = options.name || 'Test User';
    user.provider = options.provider || AuthProvider.EMAIL;
    user.providerId = options.providerId;
    user.emailVerified = options.emailVerified ?? true;
    user.isActive = options.isActive ?? true;
    user.createdAt = new Date();
    user.updatedAt = new Date();

    return user;
  }

  /**
   * Create and save a user to the database
   */
  async create(options: CreateUserOptions = {}): Promise<User> {
    const user = this.build(options);
    return this.userRepository.save(user);
  }

  /**
   * Create multiple users
   */
  async createMany(count: number, options: CreateUserOptions = {}): Promise<User[]> {
    const users: User[] = [];
    
    for (let i = 0; i < count; i++) {
      const userOptions = {
        ...options,
        email: options.email || `test-${Date.now()}-${i}@example.com`,
        name: options.name || `Test User ${i + 1}`,
      };
      
      users.push(await this.create(userOptions));
    }
    
    return users;
  }

  /**
   * Create a user with specific provider
   */
  async createWithProvider(provider: AuthProvider, options: CreateUserOptions = {}): Promise<User> {
    return this.create({
      ...options,
      provider,
      providerId: options.providerId || `${provider}-${Date.now()}`,
      emailVerified: true,
    });
  }

  /**
   * Create an admin user
   */
  async createAdmin(options: CreateUserOptions = {}): Promise<User> {
    return this.create({
      ...options,
      email: options.email || `admin-${Date.now()}@example.com`,
      name: options.name || 'Admin User',
      emailVerified: true,
      isActive: true,
    });
  }

  /**
   * Create an inactive user
   */
  async createInactive(options: CreateUserOptions = {}): Promise<User> {
    return this.create({
      ...options,
      isActive: false,
    });
  }

  /**
   * Create a user with unverified email
   */
  async createUnverified(options: CreateUserOptions = {}): Promise<User> {
    return this.create({
      ...options,
      emailVerified: false,
    });
  }

  /**
   * Create test data for authentication tests
   */
  async createAuthTestData() {
    const [emailUser, googleUser, githubUser, inactiveUser, unverifiedUser] = await Promise.all([
      this.create({ email: 'email-user@test.com', provider: AuthProvider.EMAIL }),
      this.createWithProvider(AuthProvider.GOOGLE, { email: 'google-user@test.com' }),
      this.createWithProvider(AuthProvider.GITHUB, { email: 'github-user@test.com' }),
      this.createInactive({ email: 'inactive-user@test.com' }),
      this.createUnverified({ email: 'unverified-user@test.com' }),
    ]);

    return {
      emailUser,
      googleUser,
      githubUser,
      inactiveUser,
      unverifiedUser,
    };
  }
}
