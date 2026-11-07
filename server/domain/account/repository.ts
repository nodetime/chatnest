export type AccountSettingsProjection = {
  account: {
    createdAt: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    name: string | null;
    updatedAt: string;
  };
  deletionRequest: {
    id: string;
    notificationStatus: "not_configured" | "pending" | "sent";
    reason: string | null;
    requestedAt: string;
    retentionUntil: string | null;
    retentionPurgedAt?: string | null;
    remoteDeactivationStatus:
      | "not_required"
      | "pending"
      | "completed"
      | "failed";
    status: "cancelled" | "completed" | "requested";
    tombstoneId: string | null;
  } | null;
  preferences: {
    defaultModelId: string | null;
    emailNotifications: boolean;
    revision: number;
    updatedAt: string;
  };
};

export type AccountExport = {
  account: AccountSettingsProjection["account"];
  deletionRequest: AccountSettingsProjection["deletionRequest"];
  exportedAt: string;
  preferences: AccountSettingsProjection["preferences"];
  chats: Array<{
    createdAt: string;
    id: string;
    messages: Array<{
      attachments: unknown;
      createdAt: string;
      id: string;
      parts: unknown;
      role: string;
    }>;
    title: string;
    visibility: string;
  }>;
  documents: Array<{
    content: string | null;
    createdAt: string;
    id: string;
    kind: string;
    title: string;
  }>;
};

export type AccountDeletionQueueItem = {
  completedAt: string | null;
  completedBy: string | null;
  email: string;
  id: string;
  name: string | null;
  notificationAddress?: string | null;
  reason: string | null;
  requestedAt: string;
  notificationStatus: "not_configured" | "pending" | "sent";
  remoteDeactivationError: string | null;
  remoteDeactivationRequestId: string | null;
  remoteDeactivationStatus: "not_required" | "pending" | "completed" | "failed";
  retentionUntil: string | null;
  retentionPurgedAt?: string | null;
  status: "cancelled" | "completed" | "requested";
  tombstoneId: string | null;
  userId: string;
};

export type AccountDeletionNotification = {
  address: string;
  requestId: string;
  retentionUntil: string | null;
  tombstoneId: string | null;
};

export interface AccountRepository {
  cancelDeletionRequest: (userId: string) => Promise<boolean>;
  completeDeletionRequest: (input: {
    completedBy: string;
    remoteDeactivationRequestId?: string;
    requestId: string;
  }) => Promise<"already_processed" | "completed" | "not_found">;
  exportData: (userId: string) => Promise<AccountExport | null>;
  getSettings: (userId: string) => Promise<AccountSettingsProjection | null>;
  listDeletionRequests: (limit?: number) => Promise<AccountDeletionQueueItem[]>;
  listPendingDeletionNotifications?: (
    limit?: number
  ) => Promise<AccountDeletionNotification[]>;
  markDeletionNotificationStatus?: (input: {
    requestId: string;
    status: "pending" | "sent";
  }) => Promise<void>;
  markDeletionRemoteFailure: (input: {
    error: string;
    requestId: string;
  }) => Promise<void>;
  purgeExpiredDeletionData?: (
    limit?: number
  ) => Promise<{ inspected: number; purged: number; skipped: number }>;
  requestDeletion: (
    userId: string,
    reason: string | null
  ) => Promise<AccountSettingsProjection | null>;
  revokeSessions: (userId: string) => Promise<number | null>;
  updatePreferences: (input: {
    defaultModelId: string | null;
    emailNotifications: boolean;
    expectedRevision: number;
    userId: string;
  }) => Promise<AccountSettingsProjection | null>;
  updateProfile: (input: {
    name: string | null;
    userId: string;
  }) => Promise<AccountSettingsProjection | null>;
}
