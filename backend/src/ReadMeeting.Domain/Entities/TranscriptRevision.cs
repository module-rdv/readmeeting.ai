namespace ReadMeeting.Domain.Entities;

public sealed class TranscriptRevision : TenantScopedEntity
{
    public Guid TranscriptId { get; set; }

    public Guid MeetingId { get; set; }

    public int RevisionNumber { get; set; }

    public TranscriptContentFormat SourceFormat { get; set; }

    public TranscriptRetrievalMode RetrievalMode { get; set; }

    public string? RawContent { get; set; }

    public string? RawContentReference { get; set; }

    public string? RawSha256 { get; set; }

    public string? ContentType { get; set; }

    public string? GraphRequestId { get; set; }

    public DateTimeOffset RetrievedAt { get; set; } = DateTimeOffset.UtcNow;

    public Transcript Transcript { get; set; } = null!;

    public ICollection<TranscriptCue> Cues { get; set; } = new List<TranscriptCue>();
}
