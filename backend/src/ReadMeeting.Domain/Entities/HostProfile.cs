namespace ReadMeeting.Domain.Entities;

public sealed class HostProfile : TenantScopedEntity
{
    public Guid UserAccountId { get; set; }

    public string? PreferredDisplayName { get; set; }

    public string? JobTitle { get; set; }

    public string? OfficeLocation { get; set; }

    public UserAccount UserAccount { get; set; } = null!;
}
