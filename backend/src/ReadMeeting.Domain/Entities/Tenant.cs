namespace ReadMeeting.Domain.Entities;

public sealed class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid EntraTenantId { get; set; }

    public string? TenantCode { get; set; }

    public string? DisplayName { get; set; }

    public TenantStatus Status { get; set; } = TenantStatus.Active;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? UpdatedAt { get; set; }

    public ICollection<UserAccount> Users { get; set; } = new List<UserAccount>();

    public ICollection<Meeting> Meetings { get; set; } = new List<Meeting>();
}

public enum TenantStatus
{
    Active = 0,
    Suspended = 1,
    Archived = 2
}
