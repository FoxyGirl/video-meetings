// entities/meeting <-> entities/meeting-file coupling decision (Phase
// 4-fsd-v2): neither entity imports the other, and none is needed — Meeting
// has no MeetingFileMetadata-shaped field and vice versa, so there's no
// actual type-level dependency to resolve with an FSD v2.1 `@x` cross-
// import. The two ARE composed together (widgets/meeting-summary needs a
// meeting's summary fields plus its files' transcription statuses to decide
// what to render; widgets/meeting-files and _pages/meeting-detail need both
// to pair each file's card with its transcription card) — that composition
// is lifted to the widgets/pages layer, which is allowed to import both
// sibling entities since it sits strictly above them.
export {
  type SummaryStatus,
  type ActionItemMetadata,
  type DecisionMetadata,
  type Meeting,
  type CreateMeetingPayload,
  createMeeting,
  getMeetings,
  getMeeting,
  deleteMeeting,
} from './api';
