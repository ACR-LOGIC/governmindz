/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GitHub connector boundary.
 *
 * Responsibilities:
 * - GitHub App installation authorization
 * - Installation-scoped repository access
 * - Initial and incremental synchronization
 * - Webhook verification and normalization
 * - Connector health and rate-limit reporting
 * - Revocation, export, and deletion
 * - Approved external actions
 *
 * Non-responsibilities:
 * - Persisting normalized records
 * - Generating AI observations
 * - Deciding whether an action is approved
 * - Executing repository code
 * - Combining data across projects
 */

/* -------------------------------------------------------------------------- */
/*                                 Identifiers                                */
/* -------------------------------------------------------------------------- */

export type WorkspaceId = string;
export type ProjectId = string;
export type IntegrationId = string;
export type ConnectedAccountId = string;
export type ConnectorJobId = string;
export type ApprovalId = string;
export type UserId = string;

export type GitHubInstallationId = number;
export type GitHubRepositoryId = number;
export type GitHubAccountId = number;

/* -------------------------------------------------------------------------- */
/*                               Shared values                                */
/* -------------------------------------------------------------------------- */

export type ISODateTime = string;

export type ConnectorAccessMode =
  | "read_only"
  | "read_write";

export type ConnectorStatus =
  | "pending"
  | "active"
  | "degraded"
  | "reauthorization_required"
  | "suspended"
  | "revoked"
  | "disconnected"
  | "error";

export type SyncMode =
  | "initial"
  | "incremental"
  | "reconciliation"
  | "webhook";

export type SyncStatus =
  | "pending"
  | "running"
  | "completed"
  | "partially_completed"
  | "rate_limited"
  | "failed"
  | "canceled";

export type SourceVisibility =
  | "public"
  | "private"
  | "internal"
  | "unknown";

export type SourceLifecycleState =
  | "active"
  | "deleted"
  | "inaccessible"
  | "unknown";

export type GitHubPermissionLevel =
  | "read"
  | "write"
  | "admin";

export type RetryDisposition =
  | "retry"
  | "do_not_retry"
  | "reauthorize"
  | "wait_for_rate_limit"
  | "manual_intervention";

export interface ConnectorError {
  code: string;
  message: string;

  retryDisposition: RetryDisposition;
  retryAfter?: ISODateTime;

  httpStatus?: number;
  providerRequestId?: string;
  providerDocumentationUrl?: string;

  /**
   * Safe diagnostic context only.
   * Tokens, secrets, private source content, and raw authorization headers
   * must never be included.
   */
  safeDetails?: Record<string, unknown>;

  cause?: unknown;
}

export interface ConnectorOperationResult {
  success: boolean;
  errors: ConnectorError[];
  warnings: ConnectorWarning[];
}

export interface ConnectorWarning {
  code: string;
  message: string;
  safeDetails?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*                              Connector metadata                            */
/* -------------------------------------------------------------------------- */

export interface ConnectorDescriptor {
  type: "github";
  displayName: "GitHub";
  version: string;

  supportedAccessModes: ConnectorAccessMode[];
  supportedSourceTypes: GitHubSourceObjectType[];
  supportedWebhookEvents: GitHubWebhookEventName[];
  supportedExternalActions: GitHubExternalActionType[];

  capabilities: {
    initialSync: true;
    incrementalSync: true;
    webhookSync: true;
    pollingSync: true;
    manualRefresh: true;
    export: true;
    deletion: true;
    writeActions: boolean;
  };
}

/* -------------------------------------------------------------------------- */
/*                              GitHub permissions                            */
/* -------------------------------------------------------------------------- */

export type GitHubRepositoryPermission =
  | "metadata"
  | "contents"
  | "issues"
  | "pull_requests"
  | "checks"
  | "actions"
  | "commit_statuses"
  | "deployments"
  | "security_events"
  | "administration";

export type GitHubOrganizationPermission =
  | "members"
  | "organization_projects"
  | "organization_administration";

export interface GitHubPermissionSet {
  repository: Partial<
    Record<GitHubRepositoryPermission, GitHubPermissionLevel>
  >;

  organization: Partial<
    Record<GitHubOrganizationPermission, GitHubPermissionLevel>
  >;
}

/**
 * Suggested MVP permission configuration.
 *
 * Verify the required permission for every endpoint during implementation.
 * Do not assume one permission covers every endpoint in a source category.
 */
export const GITHUB_MVP_READ_PERMISSIONS: GitHubPermissionSet = {
  repository: {
    metadata: "read",
    contents: "read",
    issues: "read",
    pull_requests: "read",
    checks: "read",
    actions: "read",
    commit_statuses: "read",
    deployments: "read",
  },
  organization: {},
};

/* -------------------------------------------------------------------------- */
/*                               Authorization                                */
/* -------------------------------------------------------------------------- */

export interface GitHubAuthorizationRequest {
  workspaceId: WorkspaceId;
  projectId: ProjectId;
  requestedBy: UserId;

  /**
   * Cryptographically random value associated with the current authorization
   * attempt. It must be single-use and expire quickly.
   */
  state: string;

  callbackUrl: string;
  requestedAccessMode: ConnectorAccessMode;

  /**
   * An optional application return path, not a fully trusted redirect URL.
   */
  returnPath?: string;
}

export interface GitHubAuthorizationRedirect {
  authorizationUrl: string;
  state: string;
  expiresAt: ISODateTime;
}

export interface GitHubAuthorizationCallback {
  state: string;

  /**
   * GitHub App installation identifier supplied through the setup or callback
   * flow.
   */
  installationId: GitHubInstallationId;

  /**
   * Present when GitHub provides the chosen repository setup action.
   */
  setupAction?: "install" | "update";

  /**
   * Optional OAuth code if user authorization is enabled separately from
   * installation authorization.
   */
  code?: string;
}

export interface GitHubConnectedAccount {
  id: ConnectedAccountId;
  workspaceId: WorkspaceId;

  provider: "github";
  installationId: GitHubInstallationId;

  account: {
    id: GitHubAccountId;
    login: string;
    type: "User" | "Organization";
    avatarUrl?: string;
    profileUrl?: string;
  };

  grantedPermissions: GitHubPermissionSet;
  repositorySelection: "all" | "selected";
  accessMode: ConnectorAccessMode;
  status: ConnectorStatus;

  installedAt?: ISODateTime;
  connectedAt: ISODateTime;
  lastValidatedAt: ISODateTime;

  /**
   * Reference to encrypted platform-managed credential material.
   * Never store a plaintext token in this object.
   */
  credentialReference: string;
}

/* -------------------------------------------------------------------------- */
/*                                Repositories                                */
/* -------------------------------------------------------------------------- */

export interface GitHubRepositoryReference {
  id: GitHubRepositoryId;
  nodeId?: string;

  owner: string;
  name: string;
  fullName: string;

  defaultBranch: string;
  visibility: "public" | "private" | "internal";

  archived: boolean;
  disabled: boolean;
  fork: boolean;

  htmlUrl: string;
  apiUrl?: string;

  pushedAt?: ISODateTime;
  updatedAt?: ISODateTime;
}

export interface GitHubRepositoryBinding {
  integrationId: IntegrationId;
  workspaceId: WorkspaceId;
  projectId: ProjectId;
  connectedAccountId: ConnectedAccountId;

  installationId: GitHubInstallationId;
  repository: GitHubRepositoryReference;

  enabledSourceTypes: GitHubSourceObjectType[];
  accessMode: ConnectorAccessMode;

  publicDisclosureAllowed: boolean;
  status: ConnectorStatus;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/*                              Source envelopes                              */
/* -------------------------------------------------------------------------- */

export type GitHubSourceObjectType =
  | "repository"
  | "repository_file"
  | "readme"
  | "commit"
  | "branch"
  | "tag"
  | "release"
  | "issue"
  | "issue_comment"
  | "pull_request"
  | "pull_request_review"
  | "pull_request_comment"
  | "check_run"
  | "check_suite"
  | "workflow_run"
  | "commit_status"
  | "deployment"
  | "deployment_status";

export interface GitHubSourceEnvelope<TPayload = unknown> {
  schemaVersion: "1.0";

  connectorType: "github";
  sourceType: GitHubSourceObjectType;

  workspaceId: WorkspaceId;
  projectId: ProjectId;
  integrationId: IntegrationId;
  connectedAccountId: ConnectedAccountId;

  installationId: GitHubInstallationId;
  repositoryId: GitHubRepositoryId;

  /**
   * Stable provider-specific identifier.
   *
   * Examples:
   * - repository ID
   * - issue ID
   * - pull request ID
   * - commit SHA
   * - repository ID plus file path
   */
  sourceObjectId: string;

  /**
   * Provider version or immutable revision where one exists.
   */
  sourceVersion?: string;

  sourceUrl?: string;
  apiUrl?: string;

  observedAt: ISODateTime;
  sourceCreatedAt?: ISODateTime;
  sourceUpdatedAt?: ISODateTime;
  sourceDeletedAt?: ISODateTime;

  lifecycleState: SourceLifecycleState;
  visibility: SourceVisibility;

  /**
   * SHA-256 hash of the canonicalized source representation.
   */
  contentHash: string;

  /**
   * Identifies the sync or webhook delivery that produced this envelope.
   */
  ingestionKey: string;

  payload: TPayload;

  /**
   * Optional encrypted object-storage reference for the original payload.
   */
  rawObjectReference?: string;

  metadata: {
    repositoryFullName: string;
    defaultBranch?: string;
    path?: string;
    ref?: string;
    sha?: string;
    number?: number;
    deliveryId?: string;
  };
}

/* -------------------------------------------------------------------------- */
/*                              Sync operations                               */
/* -------------------------------------------------------------------------- */

export interface GitHubSyncCursor {
  schemaVersion: "1.0";

  /**
   * Connector-managed opaque cursor.
   * Consumers must persist but not interpret this value.
   */
  value: string;

  createdAt: ISODateTime;
  sourceWatermark?: ISODateTime;
}

export interface GitHubSyncRequest {
  jobId: ConnectorJobId;
  mode: SyncMode;

  workspaceId: WorkspaceId;
  projectId: ProjectId;
  integrationId: IntegrationId;
  connectedAccountId: ConnectedAccountId;

  installationId: GitHubInstallationId;
  repository: GitHubRepositoryReference;

  enabledSourceTypes: GitHubSourceObjectType[];

  cursor?: GitHubSyncCursor;

  /**
   * Optional bounded range for reconciliation.
   */
  changedSince?: ISODateTime;
  changedUntil?: ISODateTime;

  /**
   * Protects the worker from unbounded imports.
   */
  limits: {
    maxObjects: number;
    maxBytes: number;
    deadline: ISODateTime;
  };

  requestedAt: ISODateTime;
  requestedBy: UserId | "system";
}

export interface GitHubSyncProgress {
  jobId: ConnectorJobId;
  status: SyncStatus;

  startedAt?: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime;

  discoveredObjects: number;
  emittedObjects: number;
  skippedObjects: number;
  failedObjects: number;

  processedBytes: number;

  currentSourceType?: GitHubSourceObjectType;
  nextCursor?: GitHubSyncCursor;

  rateLimit?: GitHubRateLimitState;

  errors: ConnectorError[];
  warnings: ConnectorWarning[];
}

export type GitHubSyncEvent =
  | {
      type: "progress";
      progress: GitHubSyncProgress;
    }
  | {
      type: "source";
      envelope: GitHubSourceEnvelope;
    }
  | {
      type: "checkpoint";
      cursor: GitHubSyncCursor;
      progress: GitHubSyncProgress;
    }
  | {
      type: "completed";
      progress: GitHubSyncProgress;
    };

/* -------------------------------------------------------------------------- */
/*                               Rate limiting                                */
/* -------------------------------------------------------------------------- */

export interface GitHubRateLimitBucket {
  resource: string;
  limit: number;
  remaining: number;
  used?: number;
  resetAt: ISODateTime;
}

export interface GitHubRateLimitState {
  observedAt: ISODateTime;
  primary?: GitHubRateLimitBucket;

  /**
   * Secondary limits do not necessarily expose a complete remaining/reset
   * model, so retain the provider's suggested retry time when available.
   */
  secondaryLimitActive: boolean;
  retryAfter?: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/*                                  Webhooks                                  */
/* -------------------------------------------------------------------------- */

export type GitHubWebhookEventName =
  | "installation"
  | "installation_repositories"
  | "repository"
  | "push"
  | "create"
  | "delete"
  | "issues"
  | "issue_comment"
  | "pull_request"
  | "pull_request_review"
  | "pull_request_review_comment"
  | "release"
  | "check_run"
  | "check_suite"
  | "workflow_run"
  | "status"
  | "deployment"
  | "deployment_status"
  | "ping";

export interface GitHubWebhookHeaders {
  deliveryId: string;
  eventName: GitHubWebhookEventName;
  signature256: string;
  hookId?: string;
  targetType?: string;
  targetId?: string;
  userAgent?: string;
}

export interface GitHubWebhookRequest {
  headers: GitHubWebhookHeaders;

  /**
   * Exact raw bytes received from GitHub.
   * Signature verification must happen before JSON parsing or processing.
   */
  rawBody: Uint8Array;

  receivedAt: ISODateTime;
}

export interface VerifiedGitHubWebhook<TPayload = unknown> {
  deliveryId: string;
  eventName: GitHubWebhookEventName;

  signatureVerified: true;
  verifiedAt: ISODateTime;
  receivedAt: ISODateTime;

  installationId?: GitHubInstallationId;
  repositoryId?: GitHubRepositoryId;

  payload: TPayload;
}

export type GitHubWebhookDisposition =
  | "accepted"
  | "duplicate"
  | "ignored"
  | "rejected"
  | "requires_reconciliation";

export interface GitHubWebhookResult extends ConnectorOperationResult {
  deliveryId: string;
  eventName: GitHubWebhookEventName;
  disposition: GitHubWebhookDisposition;

  emitted: GitHubSourceEnvelope[];
  scheduledSync?: GitHubSyncRequest;

  processedAt: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/*                              Connector health                              */
/* -------------------------------------------------------------------------- */

export interface GitHubConnectorHealth {
  status: ConnectorStatus;
  checkedAt: ISODateTime;

  authorization: {
    valid: boolean;
    installationAccessible: boolean;
    repositoryAccessible: boolean;
    reauthorizationRequired: boolean;
    missingPermissions: string[];
  };

  synchronization: {
    lastAttemptedAt?: ISODateTime;
    lastSuccessfulAt?: ISODateTime;
    lastWebhookAt?: ISODateTime;
    lastReconciliationAt?: ISODateTime;

    consecutiveFailures: number;
    staleSourceTypes: GitHubSourceObjectType[];
  };

  rateLimit?: GitHubRateLimitState;

  errors: ConnectorError[];
  warnings: ConnectorWarning[];
}

/* -------------------------------------------------------------------------- */
/*                         External write operations                          */
/* -------------------------------------------------------------------------- */

export type GitHubExternalActionType =
  | "create_issue"
  | "update_issue"
  | "create_issue_comment"
  | "create_release"
  | "update_release"
  | "create_pull_request_comment";

export interface GitHubExternalActionBase {
  type: GitHubExternalActionType;

  workspaceId: WorkspaceId;
  projectId: ProjectId;
  integrationId: IntegrationId;
  connectedAccountId: ConnectedAccountId;

  installationId: GitHubInstallationId;
  repositoryId: GitHubRepositoryId;

  /**
   * Stable caller-generated key.
   * Repeated requests with the same key must not produce duplicate writes.
   */
  idempotencyKey: string;

  requestedBy: UserId;
  requestedAt: ISODateTime;
}

export interface GitHubCreateIssueAction
  extends GitHubExternalActionBase {
  type: "create_issue";
  payload: {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  };
}

export interface GitHubUpdateIssueAction
  extends GitHubExternalActionBase {
  type: "update_issue";
  payload: {
    issueNumber: number;
    title?: string;
    body?: string;
    state?: "open" | "closed";
    labels?: string[];
    assignees?: string[];
  };
}

export interface GitHubCreateIssueCommentAction
  extends GitHubExternalActionBase {
  type: "create_issue_comment";
  payload: {
    issueNumber: number;
    body: string;
  };
}

export interface GitHubCreateReleaseAction
  extends GitHubExternalActionBase {
  type: "create_release";
  payload: {
    tagName: string;
    name: string;
    body: string;
    targetCommitish?: string;
    draft: boolean;
    prerelease: boolean;
  };
}

export interface GitHubUpdateReleaseAction
  extends GitHubExternalActionBase {
  type: "update_release";
  payload: {
    releaseId: number;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
  };
}

export interface GitHubCreatePullRequestCommentAction
  extends GitHubExternalActionBase {
  type: "create_pull_request_comment";
  payload: {
    pullRequestNumber: number;
    body: string;
  };
}

export type GitHubExternalAction =
  | GitHubCreateIssueAction
  | GitHubUpdateIssueAction
  | GitHubCreateIssueCommentAction
  | GitHubCreateReleaseAction
  | GitHubUpdateReleaseAction
  | GitHubCreatePullRequestCommentAction;

/* -------------------------------------------------------------------------- */
/*                               Bound approval                               */
/* -------------------------------------------------------------------------- */

export interface BoundApproval {
  id: ApprovalId;

  workspaceId: WorkspaceId;
  projectId: ProjectId;

  actionType: GitHubExternalActionType;

  /**
   * SHA-256 hash of the canonical external action, including target account,
   * repository, destination, content, and material execution settings.
   */
  actionHash: string;

  approvedBy: UserId;
  approvedAt: ISODateTime;
  expiresAt: ISODateTime;

  status: "approved";

  connectedAccountId: ConnectedAccountId;
  repositoryId: GitHubRepositoryId;

  /**
   * Prevents approval reuse after execution.
   */
  singleUse: true;
}

export interface GitHubExternalActionResult
  extends ConnectorOperationResult {
  actionType: GitHubExternalActionType;
  idempotencyKey: string;

  status:
    | "completed"
    | "failed"
    | "indeterminate"
    | "approval_invalid"
    | "permission_denied";

  providerRequestId?: string;
  externalObjectId?: string;
  externalUrl?: string;

  executedAt?: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/*                              Export/deletion                               */
/* -------------------------------------------------------------------------- */

export interface GitHubExportRequest {
  workspaceId: WorkspaceId;
  projectId: ProjectId;
  integrationId: IntegrationId;
  requestedBy: UserId;
  requestedAt: ISODateTime;
}

export interface GitHubExportManifest {
  exportId: string;
  createdAt: ISODateTime;

  objectReference: string;
  contentType: "application/zip";
  checksum: string;

  includedSourceTypes: GitHubSourceObjectType[];
  sourceObjectCount: number;
}

export interface GitHubDeletionRequest {
  workspaceId: WorkspaceId;
  projectId: ProjectId;
  integrationId: IntegrationId;

  mode:
    | "disconnect_only"
    | "delete_credentials"
    | "delete_connector_data"
    | "delete_all";

  requestedBy: UserId;
  requestedAt: ISODateTime;
}

export interface GitHubDeletionResult
  extends ConnectorOperationResult {
  disconnected: boolean;
  credentialsDeleted: boolean;
  connectorDataDeleted: boolean;

  /**
   * Audit hashes or records retained under the application's retention policy.
   */
  retainedAuditRecordCount: number;

  completedAt: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/*                         Main connector interface                           */
/* -------------------------------------------------------------------------- */

export interface GitHubConnector {
  descriptor(): ConnectorDescriptor;

  /* Authorization */

  beginAuthorization(
    request: GitHubAuthorizationRequest,
  ): Promise<GitHubAuthorizationRedirect>;

  completeAuthorization(
    callback: GitHubAuthorizationCallback,
  ): Promise<GitHubConnectedAccount>;

  /* Repository selection */

  listAccessibleRepositories(
    connectedAccountId: ConnectedAccountId,
  ): AsyncIterable<GitHubRepositoryReference>;

  bindRepository(
    binding: Omit<
      GitHubRepositoryBinding,
      "integrationId" | "createdAt" | "updatedAt"
    >,
  ): Promise<GitHubRepositoryBinding>;

  unbindRepository(
    integrationId: IntegrationId,
  ): Promise<ConnectorOperationResult>;

  /* Health */

  testConnection(
    integrationId: IntegrationId,
  ): Promise<GitHubConnectorHealth>;

  /* Synchronization */

  initialSync(
    request: GitHubSyncRequest & { mode: "initial" },
  ): AsyncIterable<GitHubSyncEvent>;

  incrementalSync(
    request: GitHubSyncRequest & {
      mode: "incremental" | "reconciliation";
    },
  ): AsyncIterable<GitHubSyncEvent>;

  /* Webhooks */

  verifyWebhook(
    request: GitHubWebhookRequest,
  ): Promise<VerifiedGitHubWebhook>;

  handleWebhook(
    webhook: VerifiedGitHubWebhook,
  ): Promise<GitHubWebhookResult>;

  /* Controlled writes */

  execute(
    action: GitHubExternalAction,
    approval: BoundApproval,
  ): Promise<GitHubExternalActionResult>;

  /* Lifecycle */

  revoke(
    connectedAccountId: ConnectedAccountId,
  ): Promise<ConnectorOperationResult>;

  disconnect(
    integrationId: IntegrationId,
  ): Promise<ConnectorOperationResult>;

  exportData(
    request: GitHubExportRequest,
  ): Promise<GitHubExportManifest>;

  deleteData(
    request: GitHubDeletionRequest,
  ): Promise<GitHubDeletionResult>;
}

/* -------------------------------------------------------------------------- */
/*                          Approval validator                                */
/* -------------------------------------------------------------------------- */

The connector should independently validate approval at the execution boundary, even if the application service already performed the same validation.

import { createHash, timingSafeEqual } from "node:crypto";

import type {
  BoundApproval,
  GitHubExternalAction,
} from "./github-connector";

export interface ApprovalValidationResult {
  valid: boolean;
  reason?:
    | "wrong_workspace"
    | "wrong_project"
    | "wrong_action_type"
    | "wrong_account"
    | "wrong_repository"
    | "expired"
    | "hash_mismatch";
}

export function canonicalizeGitHubAction(
  action: GitHubExternalAction,
): string {
  return stableStringify(action);
}

export function hashGitHubAction(
  action: GitHubExternalAction,
): string {
  const canonical = canonicalizeGitHubAction(action);

  return createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex");
}

export function validateBoundApproval(
  action: GitHubExternalAction,
  approval: BoundApproval,
  now = new Date(),
): ApprovalValidationResult {
  if (approval.workspaceId !== action.workspaceId) {
    return { valid: false, reason: "wrong_workspace" };
  }

  if (approval.projectId !== action.projectId) {
    return { valid: false, reason: "wrong_project" };
  }

  if (approval.actionType !== action.type) {
    return { valid: false, reason: "wrong_action_type" };
  }

  if (approval.connectedAccountId !== action.connectedAccountId) {
    return { valid: false, reason: "wrong_account" };
  }

  if (approval.repositoryId !== action.repositoryId) {
    return { valid: false, reason: "wrong_repository" };
  }

  if (now.getTime() >= new Date(approval.expiresAt).getTime()) {
    return { valid: false, reason: "expired" };
  }

  const expected = Buffer.from(hashGitHubAction(action), "utf8");
  const supplied = Buffer.from(approval.actionHash, "utf8");

  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return { valid: false, reason: "hash_mismatch" };
  }

  return { valid: true };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/*                            Webhook signature verifier                       */
/* -------------------------------------------------------------------------- */

GitHub App webhooks send HTTP POST payloads to the configured server. The webhook configuration can use a shared secret for an HMAC digest, and GitHub recommends SSL certificate verification.

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export function verifyGitHubWebhookSignature(input: {
  rawBody: Uint8Array;
  signature256: string | undefined;
  webhookSecret: string;
}): boolean {
  const { rawBody, signature256, webhookSecret } = input;

  if (!signature256?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac(
    "sha256",
    webhookSecret,
  )
    .update(rawBody)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(signature256, "utf8");

  if (expectedBuffer.length !== suppliedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

/* -------------------------------------------------------------------------- */
/*                         Minimal read-only implementation skeleton           */
/* -------------------------------------------------------------------------- */

import type {
  BoundApproval,
  ConnectedAccountId,
  ConnectorDescriptor,
  ConnectorOperationResult,
  GitHubAuthorizationCallback,
  GitHubAuthorizationRedirect,
  GitHubAuthorizationRequest,
  GitHubConnectedAccount,
  GitHubConnector,
  GitHubConnectorHealth,
  GitHubDeletionRequest,
  GitHubDeletionResult,
  GitHubExportManifest,
  GitHubExportRequest,
  GitHubExternalAction,
  GitHubExternalActionResult,
  GitHubRepositoryBinding,
  GitHubRepositoryReference,
  GitHubSyncEvent,
  GitHubSyncRequest,
  GitHubWebhookRequest,
  GitHubWebhookResult,
  IntegrationId,
  VerifiedGitHubWebhook,
} from "./github-connector";

export class ReadOnlyGitHubConnector
  implements GitHubConnector {
  descriptor(): ConnectorDescriptor {
    return {
      type: "github",
      displayName: "GitHub",
      version: "0.1.0",
      supportedAccessModes: ["read_only"],
      supportedSourceTypes: [
        "repository",
        "repository_file",
        "readme",
        "commit",
        "release",
        "issue",
        "issue_comment",
        "pull_request",
        "pull_request_review",
        "check_run",
        "workflow_run",
        "commit_status",
        "deployment",
        "deployment_status",
      ],
      supportedWebhookEvents: [
        "installation",
        "installation_repositories",
        "repository",
        "push",
        "issues",
        "issue_comment",
        "pull_request",
        "pull_request_review",
        "release",
        "check_run",
        "workflow_run",
        "status",
        "deployment",
        "deployment_status",
        "ping",
      ],
      supportedExternalActions: [],
      capabilities: {
        initialSync: true,
        incrementalSync: true,
        webhookSync: true,
        pollingSync: true,
        manualRefresh: true,
        export: true,
        deletion: true,
        writeActions: false,
      },
    };
  }

  async beginAuthorization(
    _request: GitHubAuthorizationRequest,
  ): Promise<GitHubAuthorizationRedirect> {
    throw new Error("Not implemented");
  }

  async completeAuthorization(
    _callback: GitHubAuthorizationCallback,
  ): Promise<GitHubConnectedAccount> {
    throw new Error("Not implemented");
  }

  async *listAccessibleRepositories(
    _connectedAccountId: ConnectedAccountId,
  ): AsyncIterable<GitHubRepositoryReference> {
    throw new Error("Not implemented");
  }

  async bindRepository(
    _binding: Omit<
      GitHubRepositoryBinding,
      "integrationId" | "createdAt" | "updatedAt"
    >,
  ): Promise<GitHubRepositoryBinding> {
    throw new Error("Not implemented");
  }

  async unbindRepository(
    _integrationId: IntegrationId,
  ): Promise<ConnectorOperationResult> {
    throw new Error("Not implemented");
  }

  async testConnection(
    _integrationId: IntegrationId,
  ): Promise<GitHubConnectorHealth> {
    throw new Error("Not implemented");
  }

  async *initialSync(
    _request: GitHubSyncRequest & { mode: "initial" },
  ): AsyncIterable<GitHubSyncEvent> {
    throw new Error("Not implemented");
  }

  async *incrementalSync(
    _request: GitHubSyncRequest & {
      mode: "incremental" | "reconciliation";
    },
  ): AsyncIterable<GitHubSyncEvent> {
    throw new Error("Not implemented");
  }

  async verifyWebhook(
    _request: GitHubWebhookRequest,
  ): Promise<VerifiedGitHubWebhook> {
    throw new Error("Not implemented");
  }

  async handleWebhook(
    _webhook: VerifiedGitHubWebhook,
  ): Promise<GitHubWebhookResult> {
    throw new Error("Not implemented");
  }

  async execute(
    action: GitHubExternalAction,
    _approval: BoundApproval,
  ): Promise<GitHubExternalActionResult> {
    return {
      success: false,
      actionType: action.type,
      idempotencyKey: action.idempotencyKey,
      status: "permission_denied",
      warnings: [],
      errors: [
        {
          code: "GITHUB_WRITE_DISABLED",
          message:
            "This connector instance is configured for read-only access.",
          retryDisposition: "do_not_retry",
        },
      ],
    };
  }

  async revoke(
    _connectedAccountId: ConnectedAccountId,
  ): Promise<ConnectorOperationResult> {
    throw new Error("Not implemented");
  }

  async disconnect(
    _integrationId: IntegrationId,
  ): Promise<ConnectorOperationResult> {
    throw new Error("Not implemented");
  }

  async exportData(
    _request: GitHubExportRequest,
  ): Promise<GitHubExportManifest> {
    throw new Error("Not implemented");
  }

  async deleteData(
    _request: GitHubDeletionRequest,
  ): Promise<GitHubDeletionResult> {
    throw new Error("Not implemented");
  }
}

/* -------------------------------------------------------------------------- */
/*                         Design decisions                                   */
/* -------------------------------------------------------------------------- */

Design decisions
Installation identity is separate from connected-account identity. One installed app may expose multiple selected repositories.
Repository binding is explicitly project-scoped. This prevents a repository from becoming globally available across workspaces or client projects.
Synchronization emits canonical envelopes. Persistence and AI processing do not depend on raw GitHub response shapes.
Cursors are opaque. The application persists them without coupling itself to connector internals.
Raw webhook bytes are mandatory. Parsing before verification can invalidate signature checking.
Webhook delivery IDs become deduplication keys.
Writes are present in the contract but disabled in the initial implementation.
Approvals bind the exact action, account, repository, and content hash.
Indeterminate execution is distinct from failure. If the provider response is interrupted, the connector reconciles before retrying.
Rate-limit state is part of connector health. Workers can pause until reset instead of creating retry storms.
Repository access does not authorize publication or public disclosure.

GitHub exposes endpoints for creating installation access tokens, listing repositories accessible to an installation, revoking installation tokens, and managing app webhook deliveries. Those capabilities align with the authorization, repository enumeration, revocation, and webhook-health boundaries in this interface.