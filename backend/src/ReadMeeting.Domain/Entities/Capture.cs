namespace ReadMeeting.Domain.Entities;

public sealed class Capture : TenantScopedEntity
{
    public Guid MeetingId { get; set; }

    public CaptureMethod Method { get; set; }

    public CaptureStatus Status { get; set; } = CaptureStatus.Pending;

    public string? SourceReference { get; set; }

    public DateTimeOffset? CapturedAt { get; set; }

    public Meeting Meeting { get; set; } = null!;
}

public enum CaptureMethod
{
    TeamsNative = 1,
    MeetingBot = 2,
    ManualImport = 3
}

public enum CaptureStatus
{
    Pending = 0,
    InProgress = 1,
    Completed = 2,
    Failed = 3
}
