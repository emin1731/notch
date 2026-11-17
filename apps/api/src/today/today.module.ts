import { Module } from '@nestjs/common';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { TodayController } from './today.controller.js';
import { TodayService } from './today.service.js';

@Module({
  imports: [ReviewsModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
