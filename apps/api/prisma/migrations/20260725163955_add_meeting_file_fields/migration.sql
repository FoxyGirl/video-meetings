-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "fileMimeType" TEXT,
ADD COLUMN     "fileOriginalName" TEXT,
ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "fileUploadedAt" TIMESTAMP(3);
