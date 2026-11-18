namespace ReadMeeting.Domain.Entities;

public sealed class Transcript : TenantScopedEntity
{
    public Guid MeetingId { get; set; }

    public string? GraphTranscriptId { get; set; }

    public TranscriptContentFormat ContentFormat { get; set; } = TranscriptContentFormat.Unknown;

    public string? Language { get; set; }

    public TranscriptRetrievalMode RetrievalMode { get; set; } = TranscriptRetrievalMode.ManualImport;

    public TranscriptStatus Status { get; set; } = TranscriptStatus.Pending;

    public DateTimeOffset? RetrievedAt { get; set; }

    public DateTimeOffset? ParsedAt { get; set; }

    public Meeting Meeting { get; set; } = null!;

    public ICollection<TranscriptRevision> Revisions { get; set; } = new List<TranscriptRevision>();
}

public enum TranscriptContentFormat
{
    TextVtt = 0,
    TextPlainUnattributed = 1,
    Unknown = 2
}

public enum TranscriptRetrievalMode
{
    StandardVtt = 0,
    FallbackUnattributed = 1,
    ManualImport = 2
}

public enum TranscriptStatus
{
    Pending = 0,
    Available = 1,
    Failed = 2,
    Rejected = 3,
    Parsed = 4
}
