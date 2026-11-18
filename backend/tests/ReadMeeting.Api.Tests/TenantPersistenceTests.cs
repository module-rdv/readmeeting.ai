using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using ReadMeeting.Domain.Entities;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Api.Tests;

public sealed class TenantPersistenceTests
{
    [Fact]
    public async Task Composite_tenant_keys_and_global_filters_isolate_identical_meeting_ids()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var tenantA = new Tenant { EntraTenantId = Guid.NewGuid() };
        var tenantB = new Tenant { EntraTenantId = Guid.NewGuid() };
        var meetingId = Guid.NewGuid();

        await using (var seedContext = CreateContext(connection, new CurrentTenantContext()))
        {
            await seedContext.Database.EnsureCreatedAsync();
            seedContext.Tenants.AddRange(tenantA, tenantB);
            await seedContext.SaveChangesAsync();
        }

        await SaveMeetingAsync(connection, tenantA, meetingId, "Tenant A meeting");
        await SaveMeetingAsync(connection, tenantB, meetingId, "Tenant B meeting");

        await using var contextA = CreateContext(connection, CreateTenantContext(tenantA));
        await using var contextB = CreateContext(connection, CreateTenantContext(tenantB));

        var resultA = await contextA.Meetings.SingleAsync();
        var resultB = await contextB.Meetings.SingleAsync();

        Assert.Equal("Tenant A meeting", resultA.Title);
        Assert.Equal("Tenant B meeting", resultB.Title);
    }

    [Fact]
    public async Task Composite_foreign_keys_reject_cross_tenant_meeting_relations()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var tenantA = new Tenant { EntraTenantId = Guid.NewGuid() };
        var tenantB = new Tenant { EntraTenantId = Guid.NewGuid() };
        var meetingId = Guid.NewGuid();

        await using (var seedContext = CreateContext(connection, new CurrentTenantContext()))
        {
            await seedContext.Database.EnsureCreatedAsync();
            seedContext.Tenants.AddRange(tenantA, tenantB);
            await seedContext.SaveChangesAsync();
        }

        await SaveMeetingAsync(connection, tenantB, meetingId, "Tenant B meeting");
        await using var contextA = CreateContext(connection, CreateTenantContext(tenantA));
        contextA.Captures.Add(new Capture
        {
            TenantId = tenantA.Id,
            MeetingId = meetingId,
            Method = CaptureMethod.ManualImport
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => contextA.SaveChangesAsync());
    }

    [Fact]
    public async Task Meeting_transcript_processing_and_minutes_relations_persist_consistently()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var tenant = new Tenant { EntraTenantId = Guid.NewGuid() };

        await using (var seedContext = CreateContext(connection, new CurrentTenantContext()))
        {
            await seedContext.Database.EnsureCreatedAsync();
            seedContext.Tenants.Add(tenant);
            await seedContext.SaveChangesAsync();
        }

        await using var context = CreateContext(connection, CreateTenantContext(tenant));
        var user = new UserAccount
        {
            TenantId = tenant.Id,
            EntraObjectId = Guid.NewGuid()
        };
        var meeting = new Meeting
        {
            TenantId = tenant.Id,
            Title = "Decision review",
            OrganizerUser = user
        };
        var hostProfile = new HostProfile
        {
            TenantId = tenant.Id,
            UserAccount = user,
            JobTitle = "Meeting host"
        };
        var capture = new Capture
        {
            TenantId = tenant.Id,
            Meeting = meeting,
            Method = CaptureMethod.ManualImport,
            Status = CaptureStatus.Completed
        };
        var transcript = new Transcript
        {
            TenantId = tenant.Id,
            Meeting = meeting,
            ContentFormat = TranscriptContentFormat.TextVtt,
            Status = TranscriptStatus.Parsed
        };
        var revision = new TranscriptRevision
        {
            TenantId = tenant.Id,
            Transcript = transcript,
            RevisionNumber = 1,
            SourceFormat = TranscriptContentFormat.TextVtt,
            RetrievalMode = TranscriptRetrievalMode.ManualImport,
            RawSha256 = new string('a', 64)
        };
        var cue = new TranscriptCue
        {
            TenantId = tenant.Id,
            TranscriptRevision = revision,
            SequenceNumber = 1,
            StartMilliseconds = 0,
            EndMilliseconds = 1500,
            SpeakerAttribution = SpeakerAttribution.Unattributed,
            Text = "We approve the proposal."
        };
        var run = new ProcessingRun
        {
            TenantId = tenant.Id,
            Meeting = meeting,
            Transcript = transcript,
            RequestedByUser = user,
            IdempotencyKey = "run-1",
            RequestPayloadHash = new string('b', 64),
            ParserVersion = "1.0",
            Status = ProcessingRunStatus.Succeeded
        };
        var processingEvent = new ProcessingEvent
        {
            TenantId = tenant.Id,
            ProcessingRun = run,
            AttemptNumber = 1,
            Stage = "parse",
            ToStatus = nameof(ProcessingRunStatus.Succeeded)
        };
        var report = new MeetingReport
        {
            TenantId = tenant.Id,
            Meeting = meeting,
            Title = "Decision review minutes",
            ReferenceNumber = "DGF-2026-001"
        };
        var decision = new Decision
        {
            TenantId = tenant.Id,
            Meeting = meeting,
            Text = "Approve the proposal",
            Status = DecisionStatus.Confirmed,
            ApprovedByUser = user
        };
        var action = new ActionItem
        {
            TenantId = tenant.Id,
            Meeting = meeting,
            Decision = decision,
            AssigneeUser = user,
            Description = "Prepare the follow-up"
        };
        var sourceEvidence = new SourceEvidence
        {
            TenantId = tenant.Id,
            Meeting = meeting,
            TranscriptRevisionId = revision.Id,
            TranscriptCueId = cue.Id,
            SourceType = SourceEvidenceType.TranscriptCue,
            SourceLocator = "revision:1/cue:1"
        };
        var decisionEvidence = new DecisionEvidence
        {
            TenantId = tenant.Id,
            Decision = decision,
            SourceEvidence = sourceEvidence
        };
        var actionEvidence = new ActionEvidence
        {
            TenantId = tenant.Id,
            ActionItem = action,
            SourceEvidence = sourceEvidence
        };
        var auditLog = new AuditLog
        {
            TenantId = tenant.Id,
            UserAccountId = user.Id,
            EntityType = nameof(Meeting),
            EntityId = meeting.Id,
            Action = "MeetingCreated"
        };

        context.AddRange(
            user,
            meeting,
            hostProfile,
            capture,
            transcript,
            revision,
            cue,
            run,
            processingEvent,
            report,
            decision,
            action,
            sourceEvidence,
            decisionEvidence,
            actionEvidence,
            auditLog);
        await context.SaveChangesAsync();

        var savedMeeting = await context.Meetings
            .Include(item => item.Captures)
            .Include(item => item.Transcripts)
                .ThenInclude(item => item.Revisions)
                    .ThenInclude(item => item.Cues)
            .Include(item => item.ProcessingRuns)
                .ThenInclude(item => item.Events)
            .Include(item => item.Reports)
            .Include(item => item.Decisions)
            .Include(item => item.ActionItems)
            .SingleAsync(item => item.Id == meeting.Id);

        Assert.Single(savedMeeting.Captures);
        Assert.Single(savedMeeting.Transcripts.Single().Revisions.Single().Cues);
        Assert.Equal(ProcessingRunStatus.Succeeded, savedMeeting.ProcessingRuns.Single().Status);
        Assert.Single(savedMeeting.ProcessingRuns.Single().Events);
        Assert.Single(savedMeeting.Reports);
        Assert.Single(savedMeeting.Decisions);
        Assert.Single(savedMeeting.ActionItems);
        Assert.Single(await context.DecisionEvidence.ToArrayAsync());
        Assert.Single(await context.ActionEvidence.ToArrayAsync());
        Assert.Single(await context.HostProfiles.ToArrayAsync());
        Assert.Single(await context.AuditLogs.ToArrayAsync());
    }

    [Fact]
    public async Task Transcript_constraints_reject_invalid_cue_timing_and_sequence()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var tenant = new Tenant { EntraTenantId = Guid.NewGuid() };

        await using (var seedContext = CreateContext(connection, new CurrentTenantContext()))
        {
            await seedContext.Database.EnsureCreatedAsync();
            seedContext.Tenants.Add(tenant);
            await seedContext.SaveChangesAsync();
        }

        await using var context = CreateContext(connection, CreateTenantContext(tenant));
        var meeting = new Meeting { TenantId = tenant.Id, Title = "Transcript meeting" };
        var transcript = new Transcript { TenantId = tenant.Id, Meeting = meeting };
        var revision = new TranscriptRevision { TenantId = tenant.Id, Transcript = transcript, RevisionNumber = 1 };
        var cue = new TranscriptCue
        {
            TenantId = tenant.Id,
            TranscriptRevision = revision,
            SequenceNumber = 0,
            StartMilliseconds = 100,
            EndMilliseconds = 50,
            Text = "Invalid cue"
        };

        context.Meetings.Add(meeting);
        context.Transcripts.Add(transcript);
        context.TranscriptRevisions.Add(revision);
        context.TranscriptCues.Add(cue);

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    private static CurrentTenantContext CreateTenantContext(Tenant tenant)
    {
        var context = new CurrentTenantContext();
        context.Set(tenant.Id, tenant.EntraTenantId, Guid.NewGuid());
        return context;
    }

    private static ReadMeetingDbContext CreateContext(
        SqliteConnection connection,
        CurrentTenantContext tenantContext)
    {
        var options = new DbContextOptionsBuilder<ReadMeetingDbContext>()
            .UseSqlite(connection)
            .Options;
        return new ReadMeetingDbContext(options, tenantContext);
    }

    private static async Task SaveMeetingAsync(
        SqliteConnection connection,
        Tenant tenant,
        Guid meetingId,
        string title)
    {
        await using var context = CreateContext(connection, CreateTenantContext(tenant));
        context.Meetings.Add(new Meeting
        {
            Id = meetingId,
            TenantId = tenant.Id,
            Title = title
        });
        await context.SaveChangesAsync();
    }
}
