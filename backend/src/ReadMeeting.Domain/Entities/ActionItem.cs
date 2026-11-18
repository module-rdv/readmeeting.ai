namespace ReadMeeting.Domain.Entities;

/// <summary>
/// Tâche d'action issue des délibérations de la réunion avec porteur et date limite.
/// </summary>
public sealed class ActionItem : TenantScopedEntity
{
    public Guid MeetingId { get; set; }

    public Guid? DecisionId { get; set; }

    public Guid? AssigneeUserId { get; set; }

    public string? Title { get; set; }

    public Meeting Meeting { get; set; } = null!;

    public string Description { get; set; } = string.Empty;

    public string? AssigneeName { get; set; }

    public string? AssigneeEmail { get; set; }

    public DateTimeOffset? DueDate { get; set; }

    public string? DeadlineText { get; set; }

    public ActionPriority Priority { get; set; } = ActionPriority.Medium;

    public ActionStatus Status { get; set; } = ActionStatus.Pending;

    public Decision? Decision { get; set; }

    public UserAccount? AssigneeUser { get; set; }

    public ICollection<ActionEvidence> Evidence { get; set; } = new List<ActionEvidence>();
}

public enum ActionPriority
{
    Low = 0,
    Medium = 1,
    High = 2,
    Critical = 3
}

public enum ActionStatus
{
    Pending = 0,
    InProgress = 1,
    Completed = 2,
    Deferred = 3
}
