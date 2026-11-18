using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Application.Meetings;

public interface IMeetingRepository
{
    Task<IReadOnlyList<Meeting>> ListAsync(
        Guid tenantId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken cancellationToken);

    Task<MeetingDashboardCounts> GetDashboardCountsAsync(
        Guid tenantId,
        CancellationToken cancellationToken);

    Task<Meeting?> GetAsync(Guid tenantId, Guid meetingId, CancellationToken cancellationToken);

    Task<bool> DecisionBelongsToMeetingAsync(
        Guid tenantId,
        Guid meetingId,
        Guid decisionId,
        CancellationToken cancellationToken);

    Task<(Meeting Meeting, Transcript Transcript)> UpsertTeamsTranscriptAsync(
        Guid tenantId,
        Meeting meeting,
        Transcript transcript,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<Transcript>> GetTranscriptsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken);

    Task<Transcript?> GetTranscriptAsync(
        Guid tenantId,
        Guid meetingId,
        Guid transcriptId,
        CancellationToken cancellationToken);

    Task AddTranscriptAsync(Transcript transcript, CancellationToken cancellationToken);

    Task<IReadOnlyList<ProcessingRun>> GetProcessingRunsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken);

    Task<ProcessingRun?> GetProcessingRunAsync(
        Guid tenantId,
        Guid processingRunId,
        CancellationToken cancellationToken);

    Task<ProcessingRun> AddProcessingRunAsync(ProcessingRun processingRun, CancellationToken cancellationToken);

    Task<IReadOnlyList<MeetingReport>> GetReportsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken);

    Task<MeetingReport?> GetReportAsync(
        Guid tenantId,
        Guid meetingId,
        Guid reportId,
        CancellationToken cancellationToken);

    Task<Decision?> GetDecisionAsync(
        Guid tenantId,
        Guid meetingId,
        Guid decisionId,
        CancellationToken cancellationToken);

    Task<ActionItem?> GetActionItemAsync(
        Guid tenantId,
        Guid meetingId,
        Guid actionItemId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<Decision>> GetDecisionsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<ActionItem>> GetActionItemsAsync(
        Guid tenantId,
        Guid meetingId,
        CancellationToken cancellationToken);

    Task AddManualMeetingAsync(
        Meeting meeting,
        Capture capture,
        AuditLog auditLog,
        CancellationToken cancellationToken);

    Task AddMeetingReportAsync(MeetingReport report, CancellationToken cancellationToken);

    Task UpdateMeetingReportAsync(MeetingReport report, CancellationToken cancellationToken);

    Task AddDecisionAsync(Decision decision, CancellationToken cancellationToken);

    Task UpdateDecisionAsync(Decision decision, CancellationToken cancellationToken);

    Task AddActionItemAsync(ActionItem actionItem, CancellationToken cancellationToken);

    Task UpdateActionItemAsync(ActionItem actionItem, CancellationToken cancellationToken);
}

public sealed record MeetingDashboardCounts(
    int MeetingCount,
    int TranscriptCount,
    int ReportCount,
    int DecisionCount,
    int PendingActionCount,
    int ActiveOrFailedProcessingCount,
    IReadOnlyList<Meeting> RecentMeetings);
