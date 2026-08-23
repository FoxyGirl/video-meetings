-- CreateTable
CREATE TABLE "MeetingFile" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "transcriptionStatus" "TranscriptionStatus",
    "transcriptionText" TEXT,
    "transcriptionUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingFile_meetingId_idx" ON "MeetingFile"("meetingId");

-- AddForeignKey
ALTER TABLE "MeetingFile" ADD CONSTRAINT "MeetingFile_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: move each existing meeting's non-null file/transcription
-- columns into one MeetingFile row before those columns are dropped from
-- Meeting below. A meeting with no stored file (filePath IS NULL) has
-- nothing to migrate.
INSERT INTO "MeetingFile" (
    "id", "meetingId", "originalName", "filePath", "mimeType", "size",
    "uploadedAt", "transcriptionStatus", "transcriptionText",
    "transcriptionUpdatedAt", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    "id",
    "fileOriginalName",
    "filePath",
    "fileMimeType",
    "fileSize",
    "fileUploadedAt",
    "transcriptionStatus",
    "transcriptionText",
    "transcriptionUpdatedAt",
    COALESCE("fileUploadedAt", CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "Meeting"
WHERE "filePath" IS NOT NULL;

-- AlterTable
ALTER TABLE "Meeting" DROP COLUMN "fileMimeType",
DROP COLUMN "fileOriginalName",
DROP COLUMN "filePath",
DROP COLUMN "fileSize",
DROP COLUMN "fileUploadedAt",
DROP COLUMN "transcriptionStatus",
DROP COLUMN "transcriptionText",
DROP COLUMN "transcriptionUpdatedAt";
