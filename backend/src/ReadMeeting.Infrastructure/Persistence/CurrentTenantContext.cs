using ReadMeeting.Application.Security;

namespace ReadMeeting.Infrastructure.Persistence;

public sealed class CurrentTenantContext : ICurrentTenantAccessor
{
    public Guid? TenantId { get; private set; }

    public Guid? EntraTenantId { get; private set; }

    public Guid? EntraObjectId { get; private set; }

    public void Set(Guid tenantId, Guid entraTenantId, Guid entraObjectId)
    {
        if (TenantId.HasValue
            && (TenantId != tenantId
                || EntraTenantId != entraTenantId
                || EntraObjectId != entraObjectId))
        {
            throw new InvalidOperationException("The tenant context cannot be changed during a request.");
        }

        TenantId = tenantId;
        EntraTenantId = entraTenantId;
        EntraObjectId = entraObjectId;
    }

    public void SetForBackgroundProcessing(Guid tenantId)
    {
        if (TenantId.HasValue && TenantId != tenantId)
        {
            throw new InvalidOperationException("The tenant context cannot be changed during a processing scope.");
        }

        TenantId = tenantId;
    }
}
