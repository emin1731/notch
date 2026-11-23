/*
  Warnings:

  - You are about to drop the column `goalId` on the `Habit` table. All the data in the column will be lost.
  - You are about to drop the `Goal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Milestone` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_userId_fkey";

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_coreId_fkey";

-- DropForeignKey
ALTER TABLE "Milestone" DROP CONSTRAINT "Milestone_goalId_fkey";

-- DropForeignKey
ALTER TABLE "Habit" DROP CONSTRAINT "Habit_goalId_fkey";

-- DropIndex
DROP INDEX "Habit_goalId_idx";

-- AlterTable
ALTER TABLE "Habit" DROP COLUMN "goalId";

-- DropTable
DROP TABLE "Goal";

-- DropTable
DROP TABLE "Milestone";

-- DropEnum
DROP TYPE "GoalStatus";
