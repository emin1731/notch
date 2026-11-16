import { HttpStatus } from '@nestjs/common';
import { AppException } from './errors/app-exception.js';

export const coreNotFound = () =>
  new AppException('CORE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Core not found');
export const goalNotFound = () =>
  new AppException('GOAL_NOT_FOUND', HttpStatus.NOT_FOUND, 'Goal not found');
export const milestoneNotFound = () =>
  new AppException('MILESTONE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Milestone not found');
export const habitNotFound = () =>
  new AppException('HABIT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Habit not found');
