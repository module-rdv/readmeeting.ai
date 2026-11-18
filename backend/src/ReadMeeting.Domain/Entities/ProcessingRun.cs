namespace ReadMeeting.Domain.Entities;

public sealed class ProcessingRun : TenantScopedEntity
{
    public Guid MeetingId { get; set; }

    public Guid? TranscriptId { get; set; }

    public Guid RequestedByUserId { get; set; }

    public string IdempotencyKey { get; set; } = string.Empty;

    public string RequestPayloadHash { get; set; } = string.Empty;

    public string? SourceContentHash { get; set; }

    public string ParserVersion { get; set; } = string.Empty;

    public string? ModelUsed { get; set; }

    public string? ErrorMessage { get; set; }

    public string? AnalysisJson { get; set; }

    public ProcessingRunStatus Status { get; set; } = ProcessingRunStatus.Queued;

    public int AttemptCount { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public Meeting Meeting { get; set; } = null!;

    public Transcript? Transcript { get; set; }

    public UserAccount RequestedByUser { get; set; } = null!;

    public ICollection<ProcessingEvent> Events { get; set; } = new List<ProcessingEvent>();
}

public enum ProcessingRunStatus
{
    Queued = 0,
    ResolvingMeeting = 1,
    DiscoveringTranscript = 2,
    DownloadingTranscript = 3,
    ParsingTranscript = 4,
    ValidatingTranscript = 5,
    PersistingTranscript = 6,
    FailedRetryable = 7,
    Succeeded = 8,
    FailedPermanent = 9
}
