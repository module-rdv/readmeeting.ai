namespace ReadMeeting.Domain.Entities;

public sealed class TranscriptCue : TenantScopedEntity
{
    public Guid TranscriptRevisionId { get; set; }

    public int SequenceNumber { get; set; }

    public long StartMilliseconds { get; set; }

    public long? EndMilliseconds { get; set; }

    public string? SpeakerName { get; set; }

    public SpeakerAttribution SpeakerAttribution { get; set; } = SpeakerAttribution.Unknown;

    public string Text { get; set; } = string.Empty;

    public string? NormalizedText { get; set; }

    public TranscriptRevision TranscriptRevision { get; set; } = null!;
}

public enum SpeakerAttribution
{
    Identified = 0,
    Unattributed = 1,
    Unknown = 2
}
