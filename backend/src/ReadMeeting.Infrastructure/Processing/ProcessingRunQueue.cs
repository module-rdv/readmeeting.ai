using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using ReadMeeting.Domain.Entities;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Infrastructure.Processing;

public sealed class ProcessingRunQueue(
    ReadMeetingDbContext dbContext,
    TimeProvider timeProvider)
{
    private const int MaximumAttempts = 3;
    private const int StaleRunMinutes = 15;

    public async Task<ClaimedProcessingRun?> ClaimNextAsync(
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var staleBefore = now.AddMinutes(-StaleRunMinutes);

        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted,
            cancellationToken);

        await MarkExhaustedRunsAsync(now, staleBefore, cancellationToken);

        var connection = dbContext.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.Transaction = transaction.GetDbTransaction();
        command.CommandText = """
            WITH candidate AS (
                SELECT "TenantId", "Id", "Status"
                FROM "ProcessingRuns"
                WHERE "AttemptCount" < @maximumAttempts
                  AND (
                    "Status" = 'Queued'
                    OR (
                        "Status" = 'FailedRetryable'
                        AND "CompletedAt" <= @now - CASE
                            WHEN "AttemptCount" <= 1 THEN INTERVAL '5 seconds'
                            WHEN "AttemptCount" = 2 THEN INTERVAL '15 seconds'
                            ELSE INTERVAL '60 seconds'
                        END
                    )
                    OR (
                        "Status" IN (
                            'ResolvingMeeting',
                            'DiscoveringTranscript',
                            'DownloadingTranscript',
                            'ParsingTranscript',
                            'ValidatingTranscript',
                            'PersistingTranscript'
                        )
                        AND "StartedAt" < @staleBefore
                    )
                  )
                ORDER BY "CreatedAt", "Id"
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            UPDATE "ProcessingRuns" AS run
            SET "Status" = 'ParsingTranscript',
                "AttemptCount" = run."AttemptCount" + 1,
                "StartedAt" = @now,
                "CompletedAt" = NULL,
                "ErrorMessage" = NULL
            FROM candidate
            WHERE run."TenantId" = candidate."TenantId"
              AND run."Id" = candidate."Id"
            RETURNING run."TenantId", run."Id", candidate."Status", run."AttemptCount";
            """;

        AddParameter(command, "@maximumAttempts", MaximumAttempts, DbType.Int32);
        AddParameter(command, "@staleBefore", staleBefore, DbType.DateTimeOffset);
        AddParameter(command, "@now", now, DbType.DateTimeOffset);

        ClaimedProcessingRun? claimedRun = null;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (await reader.ReadAsync(cancellationToken))
            {
                claimedRun = new ClaimedProcessingRun(
                    reader.GetGuid(0),
                    reader.GetGuid(1),
                    reader.GetString(2),
                    reader.GetInt32(3));
            }
        }

        await transaction.CommitAsync(cancellationToken);
        return claimedRun;
    }

    public async Task RecordClaimAsync(
        ClaimedProcessingRun claim,
        CancellationToken cancellationToken)
    {
        var occurredAt = timeProvider.GetUtcNow();
        dbContext.ProcessingEvents.Add(new ProcessingEvent
        {
            Id = Guid.NewGuid(),
            TenantId = claim.TenantId,
            ProcessingRunId = claim.Id,
            AttemptNumber = claim.AttemptCount,
            Stage = "ai-analysis",
            FromStatus = claim.PreviousStatus,
            ToStatus = nameof(ProcessingRunStatus.ParsingTranscript),
            RedactedMessage = "Traitement réservé par un worker.",
            OccurredAt = occurredAt,
            CreatedAt = occurredAt
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task MarkExhaustedRunsAsync(
        DateTimeOffset now,
        DateTimeOffset staleBefore,
        CancellationToken cancellationToken)
    {
        await dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"""
            UPDATE "ProcessingRuns"
            SET "Status" = 'FailedPermanent',
                "CompletedAt" = {now},
                "ErrorMessage" = 'Le nombre maximal de tentatives de traitement a été atteint.'
            WHERE "AttemptCount" >= {MaximumAttempts}
              AND (
                "Status" = 'FailedRetryable'
                OR (
                    "Status" IN (
                        'ResolvingMeeting',
                        'DiscoveringTranscript',
                        'DownloadingTranscript',
                        'ParsingTranscript',
                        'ValidatingTranscript',
                        'PersistingTranscript'
                    )
                    AND "StartedAt" < {staleBefore}
                )
              )
            """,
            cancellationToken);
    }

    private static void AddParameter(
        System.Data.Common.DbCommand command,
        string name,
        object value,
        DbType type)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = type;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}

public sealed record ClaimedProcessingRun(
    Guid TenantId,
    Guid Id,
    string PreviousStatus,
    int AttemptCount);
