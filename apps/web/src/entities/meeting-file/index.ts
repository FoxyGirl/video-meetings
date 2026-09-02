// See entities/meeting/index.ts for the entities/meeting <->
// entities/meeting-file coupling decision (Phase 4-fsd-v2): this entity
// never imports entities/meeting, and never needs to — the two are composed
// together only above this layer, in widgets/pages.
export {
  type TranscriptionStatus,
  type MeetingFileMetadata,
  ACCEPTED_FILE_TYPES,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_FILES_PER_MEETING,
  validateFile,
  formatFileSize,
  listMeetingFiles,
  downloadMeetingFile,
  deleteMeetingFile,
} from './api';
export { MeetingFileCard } from './ui/meeting-file-card';
