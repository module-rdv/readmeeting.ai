using System.ComponentModel.DataAnnotations;
using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Application.Meetings;

public sealed class CreateManualMeetingRequest
{
    [Required]
    [StringLength(500, MinimumLength = 1)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Description { get; init; }

    public DateTimeOffset? StartTime { get; init; }

    public DateTimeOffset? EndTime { get; init; }

    [EmailAddress]
    [StringLength(320)]
    public string? OrganizerEmail { get; init; }

    [StringLength(300)]
    public string? OrganizerName { get; init; }

    [StringLength(100)]
    public string? DepartmentCode { get; init; }
}

public sealed class CreateMeetingReportRequest
{
    [Required]
    [StringLength(500, MinimumLength = 1)]
    public string Title { get; init; } = string.Empty;

    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string ReferenceNumber { get; init; } = string.Empty;

    [Required]
    public string ExecutiveSummary { get; init; } = string.Empty;

    [Required]
    public string DecisionsAgreed { get; init; } = string.Empty;

    [Required]
    public string KeyDiscussionPoints { get; init; } = string.Empty;

    [EnumDataType(typeof(ReportApprovalStatus))]
    public ReportApprovalStatus ApprovalStatus { get; init; } = ReportApprovalStatus.Draft;
}

public sealed class UpdateMeetingReportRequest
{
    [Required]
    [StringLength(500, MinimumLength = 1)]
    public string Title { get; init; } = string.Empty;

    [Required]
    public string ExecutiveSummary { get; init; } = string.Empty;

    [Required]
    public string DecisionsAgreed { get; init; } = string.Empty;

    [Required]
    public string KeyDiscussionPoints { get; init; } = string.Empty;

    [StringLength(2_000_000)]
    public string? StructuredContentJson { get; init; }

    [StringLength(4_000)]
    public string? RejectionReason { get; init; }

    [EnumDataType(typeof(ReportApprovalStatus))]
    public ReportApprovalStatus ApprovalStatus { get; init; } = ReportApprovalStatus.UnderReview;
}

public sealed class CreateDecisionRequest
{
    [Required]
    [StringLength(4000, MinimumLength = 1)]
    public string Text { get; init; } = string.Empty;

    [EnumDataType(typeof(DecisionStatus))]
    public DecisionStatus Status { get; init; } = DecisionStatus.Proposed;

    [EnumDataType(typeof(DecisionType))]
    public DecisionType DecisionType { get; init; } = DecisionType.Consensus;

    [StringLength(300)]
    public string? ApprovedByName { get; init; }
}

public sealed class CreateActionItemRequest
{
    [StringLength(500)]
    public string? Title { get; init; }

    [Required]
    [StringLength(4000, MinimumLength = 1)]
    public string Description { get; init; } = string.Empty;

    [StringLength(300)]
    public string? AssigneeName { get; init; }

    [EmailAddress]
    [StringLength(320)]
    public string? AssigneeEmail { get; init; }

    public DateTimeOffset? DueDate { get; init; }

    [StringLength(300)]
    public string? DeadlineText { get; init; }

    [EnumDataType(typeof(ActionPriority))]
    public ActionPriority Priority { get; init; } = ActionPriority.Medium;

    [EnumDataType(typeof(ActionStatus))]
    public ActionStatus Status { get; init; } = ActionStatus.Pending;

    public Guid? DecisionId { get; init; }
}

public sealed class UpdateDecisionRequest
{
    [Required]
    [StringLength(4_000, MinimumLength = 1)]
    public string Text { get; init; } = string.Empty;

    [EnumDataType(typeof(DecisionStatus))]
    public DecisionStatus Status { get; init; }

    [EnumDataType(typeof(DecisionType))]
    public DecisionType DecisionType { get; init; }

    [StringLength(300)]
    public string? ApprovedByName { get; init; }
}

public sealed class UpdateActionItemRequest
{
    [StringLength(500)]
    public string? Title { get; init; }

    [Required]
    [StringLength(4_000, MinimumLength = 1)]
    public string Description { get; init; } = string.Empty;

    [StringLength(300)]
    public string? AssigneeName { get; init; }

    [EmailAddress]
    [StringLength(320)]
    public string? AssigneeEmail { get; init; }

    public DateTimeOffset? DueDate { get; init; }

    [StringLength(300)]
    public string? DeadlineText { get; init; }

    [EnumDataType(typeof(ActionPriority))]
    public ActionPriority Priority { get; init; }

    [EnumDataType(typeof(ActionStatus))]
    public ActionStatus Status { get; init; }
}

public sealed class CreateTranscriptRequest
{
    [Required]
    [StringLength(1_000_000, MinimumLength = 1)]
    public string Content { get; init; } = string.Empty;

    [EnumDataType(typeof(TranscriptContentFormat))]
    public TranscriptContentFormat ContentFormat { get; init; } = TranscriptContentFormat.TextVtt;

    [StringLength(20)]
    public string? Language { get; init; }
}

public sealed class ImportTeamsTranscriptRequest
{
    [Required]
    [StringLength(500, MinimumLength = 1)]
    public string GraphMeetingId { get; init; } = string.Empty;

    [Required]
    [StringLength(500, MinimumLength = 1)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Description { get; init; }

    public DateTimeOffset? StartTime { get; init; }

    public DateTimeOffset? EndTime { get; init; }

    [EmailAddress]
    [StringLength(320)]
    public string? OrganizerEmail { get; init; }

    [StringLength(300)]
    public string? OrganizerName { get; init; }

    [StringLength(100)]
    public string? DepartmentCode { get; init; }

    [StringLength(2048)]
    public string? JoinWebUrl { get; init; }

    [Required]
    [StringLength(500, MinimumLength = 1)]
    public string GraphTranscriptId { get; init; } = string.Empty;

    [Required]
    [StringLength(1_000_000, MinimumLength = 1)]
    public string Content { get; init; } = string.Empty;

    [EnumDataType(typeof(TranscriptContentFormat))]
    public TranscriptContentFormat ContentFormat { get; init; } = TranscriptContentFormat.TextVtt;

    [StringLength(20)]
    public string? Language { get; init; }
}

public sealed class CreateProcessingRunRequest
{
    [Required]
    public Guid TranscriptId { get; init; }
}

public sealed record TeamsTranscriptImportResult(
    MeetingDetails Meeting,
    TranscriptDetails Transcript);

public sealed record TeamsTranscriptAnalysisResult(
    Guid MeetingId,
    Guid TranscriptId,
    bool AiConfigured,
    ProcessingRunDetails? ProcessingRun);

public sealed record MeetingSummary(
    Guid Id,
    string Title,
    DateTimeOffset? StartTime,
    DateTimeOffset? EndTime,
    string? OrganizerName,
    MeetingCaptureStatus Status);

public sealed record MeetingDashboardSummary(
    int MeetingCount,
    int TranscriptCount,
    int ReportCount,
    int DecisionCount,
    int PendingActionCount,
    int ActiveOrFailedProcessingCount,
    IReadOnlyList<MeetingSummary> RecentMeetings);

public sealed record MeetingDetails(
    Guid Id,
    string Title,
    string? Description,
    DateTimeOffset? StartTime,
    DateTimeOffset? EndTime,
    string? OrganizerEmail,
    string? OrganizerName,
    string? DepartmentCode,
    string? JoinWebUrl,
    MeetingCaptureStatus Status,
    DateTimeOffset CreatedAt);

public sealed record TranscriptSummary(
    Guid Id,
    string? GraphTranscriptId,
    TranscriptContentFormat ContentFormat,
    TranscriptStatus Status,
    DateTimeOffset? RetrievedAt);

public sealed record TranscriptDetails(
    Guid Id,
    Guid MeetingId,
    TranscriptContentFormat ContentFormat,
    TranscriptStatus Status,
    string? Language,
    string? Content,
    string? Sha256,
    DateTimeOffset RetrievedAt);

public sealed record ProcessingRunSummary(
    Guid Id,
    ProcessingRunStatus Status,
    int AttemptCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt);

public sealed record ProcessingRunDetails(
    Guid Id,
    Guid MeetingId,
    Guid? TranscriptId,
    ProcessingRunStatus Status,
    int AttemptCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    string? ModelUsed,
    string? ErrorMessage,
    string? AnalysisJson);

public sealed record MeetingReportSummary(
    Guid Id,
    string Title,
    string ReferenceNumber,
    ReportApprovalStatus ApprovalStatus,
    DateTimeOffset GeneratedAt);

public sealed record MeetingReportDetails(
    Guid Id,
    Guid MeetingId,
    string Title,
    string ReferenceNumber,
    string ExecutiveSummary,
    string DecisionsAgreed,
    string KeyDiscussionPoints,
    string? SharePointDocxUrl,
    string? SharePointFileId,
    ReportApprovalStatus ApprovalStatus,
    string? ValidatedByEmail,
    DateTimeOffset GeneratedAt,
    string? StructuredContentJson,
    string? RejectionReason,
    string? SharePointDriveId,
    string? SharePointFolderId,
    string? SharePointVersion,
    DateTimeOffset? SharePointPublishedAt,
    string? SharePointPublishedBy,
    string? SharePointPublicationError);

public sealed record SharePointSite(
    string Id,
    string Name,
    string? WebUrl);

public sealed record SharePointDrive(
    string Id,
    string Name,
    string? DriveType);

public sealed record SharePointFolder(
    string Id,
    string Name,
    string? WebUrl);

public sealed record SharePointPublicationResult(
    Guid ReportId,
    string FileName,
    string FileId,
    string WebUrl,
    string DriveId,
    string FolderId,
    string? Version,
    DateTimeOffset PublishedAt);

public sealed record PublishMeetingReportRequest(
    string? SiteId,
    string? DriveId,
    string? FolderId);

public sealed record DecisionSummary(
    Guid Id,
    string Text,
    DecisionStatus Status,
    DecisionType DecisionType,
    string? ApprovedByName,
    DateTimeOffset CreatedAt);

public sealed record DecisionDetails(
    Guid Id,
    Guid MeetingId,
    string Text,
    DecisionStatus Status,
    DecisionType DecisionType,
    string? ApprovedByName,
    DateTimeOffset CreatedAt);

public sealed record ActionItemSummary(
    Guid Id,
    Guid MeetingId,
    string? Title,
    string Description,
    string? AssigneeName,
    string? AssigneeEmail,
    DateTimeOffset? DueDate,
    string? DeadlineText,
    ActionPriority Priority,
    ActionStatus Status,
    DateTimeOffset CreatedAt);

public sealed record ActionItemDetails(
    Guid Id,
    Guid MeetingId,
    Guid? DecisionId,
    string? Title,
    string Description,
    string? AssigneeName,
    string? AssigneeEmail,
    DateTimeOffset? DueDate,
    string? DeadlineText,
    ActionPriority Priority,
    ActionStatus Status,
    DateTimeOffset CreatedAt);
