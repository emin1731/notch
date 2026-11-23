-- AlterEnum
ALTER TYPE "TargetField" ADD VALUE 'INTERVAL_DAYS';

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "intervalDays" INTEGER;

-- Existing daily habits are due every day.
UPDATE "Habit" SET "intervalDays" = 1 WHERE "scheduleType" = 'DAILY';

-- Plan 5.2: rules Prisma can't express.
ALTER TABLE "Habit" ADD CONSTRAINT "habit_interval_range"
  CHECK ("intervalDays" IS NULL OR "intervalDays" BETWEEN 1 AND 30);
