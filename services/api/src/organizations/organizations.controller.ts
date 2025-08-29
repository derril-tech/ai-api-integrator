import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { UserRole } from '../auth/entities/user.entity';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Body() createOrganizationDto: CreateOrganizationDto, @CurrentUser() user: User) {
    return this.organizationsService.create(createOrganizationDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.organizationsService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
    @CurrentUser() user: User
  ) {
    return this.organizationsService.update(id, updateOrganizationDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationsService.remove(id, user);
  }

  @Post(':id/users')
  addUser(
    @Param('id') id: string,
    @Body() body: { userId: string; role: UserRole },
    @CurrentUser() user: User
  ) {
    return this.organizationsService.addUser(id, body.userId, body.role, user);
  }

  @Patch(':id/users/:userId/role')
  updateUserRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: UserRole },
    @CurrentUser() user: User
  ) {
    return this.organizationsService.updateUserRole(id, userId, body.role, user);
  }
}
