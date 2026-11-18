namespace ReadMeeting.Domain.Entities;

public sealed class UserAccount : TenantScopedEntity
{
    public Guid EntraObjectId { get; set; }

    public string? Upn { get; set; }

    public string? DisplayName { get; set; }

    public string? Mail { get; set; }

    public bool IsActive { get; set; } = true;

    public Tenant Tenant { get; set; } = null!;

    public HostProfile? HostProfile { get; set; }
}
