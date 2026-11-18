namespace ReadMeeting.Domain.Entities;

public sealed class AuditLog : TenantScopedEntity
{
    public Guid? UserAccountId { get; set; }

    public string EntityType { get; set; } = string.Empty;

    public Guid? EntityId { get; set; }

    public string Action { get; set; } = string.Empty;

    public string DetailsJson { get; set; } = "{}";

    public string? RequestId { get; set; }

    public string? SourceIp { get; set; }
}
