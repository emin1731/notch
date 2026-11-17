import { Module } from '@nestjs/common';
import { CoresModule } from '../cores/cores.module.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { HabitsController } from './habits.controller.js';
import { HabitsService } from './habits.service.js';

@Module({
  imports: [CoresModule, ReviewsModule],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
