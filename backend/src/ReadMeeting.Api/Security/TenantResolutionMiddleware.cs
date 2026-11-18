using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using ReadMeeting.Application.Security;
using ReadMeeting.Domain.Entities;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Api.Security;

public sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext context,
        ReadMeetingDbContext dbContext,
        ICurrentTenantAccessor currentTenant,
        ILogger<TenantResolutionMiddleware> logger)
    {
        var principal = context.User;
        if (principal.Identity?.IsAuthenticated != true
            || !Guid.TryParse(principal.FindFirstValue("tid"), out var entraTenantId)
            || !Guid.TryParse(principal.FindFirstValue("oid"), out var entraObjectId))
        {
            await next(context);
            return;
        }

        var tenant = await dbContext.Tenants
            .IgnoreQueryFilters()
            .SingleOrDefaultAsync(
                item => item.EntraTenantId == entraTenantId,
                context.RequestAborted);

        if (tenant is null)
        {
            tenant = new Tenant { EntraTenantId = entraTenantId };
            dbContext.Tenants.Add(tenant);
            try
            {
                await dbContext.SaveChangesAsync(context.RequestAborted);
            }
            catch (DbUpdateException)
            {
                dbContext.Entry(tenant).State = EntityState.Detached;
                tenant = await dbContext.Tenants
                    .IgnoreQueryFilters()
                    .SingleOrDefaultAsync(
                        item => item.EntraTenantId == entraTenantId,
                        context.RequestAborted);

                if (tenant is null)
                {
                    throw;
                }
            }
        }

        if (tenant.Status != TenantStatus.Active)
        {
            logger.LogWarning("A suspended tenant attempted to access the meetings API.");
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await Results.Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Access denied",
                detail: "The tenant is not active.").ExecuteAsync(context);
            return;
        }

        currentTenant.Set(tenant.Id, entraTenantId, entraObjectId);
        await next(context);
    }
}
