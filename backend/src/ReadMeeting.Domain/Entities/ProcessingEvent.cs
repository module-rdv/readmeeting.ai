namespace ReadMeeting.Domain.Entities;

public sealed class ProcessingEvent : TenantScopedEntity
{
    public Guid ProcessingRunId { get; set; }

    public int AttemptNumber { get; set; }

    public string Stage { get; set; } = string.Empty;

    public string? FromStatus { get; set; }

    public string ToStatus { get; set; } = string.Empty;

    public string? ErrorCode { get; set; }

    public string? GraphErrorCode { get; set; }

    public int? HttpStatus { get; set; }

    public string? GraphRequestId { get; set; }

    public int? RetryAfterSeconds { get; set; }

    public string? RedactedMessage { get; set; }

    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;

    public ProcessingRun ProcessingRun { get; set; } = null!;
}
