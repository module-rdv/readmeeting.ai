using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ReadMeeting.Application.Security;
using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Infrastructure.Persistence;

public sealed class ReadMeetingDbContext(
    DbContextOptions<ReadMeetingDbContext> options,
    ICurrentTenantAccessor currentTenant) : DbContext(options)
{
    public Guid? CurrentTenantId => currentTenant.TenantId;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<HostProfile> HostProfiles => Set<HostProfile>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<Capture> Captures => Set<Capture>();
    public DbSet<Transcript> Transcripts => Set<Transcript>();
    public DbSet<TranscriptRevision> TranscriptRevisions => Set<TranscriptRevision>();
    public DbSet<TranscriptCue> TranscriptCues => Set<TranscriptCue>();
    public DbSet<ProcessingRun> ProcessingRuns => Set<ProcessingRun>();
    public DbSet<ProcessingEvent> ProcessingEvents => Set<ProcessingEvent>();
    public DbSet<MeetingReport> MeetingReports => Set<MeetingReport>();
    public DbSet<Decision> Decisions => Set<Decision>();
    public DbSet<ActionItem> ActionItems => Set<ActionItem>();
    public DbSet<SourceEvidence> SourceEvidence => Set<SourceEvidence>();
    public DbSet<DecisionEvidence> DecisionEvidence => Set<DecisionEvidence>();
    public DbSet<ActionEvidence> ActionEvidence => Set<ActionEvidence>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ConfigureSqliteDateTimeOffset(modelBuilder);
        modelBuilder.Entity<Tenant>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TenantCode).HasMaxLength(100);
            entity.Property(x => x.DisplayName).HasMaxLength(300);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.HasIndex(x => x.EntraTenantId).IsUnique();
            entity.HasIndex(x => x.Status);
            entity.HasQueryFilter(x => CurrentTenantId != null && x.Id == CurrentTenantId);
        });

        foreach (var entityType in modelBuilder.Model.GetEntityTypes()
                     .Where(type => typeof(TenantScopedEntity).IsAssignableFrom(type.ClrType)))
        {
            var entity = modelBuilder.Entity(entityType.ClrType);
            entity.HasKey(nameof(TenantScopedEntity.TenantId), nameof(TenantScopedEntity.Id));
            entity.Property(nameof(TenantScopedEntity.CreatedAt)).IsRequired();

            var parameter = Expression.Parameter(entityType.ClrType, "entity");
            var tenantId = Expression.Property(parameter, nameof(TenantScopedEntity.TenantId));
            var contextTenantId = Expression.Property(
                Expression.Constant(this),
                nameof(CurrentTenantId));
            var hasTenant = Expression.NotEqual(
                contextTenantId,
                Expression.Constant(null, typeof(Guid?)));
            var matchesTenant = Expression.Equal(
                Expression.Convert(tenantId, typeof(Guid?)),
                contextTenantId);
            var filter = Expression.Lambda(
                Expression.AndAlso(hasTenant, matchesTenant),
                parameter);
            entity.HasQueryFilter(filter);
        }

        modelBuilder.Entity<DecisionEvidence>(entity =>
        {
            entity.HasKey(x => new { x.TenantId, x.DecisionId, x.SourceEvidenceId });
            entity.HasQueryFilter(x => CurrentTenantId != null && x.TenantId == CurrentTenantId);
            entity.HasOne(x => x.Decision)
                .WithMany(x => x.Evidence)
                .HasForeignKey(x => new { x.TenantId, x.DecisionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.SourceEvidence)
                .WithMany(x => x.Decisions)
                .HasForeignKey(x => new { x.TenantId, x.SourceEvidenceId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ActionEvidence>(entity =>
        {
            entity.HasKey(x => new { x.TenantId, x.ActionItemId, x.SourceEvidenceId });
            entity.HasQueryFilter(x => CurrentTenantId != null && x.TenantId == CurrentTenantId);
            entity.HasOne(x => x.ActionItem)
                .WithMany(x => x.Evidence)
                .HasForeignKey(x => new { x.TenantId, x.ActionItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.SourceEvidence)
                .WithMany(x => x.Actions)
                .HasForeignKey(x => new { x.TenantId, x.SourceEvidenceId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureRelationships(modelBuilder);
        ConfigurePropertiesAndIndexes(modelBuilder);
    }

    public override int SaveChanges()
    {
        NormalizePostgreSqlDateTimesToUtc();
        StampTenantEntities();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        NormalizePostgreSqlDateTimesToUtc();
        StampTenantEntities();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void NormalizePostgreSqlDateTimesToUtc()
    {
        if (Database.ProviderName != "Npgsql.EntityFrameworkCore.PostgreSQL")
        {
            return;
        }

        foreach (var entry in ChangeTracker.Entries()
                     .Where(entry => entry.State is EntityState.Added or EntityState.Modified))
        {
            foreach (var property in entry.Properties)
            {
                if (property.CurrentValue is DateTimeOffset value && value.Offset != TimeSpan.Zero)
                {
                    property.CurrentValue = value.ToUniversalTime();
                }
            }
        }
    }

    private void StampTenantEntities()
    {
        var tenantId = CurrentTenantId;
        foreach (var entry in ChangeTracker.Entries<TenantScopedEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                if (!tenantId.HasValue)
                {
                    throw new InvalidOperationException("A tenant context is required to persist tenant-scoped data.");
                }

                if (entry.Entity.TenantId == Guid.Empty)
                {
                    entry.Entity.TenantId = tenantId.Value;
                }
                else if (entry.Entity.TenantId != tenantId.Value)
                {
                    throw new InvalidOperationException("Tenant-scoped data cannot be written for another tenant.");
                }
            }
            else if (entry.State == EntityState.Modified)
            {
                if (!tenantId.HasValue || entry.Entity.TenantId != tenantId.Value)
                {
                    throw new InvalidOperationException("Tenant-scoped data cannot be changed outside its tenant context.");
                }

                entry.Property(nameof(TenantScopedEntity.TenantId)).IsModified = false;
                entry.Entity.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }
    }

    private static void ConfigureRelationships(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserAccount>()
            .HasOne(x => x.Tenant)
            .WithMany(x => x.Users)
            .HasForeignKey(x => x.TenantId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<UserAccount>()
            .HasOne(x => x.HostProfile)
            .WithOne(x => x.UserAccount)
            .HasForeignKey<HostProfile>(x => new { x.TenantId, x.UserAccountId })
            .HasPrincipalKey<UserAccount>(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Meeting>()
            .HasOne(x => x.Tenant)
            .WithMany(x => x.Meetings)
            .HasForeignKey(x => x.TenantId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Meeting>()
            .HasOne(x => x.OrganizerUser)
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.OrganizerUserId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Capture>()
            .HasOne(x => x.Meeting)
            .WithMany(x => x.Captures)
            .HasForeignKey(x => new { x.TenantId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Transcript>()
            .HasOne(x => x.Meeting)
            .WithMany(x => x.Transcripts)
            .HasForeignKey(x => new { x.TenantId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Transcript>()
            .HasAlternateKey(x => new { x.TenantId, x.Id, x.MeetingId });

        modelBuilder.Entity<TranscriptRevision>()
            .HasOne(x => x.Transcript)
            .WithMany(x => x.Revisions)
            .HasForeignKey(x => new { x.TenantId, x.TranscriptId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id, x.MeetingId })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<TranscriptCue>()
            .HasOne(x => x.TranscriptRevision)
            .WithMany(x => x.Cues)
            .HasForeignKey(x => new { x.TenantId, x.TranscriptRevisionId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TranscriptCue>()
            .HasAlternateKey(x => new { x.TenantId, x.Id, x.TranscriptRevisionId });

        modelBuilder.Entity<ProcessingRun>()
            .HasOne(x => x.Meeting)
            .WithMany(x => x.ProcessingRuns)
            .HasForeignKey(x => new { x.TenantId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ProcessingRun>()
            .HasOne(x => x.Transcript)
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.TranscriptId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id, x.MeetingId })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ProcessingRun>()
            .HasOne(x => x.RequestedByUser)
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.RequestedByUserId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ProcessingEvent>()
            .HasOne(x => x.ProcessingRun)
            .WithMany(x => x.Events)
            .HasForeignKey(x => new { x.TenantId, x.ProcessingRunId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<MeetingReport>()
            .HasOne(x => x.Meeting)
            .WithMany(x => x.Reports)
            .HasForeignKey(x => new { x.TenantId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Decision>()
            .HasOne(x => x.Meeting)
            .WithMany(x => x.Decisions)
            .HasForeignKey(x => new { x.TenantId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Decision>()
            .HasAlternateKey(x => new { x.TenantId, x.Id, x.MeetingId });

        modelBuilder.Entity<Decision>()
            .HasOne(x => x.ApprovedByUser)
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.ApprovedByUserId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ActionItem>()
            .HasOne(x => x.Meeting)
            .WithMany(x => x.ActionItems)
            .HasForeignKey(x => new { x.TenantId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ActionItem>()
            .HasOne(x => x.Decision)
            .WithMany(x => x.Actions)
            .HasForeignKey(x => new { x.TenantId, x.DecisionId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id, x.MeetingId })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ActionItem>()
            .HasOne(x => x.AssigneeUser)
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.AssigneeUserId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<SourceEvidence>()
            .HasOne(x => x.Meeting)
            .WithMany(x => x.SourceEvidence)
            .HasForeignKey(x => new { x.TenantId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SourceEvidence>()
            .HasOne<TranscriptRevision>()
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.TranscriptRevisionId, x.MeetingId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id, x.MeetingId })
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SourceEvidence>()
            .HasOne<TranscriptCue>()
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.TranscriptCueId, x.TranscriptRevisionId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id, x.TranscriptRevisionId })
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<AuditLog>()
            .HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(x => new { x.TenantId, x.UserAccountId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
    }

    private void ConfigurePropertiesAndIndexes(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.Property(x => x.Upn).HasMaxLength(320);
            entity.Property(x => x.DisplayName).HasMaxLength(300);
            entity.Property(x => x.Mail).HasMaxLength(320);
            entity.HasIndex(x => new { x.TenantId, x.EntraObjectId }).IsUnique();
        });

        modelBuilder.Entity<HostProfile>(entity =>
        {
            entity.Property(x => x.PreferredDisplayName).HasMaxLength(300);
            entity.Property(x => x.JobTitle).HasMaxLength(200);
            entity.Property(x => x.OfficeLocation).HasMaxLength(200);
            entity.HasIndex(x => new { x.TenantId, x.UserAccountId }).IsUnique();
        });

        modelBuilder.Entity<Meeting>(entity =>
        {
            entity.Property(x => x.MicrosoftGraphId).HasMaxLength(500);
            entity.Property(x => x.Title).HasMaxLength(500).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(4000);
            entity.Property(x => x.OrganizerEmail).HasMaxLength(320);
            entity.Property(x => x.OrganizerName).HasMaxLength(300);
            entity.Property(x => x.DepartmentCode).HasMaxLength(100);
            entity.Property(x => x.JoinWebUrl).HasMaxLength(2048);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(x => new { x.TenantId, x.MicrosoftGraphId })
                .IsUnique()
                .HasFilter($"{QuoteColumn(nameof(Meeting.MicrosoftGraphId))} IS NOT NULL");
            entity.HasIndex(x => new { x.TenantId, x.StartTime });
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_Meeting_TimeRange",
                $"{QuoteColumn(nameof(Meeting.EndTime))} IS NULL OR "
                + $"{QuoteColumn(nameof(Meeting.StartTime))} IS NULL OR "
                + $"{QuoteColumn(nameof(Meeting.EndTime))} > {QuoteColumn(nameof(Meeting.StartTime))}"));
        });

        modelBuilder.Entity<Capture>(entity =>
        {
            entity.Property(x => x.Method).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.SourceReference).HasMaxLength(2048);
        });

        modelBuilder.Entity<Transcript>(entity =>
        {
            entity.Property(x => x.GraphTranscriptId).HasMaxLength(500);
            entity.Property(x => x.ContentFormat).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.Language).HasMaxLength(20);
            entity.Property(x => x.RetrievalMode).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.HasIndex(x => new { x.TenantId, x.MeetingId, x.GraphTranscriptId })
                .IsUnique()
                .HasFilter($"{QuoteColumn(nameof(Transcript.GraphTranscriptId))} IS NOT NULL");
        });

        modelBuilder.Entity<TranscriptRevision>(entity =>
        {
            entity.Property(x => x.SourceFormat).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.RetrievalMode).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.RawContentReference).HasMaxLength(2048);
            entity.Property(x => x.RawSha256).HasMaxLength(64).IsFixedLength();
            entity.Property(x => x.ContentType).HasMaxLength(200);
            entity.Property(x => x.GraphRequestId).HasMaxLength(200);
            entity.HasIndex(x => new { x.TenantId, x.TranscriptId, x.RevisionNumber }).IsUnique();
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_TranscriptRevision_RevisionNumber",
                $"{QuoteColumn(nameof(TranscriptRevision.RevisionNumber))} > 0"));
        });

        modelBuilder.Entity<TranscriptCue>(entity =>
        {
            entity.Property(x => x.SpeakerName).HasMaxLength(300);
            entity.Property(x => x.SpeakerAttribution).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Text).IsRequired();
            entity.HasIndex(x => new { x.TenantId, x.TranscriptRevisionId, x.SequenceNumber }).IsUnique();
            entity.HasIndex(x => new { x.TenantId, x.TranscriptRevisionId, x.StartMilliseconds });
            entity.ToTable(table =>
            {
                table.HasCheckConstraint(
                    "CK_TranscriptCue_SequenceNumber",
                    $"{QuoteColumn(nameof(TranscriptCue.SequenceNumber))} > 0");
                table.HasCheckConstraint(
                    "CK_TranscriptCue_StartMilliseconds",
                    $"{QuoteColumn(nameof(TranscriptCue.StartMilliseconds))} >= 0");
                table.HasCheckConstraint(
                    "CK_TranscriptCue_EndMilliseconds",
                    $"{QuoteColumn(nameof(TranscriptCue.EndMilliseconds))} IS NULL OR "
                    + $"{QuoteColumn(nameof(TranscriptCue.EndMilliseconds))} >= "
                    + $"{QuoteColumn(nameof(TranscriptCue.StartMilliseconds))}");
            });
        });

        modelBuilder.Entity<ProcessingRun>(entity =>
        {
            entity.Property(x => x.IdempotencyKey).HasMaxLength(200).IsRequired();
            entity.Property(x => x.RequestPayloadHash).HasMaxLength(64).IsRequired();
            entity.Property(x => x.SourceContentHash).HasMaxLength(64);
            entity.Property(x => x.ParserVersion).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ModelUsed).HasMaxLength(200);
            entity.Property(x => x.ErrorMessage).HasMaxLength(2000);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
            entity.HasIndex(x => new { x.TenantId, x.RequestedByUserId, x.IdempotencyKey }).IsUnique();
            entity.HasIndex(x => new { x.TenantId, x.MeetingId, x.Status });
            entity.HasIndex(x => new { x.TenantId, x.TranscriptId, x.ParserVersion })
                .IsUnique()
                .HasFilter(
                    $"{QuoteColumn(nameof(ProcessingRun.TranscriptId))} IS NOT NULL AND "
                    + $"{QuoteColumn(nameof(ProcessingRun.Status))} IN "
                    + "('Queued', 'ResolvingMeeting', 'DiscoveringTranscript', 'DownloadingTranscript', "
                    + "'ParsingTranscript', 'ValidatingTranscript', 'PersistingTranscript')");
            var requestPayloadHashLength = $"LENGTH({QuoteColumn(nameof(ProcessingRun.RequestPayloadHash))})";
            entity.ToTable(table =>
            {
                table.HasCheckConstraint(
                    "CK_ProcessingRun_AttemptCount",
                    $"{QuoteColumn(nameof(ProcessingRun.AttemptCount))} >= 0");
                table.HasCheckConstraint(
                    "CK_ProcessingRun_RequestPayloadHash",
                    $"{requestPayloadHashLength} = 64");
            });
        });

        modelBuilder.Entity<ProcessingEvent>(entity =>
        {
            entity.Property(x => x.Stage).HasMaxLength(100).IsRequired();
            entity.Property(x => x.FromStatus).HasMaxLength(40);
            entity.Property(x => x.ToStatus).HasMaxLength(40).IsRequired();
            entity.Property(x => x.ErrorCode).HasMaxLength(200);
            entity.Property(x => x.GraphErrorCode).HasMaxLength(200);
            entity.Property(x => x.GraphRequestId).HasMaxLength(200);
            entity.Property(x => x.RedactedMessage).HasMaxLength(2000);
            entity.HasIndex(x => new { x.TenantId, x.ProcessingRunId, x.OccurredAt });
        });

        modelBuilder.Entity<MeetingReport>(entity =>
        {
            entity.Property(x => x.Title).HasMaxLength(500).IsRequired();
            entity.Property(x => x.ReferenceNumber).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ExecutiveSummary).IsRequired();
            entity.Property(x => x.DecisionsAgreed).IsRequired();
            entity.Property(x => x.KeyDiscussionPoints).IsRequired();
            entity.Property(x => x.StructuredContentJson);
            entity.Property(x => x.SharePointDocxUrl).HasMaxLength(2048);
            entity.Property(x => x.SharePointFileId).HasMaxLength(500);
            entity.Property(x => x.SharePointDriveId).HasMaxLength(500);
            entity.Property(x => x.SharePointFolderId).HasMaxLength(500);
            entity.Property(x => x.SharePointVersion).HasMaxLength(200);
            entity.Property(x => x.SharePointPublishedBy).HasMaxLength(320);
            entity.Property(x => x.SharePointPublicationError).HasMaxLength(4000);
            entity.Property(x => x.ApprovalStatus).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.ValidatedByEmail).HasMaxLength(320);
            entity.HasIndex(x => new { x.TenantId, x.ReferenceNumber }).IsUnique();
            entity.HasIndex(x => new { x.TenantId, x.MeetingId, x.GeneratedAt });
        });

        modelBuilder.Entity<Decision>(entity =>
        {
            entity.Property(x => x.Text).HasMaxLength(4000).IsRequired();
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.DecisionType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.ApprovedByName).HasMaxLength(300);
            entity.HasIndex(x => new { x.TenantId, x.MeetingId });
        });

        modelBuilder.Entity<ActionItem>(entity =>
        {
            entity.Property(x => x.Title).HasMaxLength(500);
            entity.Property(x => x.Description).HasMaxLength(4000).IsRequired();
            entity.Property(x => x.AssigneeName).HasMaxLength(300);
            entity.Property(x => x.AssigneeEmail).HasMaxLength(320);
            entity.Property(x => x.DeadlineText).HasMaxLength(300);
            entity.Property(x => x.Priority).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.HasIndex(x => new { x.TenantId, x.MeetingId, x.Status });
        });

        modelBuilder.Entity<SourceEvidence>(entity =>
        {
            entity.Property(x => x.SourceType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.SourceLocator).HasMaxLength(2048).IsRequired();
            entity.Property(x => x.SourceText).HasMaxLength(4000);
            entity.Property(x => x.ExcerptHash).HasMaxLength(64).IsFixedLength();
            entity.Property(x => x.ReferenceUri).HasMaxLength(2048);
            entity.HasIndex(x => new { x.TenantId, x.MeetingId, x.TranscriptRevisionId, x.TranscriptCueId });
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_SourceEvidence_TranscriptLink",
                $"({QuoteColumn(nameof(ReadMeeting.Domain.Entities.SourceEvidence.SourceType))} = 'TranscriptCue' AND "
                + $"{QuoteColumn(nameof(ReadMeeting.Domain.Entities.SourceEvidence.TranscriptRevisionId))} IS NOT NULL AND "
                + $"{QuoteColumn(nameof(ReadMeeting.Domain.Entities.SourceEvidence.TranscriptCueId))} IS NOT NULL) OR "
                + $"({QuoteColumn(nameof(ReadMeeting.Domain.Entities.SourceEvidence.SourceType))} <> 'TranscriptCue' AND "
                + $"{QuoteColumn(nameof(ReadMeeting.Domain.Entities.SourceEvidence.TranscriptCueId))} IS NULL)"));
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.Property(x => x.EntityType).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Action).HasMaxLength(100).IsRequired();
            entity.Property(x => x.DetailsJson).IsRequired();
            entity.Property(x => x.RequestId).HasMaxLength(200);
            entity.Property(x => x.SourceIp).HasMaxLength(64);
            entity.HasIndex(x => new { x.TenantId, x.CreatedAt });
        });
    }

    private void ConfigureSqliteDateTimeOffset(ModelBuilder modelBuilder)
    {
        if (Database.ProviderName != "Microsoft.EntityFrameworkCore.Sqlite")
        {
            return;
        }

        var converter = new ValueConverter<DateTimeOffset, long>(
            value => value.ToUnixTimeMilliseconds(),
            value => DateTimeOffset.FromUnixTimeMilliseconds(value));
        var nullableConverter = new ValueConverter<DateTimeOffset?, long?>(
            value => value.HasValue ? value.Value.ToUnixTimeMilliseconds() : null,
            value => value.HasValue ? DateTimeOffset.FromUnixTimeMilliseconds(value.Value) : null);

        foreach (var property in modelBuilder.Model.GetEntityTypes()
                     .SelectMany(entityType => entityType.GetProperties()))
        {
            if (property.ClrType == typeof(DateTimeOffset))
            {
                property.SetValueConverter(converter);
            }
            else if (property.ClrType == typeof(DateTimeOffset?))
            {
                property.SetValueConverter(nullableConverter);
            }
        }
    }

    private static string QuoteColumn(string columnName) => $"\"{columnName}\"";
}
