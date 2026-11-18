namespace ReadMeeting.Domain.Entities;

public sealed class DecisionEvidence
{
    public Guid TenantId { get; set; }

    public Guid DecisionId { get; set; }

    public Guid SourceEvidenceId { get; set; }

    public Decision Decision { get; set; } = null!;

    public SourceEvidence SourceEvidence { get; set; } = null!;
}
