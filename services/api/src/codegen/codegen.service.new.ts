import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { TemplateProcessor, TemplateVariables } from './utils/template-processor.util';

export interface NestJSServerTemplate {
  controllers: string[];
  services: string[];
  modules: string[];
  dtos: string[];
  interceptors: string[];
  middlewares: string[];
  guards: string[];
  filters: string[];
}

@Injectable()
export class CodegenService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async generateNestJSServerAdapter(projectId: string): Promise<NestJSServerTemplate> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    const variables = TemplateProcessor.getEntityVariables(project.name, project.name);

    const templates = [
      { templatePath: 'nestjs/main.controller.template', outputPath: 'controllers/{{entityName}}.controller.ts', variables },
      { templatePath: 'nestjs/main.service.template', outputPath: 'services/{{entityName}}.service.ts', variables },
      { templatePath: 'nestjs/app.module.template', outputPath: 'app.module.ts', variables },
      { templatePath: 'nestjs/base.dto.template', outputPath: 'dtos/create-{{entityName}}.dto.ts', variables },
      { templatePath: 'nestjs/logging.interceptor.template', outputPath: 'interceptors/logging.interceptor.ts', variables },
      { templatePath: 'nestjs/tracing.interceptor.template', outputPath: 'interceptors/tracing.interceptor.ts', variables },
      { templatePath: 'nestjs/cors.middleware.template', outputPath: 'middlewares/cors.middleware.ts', variables },
      { templatePath: 'nestjs/rate-limit.middleware.template', outputPath: 'middlewares/rate-limit.middleware.ts', variables },
      { templatePath: 'nestjs/auth.guard.template', outputPath: 'guards/auth.guard.ts', variables },
      { templatePath: 'nestjs/http-exception.filter.template', outputPath: 'filters/http-exception.filter.ts', variables },
      { templatePath: 'nestjs/logger.service.template', outputPath: 'services/logger.service.ts', variables },
    ];

    const generatedFiles = TemplateProcessor.generateFiles(templates);

    // Group files by type
    const result: NestJSServerTemplate = {
      controllers: [],
      services: [],
      modules: [],
      dtos: [],
      interceptors: [],
      middlewares: [],
      guards: [],
      filters: [],
    };

    generatedFiles.forEach(file => {
      const content = file.content;

      if (file.path.includes('/controllers/')) {
        result.controllers.push(content);
      } else if (file.path.includes('/services/')) {
        result.services.push(content);
      } else if (file.path.includes('app.module.ts')) {
        result.modules.push(content);
      } else if (file.path.includes('/dtos/')) {
        result.dtos.push(content);
      } else if (file.path.includes('/interceptors/')) {
        result.interceptors.push(content);
      } else if (file.path.includes('/middlewares/')) {
        result.middlewares.push(content);
      } else if (file.path.includes('/guards/')) {
        result.guards.push(content);
      } else if (file.path.includes('/filters/')) {
        result.filters.push(content);
      }
    });

    return result;
  }
}
