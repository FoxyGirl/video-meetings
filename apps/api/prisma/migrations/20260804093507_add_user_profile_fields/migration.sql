-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarMimeType" TEXT,
ADD COLUMN     "avatarPath" TEXT,
ADD COLUMN     "avatarUploadedAt" TIMESTAMP(3),
ADD COLUMN     "username" TEXT;
