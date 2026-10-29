export const rejectionReasons = [
  "profile_mismatch",
  "experience",
  "position_filled",
  "salary",
  "no_answer",
  "candidate_withdrew",
  "other",
] as const;

export type RejectionReason = (typeof rejectionReasons)[number];
