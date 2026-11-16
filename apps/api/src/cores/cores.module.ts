import { Module } from '@nestjs/common';
import { CoresController } from './cores.controller.js';
import { CoresService } from './cores.service.js';

@Module({
  controllers: [CoresController],
  providers: [CoresService],
  exports: [CoresService],
})
export class CoresModule {}
