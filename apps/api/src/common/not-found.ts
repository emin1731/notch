import { HttpStatus } from '@nestjs/common';
import { AppException } from './errors/app-exception.js';

export const coreNotFound = () =>
  new AppException('CORE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Core not found');
export const habitNotFound = () =>
  new AppException('HABIT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Habit not found');
export const reviewNotFound = () =>
  new AppException('REVIEW_NOT_FOUND', HttpStatus.NOT_FOUND, 'Review not found');
export const targetChangeNotFound = () =>
  new AppException('TARGET_CHANGE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Change not found');
