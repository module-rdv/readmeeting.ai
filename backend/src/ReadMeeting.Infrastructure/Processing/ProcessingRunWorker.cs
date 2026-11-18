using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ReadMeeting.Infrastructure.Ai;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Infrastructure.Processing;

public sealed class ProcessingRunWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<ProcessingRunWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollDelay = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var processedRun = false;
            try
            {
                await using (var scope = scopeFactory.CreateAsyncScope())
                {
                    var processor = scope.ServiceProvider.GetRequiredService<GeminiMeetingProcessor>();
                    if (processor.IsConfigured)
                    {
                        var queue = scope.ServiceProvider.GetRequiredService<ProcessingRunQueue>();
                        var tenantContext = scope.ServiceProvider.GetRequiredService<CurrentTenantContext>();
                        var claim = await queue.ClaimNextAsync(stoppingToken);
                        if (claim is not null)
                        {
                            tenantContext.SetForBackgroundProcessing(claim.TenantId);
                            await queue.RecordClaimAsync(claim, stoppingToken);
                            await processor.ProcessClaimedAsync(claim.Id, claim.TenantId, stoppingToken);
                            processedRun = true;
                        }
                    }

                }

                if (!processedRun)
                {
                    await Task.Delay(PollDelay, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(
                    "Processing run worker failed while polling for queued work ({FailureType}).",
                    exception.GetType().Name);
                try
                {
                    await Task.Delay(PollDelay, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }
    }
}
