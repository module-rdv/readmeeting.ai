namespace ReadMeeting.Domain.Entities;

public sealed class ActionEvidence
{
    public Guid TenantId { get; set; }

    public Guid ActionItemId { get; set; }

    public Guid SourceEvidenceId { get; set; }

    public ActionItem ActionItem { get; set; } = null!;

    public SourceEvidence SourceEvidence { get; set; } = null!;
}
