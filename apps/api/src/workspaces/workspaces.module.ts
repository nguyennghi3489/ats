import { type DynamicModule, Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

/**
 * Workspaces: `POST /api/workspaces` creates one. Pass the root's `AuthModule.forRoot(...)` module
 * (the same object, so Nest shares its instance) for the Better Auth sessions; the database is
 * global.
 */
@Module({})
export class WorkspacesModule {
  static forRoot(authModule: DynamicModule): DynamicModule {
    return {
      module: WorkspacesModule,
      imports: [authModule],
      controllers: [WorkspacesController],
      providers: [WorkspacesService],
    };
  }
}
