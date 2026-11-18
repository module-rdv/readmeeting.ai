namespace ReadMeeting.Domain.Entities;

public sealed class Meeting : TenantScopedEntity
{
    public string? MicrosoftGraphId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateTimeOffset? StartTime { get; set; }

    public DateTimeOffset? EndTime { get; set; }

    public Guid? OrganizerUserId { get; set; }

    public string? OrganizerEmail { get; set; }

    public string? OrganizerName { get; set; }

    public string? DepartmentCode { get; set; }

    public string? JoinWebUrl { get; set; }

    public MeetingCaptureStatus Status { get; set; } = MeetingCaptureStatus.Scheduled;

    public Tenant Tenant { get; set; } = null!;

    public UserAccount? OrganizerUser { get; set; }

    public ICollection<Capture> Captures { get; set; } = new List<Capture>();

    public ICollection<Transcript> Transcripts { get; set; } = new List<Transcript>();

    public ICollection<ProcessingRun> ProcessingRuns { get; set; } = new List<ProcessingRun>();

    public ICollection<MeetingReport> Reports { get; set; } = new List<MeetingReport>();

    public ICollection<Decision> Decisions { get; set; } = new List<Decision>();

    public ICollection<ActionItem> ActionItems { get; set; } = new List<ActionItem>();

    public ICollection<SourceEvidence> SourceEvidence { get; set; } = new List<SourceEvidence>();
}

public enum MeetingCaptureStatus
{
    Scheduled = 0,
    InProgress = 1,
    Completed = 2,
    Transcribing = 3,
    Transcribed = 4,
    ReportGenerated = 5,
    Archived = 6,
    Failed = 99
}

