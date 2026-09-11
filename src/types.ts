export type ProviderName = "chatgpt";

export type SubmissionStatus =
  | "queued"
  | "opening"
  | "ready"
  | "typing"
  | "submit_started"
  | "submitted"
  | "uncertain"
  | "failed"
  | "human_action_required";

export interface ConversationRecord {
  alias: string;
  provider: ProviderName;
  profileId: string;
  conversationId?: string;
  conversationUrl: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface WebSessionSearchResult {
  title: string;
  conversationId: string;
  conversationUrl: string;
}

export interface SubmissionRecord {
  submissionId: string;
  idempotencyKey?: string;
  provider: ProviderName;
  profileId: string;
  conversationId?: string;
  conversationUrl?: string;
  promptSha256: string;
  promptLength: number;
  status: SubmissionStatus;
  attempt: number;
  createdAt: string;
  submitStartedAt?: string;
  submittedAt?: string;
  errorCode?: string;
}

export interface RelayState {
  version: 1;
  conversations: Record<string, ConversationRecord>;
  submissions: Record<string, SubmissionRecord>;
  idempotency: Record<string, string>;
}

export interface ConversationReference {
  conversationId?: string;
  conversationUrl: string;
}
