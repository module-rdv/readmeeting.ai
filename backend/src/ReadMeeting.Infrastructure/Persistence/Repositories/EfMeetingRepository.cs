using Microsoft.EntityFrameworkCore;
using System.Data;
using ReadMeeting.Application.Meetings;
using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Infrastructure.Persistence.Repositories;

public sealed class EfMeetingRepository(ReadMeetingDbContext dbContext) : IMeetingRepository
{
    public async Task<MeetingDashboardCounts> GetDashboardCountsAsync(
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        var activeStatuses = new[]
        {
            ProcessingRunStatus.Queued,
            ProcessingRunStatus.ResolvingMeeting,
            ProcessingRunStatus.DiscoveringTranscript,
            ProcessingRunStatus.DownloadingTranscript,
            ProcessingRunStatus.ParsingTranscript,
            ProcessingRunStatus.ValidatingTranscript,
            ProcessingRunStatus.PersistingTranscript,
            ProcessingRunStatus.FailedRetryable,
            ProcessingRunStatus.FailedPermanent
        };
        var meetings = dbContext.Meetings.Where(item => item.TenantId == tenantId);
        return new MeetingDashboardCounts(
            await meetings.CountAsync(cancellationToken),
            await dbContext.Transcripts.CountAsync(
                item => item.TenantId == tenantId
                    && (item.Status == TranscriptStatus.Available || item.Status == TranscriptStatus.Parsed),
                cancellationToken),
            await dbContext.MeetingReports.CountAsync(item => item.TenantId == tenantId, cancellationToken),
            await dbContext.Decisions.CountAsync(item => item.TenantId == tenantId, cancellationToken),
            await dbContext.ActionItems.CountAsync(
                item => item.TenantId == tenantId && item.Status == ActionStatus.Pending,
                cancellationToken),
            await dbContext.ProcessingRuns.CountAsync(
                item => item.TenantId == tenantId && activeStatuses.Contains(item.Status),
                cancellationToken),
            await meetings.AsNoTracking()
                .OrderByDescending(item => item.CreatedAt)
                .ThenBy(item => item.Id)
                .Take(8)
                .ToArrayAsync(cancellationToken));
    }

    public async Task<IReadOnlyList<Meeting>> ListAsync(
        Guid tenantId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Meetings
            .AsNoTracking()
            .Where(meeting => meeting.TenantId == tenantId);

        if (from.HasValue)
        {
            query = query.Where(meeting => meeting.StartTime >= from);
        }

        if (to.HasValue)
        {
            query = query.Where(meeting => meeting.StartTime < to);
        }

        return await query
            .OrderBy(meeting => meeting.StartTime)
            .ThenBy(meeting => meeting.Id)
            .ToArrayAsync(cancellationToken);
    }

    public Task<Meeting?> GetAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken) =>
        dbContext.Meetings
            .AsNoTracking()
            .SingleOrDefaultAsync(
                meeting => meeting.TenantId == tenantId && meeting.Id == meetingId,
                cancellationToken);

    public Task<bool> DecisionBelongsToMeetingAsync(
        Guid tenantId,
        Guid meetingId,
        Guid decisionId,
        CancellationToken cancellationToken) =>
        dbContext.Decisions.AnyAsync(
            decision => decision.TenantId == tenantId
                && decision.MeetingId == meetingId
                && decision.Id == decisionId,
            cancellationToken);

    public async Task<(Meeting Meeting, Transcript Transcript)> UpsertTeamsTranscriptAsync(
        Guid tenantId,
        Meeting meeting,
        Transcript transcript,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var existingMeeting = await dbContext.Meetings.SingleOrDefaultAsync(
            item => item.TenantId == tenantId && item.MicrosoftGraphId == meeting.MicrosoftGraphId,
            cancellationToken);
        if (existingMeeting is null)
        {
            meeting.TenantId = tenantId;
            dbContext.Meetings.Add(meeting);
            existingMeeting = meeting;
        }
        else
        {
            existingMeeting.Title = meeting.Title;
            existingMeeting.Description = meeting.Description;
            existingMeeting.StartTime = meeting.StartTime;
            existingMeeting.EndTime = meeting.EndTime;
            existingMeeting.OrganizerEmail = meeting.OrganizerEmail;
            existingMeeting.OrganizerName = meeting.OrganizerName;
            existingMeeting.DepartmentCode = meeting.DepartmentCode;
            existingMeeting.JoinWebUrl = meeting.JoinWebUrl;
            existingMeeting.Status = MeetingCaptureStatus.Transcribed;
        }

        var transcriptRecord = await dbContext.Transcripts
            .Include(item => item.Revisions)
            .SingleOrDefaultAsync(item =>
                item.TenantId == tenantId
                && item.MeetingId == existingMeeting.Id
                && item.GraphTranscriptId == transcript.GraphTranscriptId,
                cancellationToken);

        if (transcriptRecord is null)
        {
            transcript.TenantId = tenantId;
            transcript.MeetingId = existingMeeting.Id;
            foreach (var revision in transcript.Revisions)
            {
                revision.TenantId = tenantId;
                revision.MeetingId = existingMeeting.Id;
            }

            dbContext.Transcripts.Add(transcript);
            transcriptRecord = transcript;
        }
        else
        {
            var incomingRevision = transcript.Revisions.Single();
            if (!transcriptRecord.Revisions.Any(revision => revision.RawSha256 == incomingRevision.RawSha256))
            {
                var now = incomingRevision.RetrievedAt;
                transcriptRecord.Revisions.Add(new TranscriptRevision
                {
                    TenantId = tenantId,
                    MeetingId = existingMeeting.Id,
                    RevisionNumber = transcriptRecord.Revisions.Count == 0
                        ? 1
                        : transcriptRecord.Revisions.Max(revision => revision.RevisionNumber) + 1,
                    SourceFormat = incomingRevision.SourceFormat,
                    RetrievalMode = incomingRevision.RetrievalMode,
                    RawContent = incomingRevision.RawContent,
                    RawSha256 = incomingRevision.RawSha256,
                    ContentType = incomingRevision.ContentType,
                    RetrievedAt = now,
                    CreatedAt = now
                });
            }

            transcriptRecord.ContentFormat = transcript.ContentFormat;
            transcriptRecord.Language = transcript.Language;
            transcriptRecord.RetrievalMode = transcript.RetrievalMode;
            transcriptRecord.Status = TranscriptStatus.Available;
            transcriptRecord.RetrievedAt = transcript.RetrievedAt;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return (existingMeeting, transcriptRecord);
    }

    public async Task<IReadOnlyList<Transcript>> GetTranscriptsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken) =>
        await dbContext.Transcripts
            .AsNoTracking()
            .Where(transcript => transcript.TenantId == tenantId && transcript.MeetingId == meetingId)
            .Include(transcript => transcript.Revisions)
            .OrderByDescending(transcript => transcript.RetrievedAt)
            .ThenBy(transcript => transcript.Id)
            .ToArrayAsync(cancellationToken);

    public Task<Transcript?> GetTranscriptAsync(
        Guid tenantId,
        Guid meetingId,
        Guid transcriptId,
        CancellationToken cancellationToken) =>
        dbContext.Transcripts
            .AsNoTracking()
            .Include(transcript => transcript.Revisions)
            .SingleOrDefaultAsync(
                transcript => transcript.TenantId == tenantId
                    && transcript.MeetingId == meetingId
                    && transcript.Id == transcriptId,
                cancellationToken);

    public async Task AddTranscriptAsync(Transcript transcript, CancellationToken cancellationToken)
    {
        dbContext.Transcripts.Add(transcript);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ProcessingRun>> GetProcessingRunsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken) =>
        await dbContext.ProcessingRuns
            .AsNoTracking()
            .Where(run => run.TenantId == tenantId && run.MeetingId == meetingId)
            .OrderByDescending(run => run.CreatedAt)
            .ThenBy(run => run.Id)
            .ToArrayAsync(cancellationToken);

    public Task<ProcessingRun?> GetProcessingRunAsync(
        Guid tenantId,
        Guid processingRunId,
        CancellationToken cancellationToken) =>
        dbContext.ProcessingRuns
            .AsNoTracking()
            .SingleOrDefaultAsync(
                run => run.TenantId == tenantId && run.Id == processingRunId,
                cancellationToken);

    public async Task<ProcessingRun> AddProcessingRunAsync(
        ProcessingRun processingRun,
        CancellationToken cancellationToken)
    {
        dbContext.ProcessingRuns.Add(processingRun);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return processingRun;
        }
        catch (DbUpdateException)
        {
            dbContext.Entry(processingRun).State = EntityState.Detached;
            var existing = await dbContext.ProcessingRuns
                .AsNoTracking()
                .FirstOrDefaultAsync(run =>
                    run.TenantId == processingRun.TenantId
                    && run.TranscriptId == processingRun.TranscriptId
                    && run.ParserVersion == processingRun.ParserVersion,
                    cancellationToken);
            if (existing is null)
            {
                throw;
            }
            return existing;
        }
    }

    public async Task<IReadOnlyList<MeetingReport>> GetReportsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken) =>
        await dbContext.MeetingReports
            .AsNoTracking()
            .Where(report => report.TenantId == tenantId && report.MeetingId == meetingId)
            .OrderByDescending(report => report.GeneratedAt)
            .ThenBy(report => report.Id)
            .ToArrayAsync(cancellationToken);

    public Task<MeetingReport?> GetReportAsync(
        Guid tenantId,
        Guid meetingId,
        Guid reportId,
        CancellationToken cancellationToken) =>
        dbContext.MeetingReports.SingleOrDefaultAsync(
            report => report.TenantId == tenantId
                && report.MeetingId == meetingId
                && report.Id == reportId,
            cancellationToken);

    public Task<Decision?> GetDecisionAsync(
        Guid tenantId,
        Guid meetingId,
        Guid decisionId,
        CancellationToken cancellationToken) =>
        dbContext.Decisions.SingleOrDefaultAsync(
            decision => decision.TenantId == tenantId
                && decision.MeetingId == meetingId
                && decision.Id == decisionId,
            cancellationToken);

    public Task<ActionItem?> GetActionItemAsync(
        Guid tenantId,
        Guid meetingId,
        Guid actionItemId,
        CancellationToken cancellationToken) =>
        dbContext.ActionItems.SingleOrDefaultAsync(
            actionItem => actionItem.TenantId == tenantId
                && actionItem.MeetingId == meetingId
                && actionItem.Id == actionItemId,
            cancellationToken);

    public async Task<IReadOnlyList<Decision>> GetDecisionsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken) =>
        await dbContext.Decisions
            .AsNoTracking()
            .Where(decision => decision.TenantId == tenantId && decision.MeetingId == meetingId)
            .OrderByDescending(decision => decision.CreatedAt)
            .ThenBy(decision => decision.Id)
            .ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<ActionItem>> GetActionItemsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken) =>
        await dbContext.ActionItems
            .AsNoTracking()
            .Where(actionItem => actionItem.TenantId == tenantId && actionItem.MeetingId == meetingId)
            .OrderByDescending(actionItem => actionItem.CreatedAt)
            .ThenBy(actionItem => actionItem.Id)
            .ToArrayAsync(cancellationToken);

    public async Task AddManualMeetingAsync(
        Meeting meeting,
        Capture capture,
        AuditLog auditLog,
        CancellationToken cancellationToken)
    {
        dbContext.Meetings.Add(meeting);
        dbContext.Captures.Add(capture);
        dbContext.AuditLogs.Add(auditLog);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task AddMeetingReportAsync(
        MeetingReport report,
        CancellationToken cancellationToken)
    {
        dbContext.MeetingReports.Add(report);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateMeetingReportAsync(
        MeetingReport report,
        CancellationToken cancellationToken) =>
        await dbContext.SaveChangesAsync(cancellationToken);

    public async Task AddDecisionAsync(
        Decision decision,
        CancellationToken cancellationToken)
    {
        dbContext.Decisions.Add(decision);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateDecisionAsync(
        Decision decision,
        CancellationToken cancellationToken) =>
        await dbContext.SaveChangesAsync(cancellationToken);

    public async Task AddActionItemAsync(
        ActionItem actionItem,
        CancellationToken cancellationToken)
    {
        dbContext.ActionItems.Add(actionItem);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateActionItemAsync(
        ActionItem actionItem,
        CancellationToken cancellationToken) =>
        await dbContext.SaveChangesAsync(cancellationToken);
}
