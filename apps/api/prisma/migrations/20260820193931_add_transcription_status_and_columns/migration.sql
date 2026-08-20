-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "transcriptionStatus" "TranscriptionStatus",
ADD COLUMN     "transcriptionText" TEXT,
ADD COLUMN     "transcriptionUpdatedAt" TIMESTAMP(3);
