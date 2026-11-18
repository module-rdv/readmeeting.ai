namespace ReadMeeting.Domain.Entities;

public sealed class Decision : TenantScopedEntity
{
    public Guid MeetingId { get; set; }

    public string Text { get; set; } = string.Empty;

    public DecisionStatus Status { get; set; } = DecisionStatus.Proposed;

    public DecisionType DecisionType { get; set; } = DecisionType.Consensus;

    public Guid? ApprovedByUserId { get; set; }

    public string? ApprovedByName { get; set; }

    public Meeting Meeting { get; set; } = null!;

    public UserAccount? ApprovedByUser { get; set; }

    public ICollection<DecisionEvidence> Evidence { get; set; } = new List<DecisionEvidence>();

    public ICollection<ActionItem> Actions { get; set; } = new List<ActionItem>();
}

public enum DecisionStatus
{
    Proposed = 0,
    Confirmed = 1,
    Decided = 2,
    Rejected = 3,
    Reported = 4,
    ToConfirm = 5
}

public enum DecisionType
{
    Consensus = 0,
    Vote = 1,
    ChairDecision = 2,
    ExternalValidation = 3,
    Unspecified = 4
}
