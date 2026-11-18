namespace ReadMeeting.Domain.Entities;

public sealed class SourceEvidence : TenantScopedEntity
{
    public Guid MeetingId { get; set; }

    public Guid? TranscriptRevisionId { get; set; }

    public Guid? TranscriptCueId { get; set; }

    public SourceEvidenceType SourceType { get; set; }

    public string SourceLocator { get; set; } = string.Empty;

    public string? SourceText { get; set; }

    public string? ExcerptHash { get; set; }

    public long? StartMilliseconds { get; set; }

    public long? EndMilliseconds { get; set; }

    public string? ReferenceUri { get; set; }

    public Meeting Meeting { get; set; } = null!;

    public ICollection<DecisionEvidence> Decisions { get; set; } = new List<DecisionEvidence>();

    public ICollection<ActionEvidence> Actions { get; set; } = new List<ActionEvidence>();
}

public enum SourceEvidenceType
{
    TranscriptCue = 0,
    MeetingMetadata = 1,
    ManualNote = 2,
    ExternalDocument = 3,
    TranscriptRevisionQuote = 4
}
