namespace ReadMeeting.Application.Security;

public interface ICurrentTenantAccessor
{
    Guid? TenantId { get; }

    Guid? EntraTenantId { get; }

    Guid? EntraObjectId { get; }

    void Set(Guid tenantId, Guid entraTenantId, Guid entraObjectId);
}
