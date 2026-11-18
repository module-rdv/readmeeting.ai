using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Api.Health;

public sealed class PostgreSqlHealthCheck(
    ReadMeetingDbContext dbContext,
    ILogger<PostgreSqlHealthCheck> logger) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await dbContext.Database.OpenConnectionAsync(cancellationToken);
            await dbContext.Database.CloseConnectionAsync();
            return HealthCheckResult.Healthy();
        }
        catch (DbException exception)
        {
            logger.LogError(
                "PostgreSQL readiness check failed. Failure type: {FailureType}.",
                exception.GetType().Name);
            return HealthCheckResult.Unhealthy("PostgreSQL is unavailable.");
        }
        catch (InvalidOperationException exception)
        {
            logger.LogError(
                "PostgreSQL readiness check failed. Failure type: {FailureType}.",
                exception.GetType().Name);
            return HealthCheckResult.Unhealthy("PostgreSQL is unavailable.");
        }
        catch (TimeoutException exception)
        {
            logger.LogError(
                "PostgreSQL readiness check failed. Failure type: {FailureType}.",
                exception.GetType().Name);
            return HealthCheckResult.Unhealthy("PostgreSQL is unavailable.");
        }
    }
}
