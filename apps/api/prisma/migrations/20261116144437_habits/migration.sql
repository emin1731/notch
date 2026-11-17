-- CreateEnum
CREATE TYPE "HabitType" AS ENUM ('TOGGLE', 'COUNT', 'DURATION');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('DAILY', 'SPECIFIC_DAYS', 'TIMES_PER_WEEK');

-- CreateEnum
CREATE TYPE "TimeOfDay" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('PERCENT', 'ABSOLUTE');

-- CreateEnum
CREATE TYPE "TargetChangeKind" AS ENUM ('LEVEL_UP', 'DELOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "TargetField" AS ENUM ('TARGET_VALUE', 'TIMES_PER_WEEK', 'DAYS_OF_WEEK');

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coreId" TEXT NOT NULL,
    "goalId" TEXT,
    "name" TEXT NOT NULL,
    "type" "HabitType" NOT NULL,
    "unit" TEXT,
    "targetValue" INTEGER NOT NULL,
    "initialTargetValue" INTEGER NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL,
    "daysOfWeek" INTEGER[],
    "timesPerWeek" INTEGER,
    "initialTimesPerWeek" INTEGER,
    "timeOfDay" "TimeOfDay" NOT NULL DEFAULT 'ANYTIME',
    "adaptiveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "stepType" "StepType" NOT NULL DEFAULT 'PERCENT',
    "stepValue" INTEGER NOT NULL DEFAULT 10,
    "minTarget" INTEGER,
    "maxTarget" INTEGER,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetChange" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "kind" "TargetChangeKind" NOT NULL,
    "field" "TargetField" NOT NULL,
    "fromValue" INTEGER NOT NULL,
    "toValue" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "reason" JSONB,
    "undoDeadline" TIMESTAMPTZ(3),
    "undoneAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Habit_userId_archivedAt_idx" ON "Habit"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "Habit_coreId_idx" ON "Habit"("coreId");

-- CreateIndex
CREATE INDEX "Habit_goalId_idx" ON "Habit"("goalId");

-- CreateIndex
CREATE INDEX "TargetChange_habitId_effectiveFrom_idx" ON "TargetChange"("habitId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_coreId_fkey" FOREIGN KEY ("coreId") REFERENCES "Core"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetChange" ADD CONSTRAINT "TargetChange_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Plan 5.2: rules Prisma can't express.
ALTER TABLE "Habit" ADD CONSTRAINT "habit_target_positive" CHECK ("targetValue" >= 1);
ALTER TABLE "Habit" ADD CONSTRAINT "habit_tpw_range"
  CHECK ("timesPerWeek" IS NULL OR "timesPerWeek" BETWEEN 1 AND 7);
