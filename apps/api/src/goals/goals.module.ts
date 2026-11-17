import { Module } from '@nestjs/common';
import { CoresModule } from '../cores/cores.module.js';
import { MilestonesModule } from '../milestones/milestones.module.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [CoresModule, MilestonesModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
