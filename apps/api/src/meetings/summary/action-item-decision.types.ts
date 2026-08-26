// Shared response shape for action items/decisions returned alongside a
// meeting — mirrors meeting-file.types.ts's toMeetingFileMetadata precedent:
// a small, explicit response-shaping function rather than returning raw
// Prisma rows (meetingId, createdAt, updatedAt are internal details no
// client needs).
export interface ActionItemMetadata {
  id: string;
  description: string;
  assignee: string | null;
}

export interface DecisionMetadata {
  id: string;
  description: string;
}

export function toActionItemMetadata(item: {
  id: string;
  description: string;
  assignee: string | null;
}): ActionItemMetadata {
  return {
    id: item.id,
    description: item.description,
    assignee: item.assignee,
  };
}

export function toDecisionMetadata(decision: {
  id: string;
  description: string;
}): DecisionMetadata {
  return { id: decision.id, description: decision.description };
}
