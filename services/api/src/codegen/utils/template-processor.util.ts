import * as fs from 'fs';
import * as path from 'path';

export interface TemplateVariables {
  [key: string]: string | number | boolean;
}

export class TemplateProcessor {
  private static templateCache: Map<string, string> = new Map();

  /**
   * Load a template file from the templates directory
   */
  static loadTemplate(templatePath: string): string {
    if (this.templateCache.has(templatePath)) {
      return this.templateCache.get(templatePath)!;
    }

    const fullPath = path.join(__dirname, '../templates', templatePath);
    const template = fs.readFileSync(fullPath, 'utf-8');
    this.templateCache.set(templatePath, template);
    return template;
  }

  /**
   * Process a template by replacing variables
   */
  static processTemplate(template: string, variables: TemplateVariables): string {
    let processed = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      processed = processed.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return processed;
  }

  /**
   * Load and process a template file
   */
  static processTemplateFile(templatePath: string, variables: TemplateVariables): string {
    const template = this.loadTemplate(templatePath);
    return this.processTemplate(template, variables);
  }

  /**
   * Generate multiple files from templates
   */
  static generateFiles(
    templates: Array<{ templatePath: string; outputPath: string; variables: TemplateVariables }>
  ): Array<{ path: string; content: string }> {
    return templates.map(({ templatePath, outputPath, variables }) => ({
      path: this.processTemplate(outputPath, variables),
      content: this.processTemplateFile(templatePath, variables),
    }));
  }

  /**
   * Clear the template cache (useful for development)
   */
  static clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Get template variables from project/entity data
   */
  static getEntityVariables(entityName: string, projectName: string): TemplateVariables {
    return {
      entityName,
      serviceName: `${entityName.toLowerCase()}Service`,
      controllerName: `${entityName}Controller`,
      dtoName: `Create${entityName}Dto`,
      projectName,
      timestamp: new Date().toISOString(),
    };
  }
}
