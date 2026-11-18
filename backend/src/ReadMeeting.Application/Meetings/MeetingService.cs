using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
using System.Text;
using ReadMeeting.Application.Security;
using ReadMeeting.Application.Users;
using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Application.Meetings;

public sealed class MeetingService
{
    private readonly ICurrentTenantAccessor _currentTenant;
    private readonly IUserAccountRepository _users;
    private readonly IMeetingRepository _meetings;
    private readonly TimeProvider _timeProvider;

    public MeetingService(
        ICurrentTenantAccessor currentTenant,
        IUserAccountRepository users,
        IMeetingRepository meetings,
        TimeProvider timeProvider)
    {
        _currentTenant = currentTenant;
        _users = users;
        _meetings = meetings;
        _timeProvider = timeProvider;
    }

    public async Task<IReadOnlyList<MeetingSummary>> ListAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken cancellationToken)
    {
        if (from.HasValue && to.HasValue && from.Value >= to.Value)
        {
            throw new InvalidRequestException("The start of the date range must be earlier than its end.");
        }

        var tenantId = RequireTenantId();
        var meetings = await _meetings.ListAsync(tenantId, from, to, cancellationToken);
        return meetings.Select(ToSummary).ToArray();
    }

    public async Task<MeetingDashboardSummary> GetDashboardAsync(CancellationToken cancellationToken)
    {
        var counts = await _meetings.GetDashboardCountsAsync(RequireTenantId(), cancellationToken);
        return new MeetingDashboardSummary(
            counts.MeetingCount,
            counts.TranscriptCount,
            counts.ReportCount,
            counts.DecisionCount,
            counts.PendingActionCount,
            counts.ActiveOrFailedProcessingCount,
            counts.RecentMeetings.Select(ToSummary).ToArray());
    }

    public async Task<MeetingDetails?> GetAsync(Guid meetingId, CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        var meeting = await _meetings.GetAsync(tenantId, meetingId, cancellationToken);
        return meeting is null ? null : ToDetails(meeting);
    }

    public async Task<IReadOnlyList<TranscriptSummary>?> GetTranscriptsAsync(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            return null;
        }

        var transcripts = await _meetings.GetTranscriptsAsync(tenantId, meetingId, cancellationToken);
        return transcripts.Select(transcript => new TranscriptSummary(
            transcript.Id,
            transcript.GraphTranscriptId,
            transcript.ContentFormat,
            transcript.Status,
            transcript.RetrievedAt)).ToArray();
    }

    public async Task<TranscriptDetails?> GetTranscriptAsync(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            return null;
        }

        var transcript = (await _meetings.GetTranscriptsAsync(tenantId, meetingId, cancellationToken))
            .FirstOrDefault();
        return transcript is null ? null : ToTranscriptDetails(transcript);
    }

    public async Task<TranscriptDetails?> GetTranscriptAsync(
        Guid meetingId,
        Guid transcriptId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        var transcript = await _meetings.GetTranscriptAsync(
            tenantId,
            meetingId,
            transcriptId,
            cancellationToken);
        return transcript is null ? null : ToTranscriptDetails(transcript);
    }

    public async Task<TranscriptDetails> CreateTranscriptAsync(
        Guid meetingId,
        CreateTranscriptRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        var meeting = await _meetings.GetAsync(tenantId, meetingId, cancellationToken);
        if (meeting is null)
        {
            throw new ResourceNotFoundException("The meeting was not found.");
        }

        if (string.IsNullOrWhiteSpace(request.Content)
            || request.Content.Length > 1_000_000
            || request.ContentFormat is not TranscriptContentFormat.TextVtt
                and not TranscriptContentFormat.TextPlainUnattributed)
        {
            throw new InvalidRequestException("Transcript content and a supported content format are required.");
        }

        var now = _timeProvider.GetUtcNow();
        var sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.Content)));
        var transcript = new Transcript
        {
            TenantId = tenantId,
            MeetingId = meetingId,
            ContentFormat = request.ContentFormat,
            Language = request.Language?.Trim(),
            RetrievalMode = TranscriptRetrievalMode.ManualImport,
            Status = TranscriptStatus.Available,
            RetrievedAt = now,
            CreatedAt = now,
            Revisions =
            [
                new TranscriptRevision
                {
                    TenantId = tenantId,
                    MeetingId = meetingId,
                    RevisionNumber = 1,
                    SourceFormat = request.ContentFormat,
                    RetrievalMode = TranscriptRetrievalMode.ManualImport,
                    RawContent = request.Content,
                    RawSha256 = sha256,
                    ContentType = request.ContentFormat == TranscriptContentFormat.TextVtt
                        ? "text/vtt"
                        : "text/plain",
                    RetrievedAt = now,
                    CreatedAt = now
                }
            ]
        };

        await _meetings.AddTranscriptAsync(transcript, cancellationToken);
        return ToTranscriptDetails(transcript);
    }

    public async Task<TeamsTranscriptImportResult> ImportTeamsTranscriptAsync(
        ImportTeamsTranscriptRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (string.IsNullOrWhiteSpace(request.GraphMeetingId)
            || string.IsNullOrWhiteSpace(request.GraphTranscriptId)
            || string.IsNullOrWhiteSpace(request.Title)
            || string.IsNullOrWhiteSpace(request.Content)
            || request.Content.Length > 1_000_000
            || request.ContentFormat is not TranscriptContentFormat.TextVtt
                and not TranscriptContentFormat.TextPlainUnattributed
            || request.StartTime.HasValue && request.EndTime.HasValue && request.StartTime >= request.EndTime)
        {
            throw new InvalidRequestException("Valid Teams meeting and transcript details are required.");
        }

        var now = _timeProvider.GetUtcNow();
        var retrievalMode = request.ContentFormat == TranscriptContentFormat.TextVtt
            ? TranscriptRetrievalMode.StandardVtt
            : TranscriptRetrievalMode.FallbackUnattributed;
        var sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.Content)));
        var meeting = new Meeting
        {
            TenantId = tenantId,
            MicrosoftGraphId = request.GraphMeetingId.Trim(),
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            OrganizerEmail = request.OrganizerEmail?.Trim(),
            OrganizerName = request.OrganizerName?.Trim(),
            DepartmentCode = request.DepartmentCode?.Trim(),
            JoinWebUrl = request.JoinWebUrl?.Trim(),
            Status = MeetingCaptureStatus.Transcribed,
            CreatedAt = now
        };
        var transcript = new Transcript
        {
            TenantId = tenantId,
            GraphTranscriptId = request.GraphTranscriptId.Trim(),
            ContentFormat = request.ContentFormat,
            Language = request.Language?.Trim(),
            RetrievalMode = retrievalMode,
            Status = TranscriptStatus.Available,
            RetrievedAt = now,
            CreatedAt = now,
            Revisions =
            [
                new TranscriptRevision
                {
                    TenantId = tenantId,
                    RevisionNumber = 1,
                    SourceFormat = request.ContentFormat,
                    RetrievalMode = retrievalMode,
                    RawContent = request.Content,
                    RawSha256 = sha256,
                    ContentType = request.ContentFormat == TranscriptContentFormat.TextVtt
                        ? "text/vtt"
                        : "text/plain",
                    RetrievedAt = now,
                    CreatedAt = now
                }
            ]
        };

        var saved = await _meetings.UpsertTeamsTranscriptAsync(
            tenantId,
            meeting,
            transcript,
            cancellationToken);
        return new TeamsTranscriptImportResult(
            ToDetails(saved.Meeting),
            ToTranscriptDetails(saved.Transcript));
    }

    public async Task<IReadOnlyList<ProcessingRunSummary>?> GetProcessingRunsAsync(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            return null;
        }

        var runs = await _meetings.GetProcessingRunsAsync(tenantId, meetingId, cancellationToken);
        return runs.Select(run => new ProcessingRunSummary(
            run.Id,
            run.Status,
            run.AttemptCount,
            run.CreatedAt,
            run.StartedAt,
            run.CompletedAt)).ToArray();
    }

    public async Task<ProcessingRunDetails?> GetProcessingRunAsync(
        Guid processingRunId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        var run = await _meetings.GetProcessingRunAsync(tenantId, processingRunId, cancellationToken);
        return run is null ? null : ToProcessingRunDetails(run);
    }

    public async Task<ProcessingRunDetails> CreateProcessingRunAsync(
        Guid meetingId,
        CreateProcessingRunRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        var entraObjectId = _currentTenant.EntraObjectId
            ?? throw new InvalidOperationException("The authenticated user context is missing.");

        var user = await _users.GetOrCreateForAuthenticatedUserAsync(
            tenantId,
            entraObjectId,
            cancellationToken);
        if (!user.IsActive)
        {
            throw new AccessDeniedException("The authenticated user account is inactive.");
        }

        var transcript = await _meetings.GetTranscriptAsync(
            tenantId,
            meetingId,
            request.TranscriptId,
            cancellationToken);
        if (transcript is null)
        {
            throw new ResourceNotFoundException("The meeting or transcript was not found.");
        }

        if (transcript.Status is not TranscriptStatus.Available and not TranscriptStatus.Parsed)
        {
            throw new InvalidRequestException("A processing run requires an available transcript.");
        }

        var revision = transcript.Revisions
            .OrderByDescending(item => item.RevisionNumber)
            .FirstOrDefault()
            ?? throw new InvalidRequestException("The transcript has no persisted content revision.");
        const string parserVersion = "gemini-structured-v1";
        var existingRuns = await _meetings.GetProcessingRunsAsync(
            tenantId,
            meetingId,
            cancellationToken);
        var equivalentRun = existingRuns.FirstOrDefault(existing =>
            existing.TranscriptId == transcript.Id
            && existing.SourceContentHash == revision.RawSha256
            && existing.ParserVersion == parserVersion
            && existing.Status is not ProcessingRunStatus.FailedRetryable
                and not ProcessingRunStatus.FailedPermanent);
        if (equivalentRun is not null)
        {
            return ToProcessingRunDetails(equivalentRun);
        }

        var now = _timeProvider.GetUtcNow();
        var requestPayloadHash = Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes($"{meetingId:D}:{transcript.Id:D}:{parserVersion}")));
        var run = new ProcessingRun
        {
            TenantId = tenantId,
            MeetingId = meetingId,
            TranscriptId = transcript.Id,
            RequestedByUserId = user.Id,
            IdempotencyKey = Guid.NewGuid().ToString("N"),
            RequestPayloadHash = requestPayloadHash,
            SourceContentHash = revision.RawSha256,
            ParserVersion = parserVersion,
            Status = ProcessingRunStatus.Queued,
            CreatedAt = now
        };

        var savedRun = await _meetings.AddProcessingRunAsync(run, cancellationToken);
        return ToProcessingRunDetails(savedRun);
    }

    public async Task<IReadOnlyList<MeetingReportSummary>?> GetReportsAsync(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            return null;
        }

        var reports = await _meetings.GetReportsAsync(tenantId, meetingId, cancellationToken);
        return reports.Select(report => new MeetingReportSummary(
            report.Id,
            report.Title,
            report.ReferenceNumber,
            report.ApprovalStatus,
            report.GeneratedAt)).ToArray();
    }

    public async Task<MeetingReportDetails?> GetReportAsync(
        Guid meetingId,
        Guid reportId,
        CancellationToken cancellationToken)
    {
        var report = await _meetings.GetReportAsync(
            RequireTenantId(),
            meetingId,
            reportId,
            cancellationToken);
        return report is null ? null : ToReportDetails(report);
    }

    public async Task<MeetingReportDetails> CreateReportAsync(
        Guid meetingId,
        CreateMeetingReportRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            throw new ResourceNotFoundException("The meeting was not found.");
        }

        if (string.IsNullOrWhiteSpace(request.Title)
            || string.IsNullOrWhiteSpace(request.ReferenceNumber)
            || string.IsNullOrWhiteSpace(request.ExecutiveSummary)
            || string.IsNullOrWhiteSpace(request.DecisionsAgreed)
            || string.IsNullOrWhiteSpace(request.KeyDiscussionPoints))
        {
            throw new InvalidRequestException("A meeting report requires a title, reference, summary and agreed decisions.");
        }
        if (request.ApprovalStatus != ReportApprovalStatus.Draft)
        {
            throw new InvalidRequestException("A newly created meeting report must start in draft status.");
        }

        var report = new MeetingReport
        {
            TenantId = tenantId,
            MeetingId = meetingId,
            Title = request.Title.Trim(),
            ReferenceNumber = request.ReferenceNumber.Trim(),
            ExecutiveSummary = request.ExecutiveSummary.Trim(),
            DecisionsAgreed = request.DecisionsAgreed.Trim(),
            KeyDiscussionPoints = request.KeyDiscussionPoints.Trim(),
            ApprovalStatus = request.ApprovalStatus,
            ValidatedByEmail = null,
            GeneratedAt = _timeProvider.GetUtcNow()
        };

        await _meetings.AddMeetingReportAsync(report, cancellationToken);
        return ToReportDetails(report);
    }

    public async Task<MeetingReportDetails?> UpdateReportAsync(
        Guid meetingId,
        Guid reportId,
        UpdateMeetingReportRequest request,
        string? validatorEmail,
        bool isValidator,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        var report = await _meetings.GetReportAsync(tenantId, meetingId, reportId, cancellationToken);
        if (report is null)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(request.Title)
            || string.IsNullOrWhiteSpace(request.ExecutiveSummary)
            || string.IsNullOrWhiteSpace(request.DecisionsAgreed)
            || string.IsNullOrWhiteSpace(request.KeyDiscussionPoints))
        {
            throw new InvalidRequestException("A report title, summary, decisions and discussion points are required.");
        }

        if (request.ApprovalStatus is ReportApprovalStatus.Published
            or ReportApprovalStatus.Publishing
            or ReportApprovalStatus.PublicationFailed)
        {
            throw new InvalidRequestException(
                "Publication status can only be changed by the SharePoint publication workflow.");
        }

        if (report.ApprovalStatus is ReportApprovalStatus.Published or ReportApprovalStatus.Publishing)
        {
            throw new InvalidRequestException("A published or currently publishing report cannot be edited.");
        }

        var isDecision = request.ApprovalStatus is ReportApprovalStatus.Approved or ReportApprovalStatus.Rejected;
        var isPreviouslyApproved = report.ApprovalStatus is ReportApprovalStatus.Approved
            or ReportApprovalStatus.PublicationFailed;
        if ((isDecision || isPreviouslyApproved) && !isValidator)
        {
            throw new AccessDeniedException("The ReadMeeting.ReportValidator application role is required.");
        }
        if (isDecision && string.IsNullOrWhiteSpace(validatorEmail))
        {
            throw new InvalidRequestException("A validator email claim is required to approve or reject a report.");
        }

        var allowedTransition = report.ApprovalStatus switch
        {
            ReportApprovalStatus.Draft => request.ApprovalStatus is ReportApprovalStatus.Draft
                or ReportApprovalStatus.UnderReview,
            ReportApprovalStatus.UnderReview => request.ApprovalStatus is ReportApprovalStatus.Draft
                or ReportApprovalStatus.UnderReview
                or ReportApprovalStatus.Approved
                or ReportApprovalStatus.Rejected,
            ReportApprovalStatus.Approved => request.ApprovalStatus is ReportApprovalStatus.Approved
                or ReportApprovalStatus.UnderReview
                or ReportApprovalStatus.Rejected,
            ReportApprovalStatus.Rejected => request.ApprovalStatus is ReportApprovalStatus.Rejected
                or ReportApprovalStatus.Draft
                or ReportApprovalStatus.UnderReview,
            ReportApprovalStatus.PublicationFailed => request.ApprovalStatus == ReportApprovalStatus.UnderReview,
            _ => false
        };
        if (!allowedTransition)
        {
            throw new InvalidRequestException(
                $"The report cannot transition from {report.ApprovalStatus} to {request.ApprovalStatus}.");
        }

        if (report.ApprovalStatus == ReportApprovalStatus.Approved
            && request.ApprovalStatus == ReportApprovalStatus.Approved
            && (report.Title != request.Title.Trim()
                || report.ExecutiveSummary != request.ExecutiveSummary.Trim()
                || report.DecisionsAgreed != request.DecisionsAgreed.Trim()
                || report.KeyDiscussionPoints != request.KeyDiscussionPoints.Trim()
                || report.StructuredContentJson != request.StructuredContentJson))
        {
            throw new InvalidRequestException(
                "Return the report to review before changing content that has already been approved.");
        }
        if (request.StructuredContentJson is not null)
        {
            try
            {
                using var _ = JsonDocument.Parse(request.StructuredContentJson);
            }
            catch (JsonException)
            {
                throw new InvalidRequestException("Structured report content must be valid JSON.");
            }
        }

        var structuredContentJson = request.StructuredContentJson;
        if (request.ApprovalStatus == ReportApprovalStatus.Rejected)
        {
            if (string.IsNullOrWhiteSpace(request.RejectionReason))
            {
                throw new InvalidRequestException("A rejection reason is required.");
            }

            var content = JsonNode.Parse(structuredContentJson ?? "{}") as JsonObject
                ?? throw new InvalidRequestException(
                    "Structured report content must be a JSON object to record a rejection reason.");
            content["rejectionReason"] = request.RejectionReason.Trim();
            structuredContentJson = content.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        }
        else if (!string.IsNullOrWhiteSpace(structuredContentJson))
        {
            var content = JsonNode.Parse(structuredContentJson);
            if (content is JsonObject structuredObject)
            {
                structuredObject.Remove("rejectionReason");
                structuredContentJson = structuredObject.ToJsonString();
            }
        }

        report.Title = request.Title.Trim();
        report.ExecutiveSummary = request.ExecutiveSummary.Trim();
        report.DecisionsAgreed = request.DecisionsAgreed.Trim();
        report.KeyDiscussionPoints = request.KeyDiscussionPoints.Trim();
        report.StructuredContentJson = structuredContentJson;
        report.ApprovalStatus = request.ApprovalStatus;
        report.ValidatedByEmail = isDecision ? validatorEmail!.Trim() : null;
        report.ValidatedAt = isDecision ? _timeProvider.GetUtcNow() : null;
        if (request.ApprovalStatus == ReportApprovalStatus.Approved)
        {
            report.SharePointPublicationError = null;
        }
        else if (request.ApprovalStatus == ReportApprovalStatus.UnderReview)
        {
            report.SharePointPublicationError = null;
        }
        await _meetings.UpdateMeetingReportAsync(report, cancellationToken);
        return ToReportDetails(report);
    }

    public async Task<IReadOnlyList<DecisionSummary>?> GetDecisionsAsync(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            return null;
        }

        var decisions = await _meetings.GetDecisionsAsync(tenantId, meetingId, cancellationToken);
        return decisions.Select(ToDecisionSummary).ToArray();
    }

    public async Task<DecisionDetails> CreateDecisionAsync(
        Guid meetingId,
        CreateDecisionRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            throw new ResourceNotFoundException("The meeting was not found.");
        }

        if (string.IsNullOrWhiteSpace(request.Text))
        {
            throw new InvalidRequestException("A decision text is required.");
        }

        var decision = new Decision
        {
            TenantId = tenantId,
            MeetingId = meetingId,
            Text = request.Text.Trim(),
            Status = request.Status,
            DecisionType = request.DecisionType,
            ApprovedByName = request.ApprovedByName?.Trim(),
            CreatedAt = _timeProvider.GetUtcNow()
        };

        await _meetings.AddDecisionAsync(decision, cancellationToken);
        return ToDecisionDetails(decision);
    }

    public async Task<DecisionDetails?> UpdateDecisionAsync(
        Guid meetingId,
        Guid decisionId,
        UpdateDecisionRequest request,
        bool isValidator,
        CancellationToken cancellationToken)
    {
        if (!isValidator)
        {
            throw new AccessDeniedException("The ReadMeeting.ReportValidator application role is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Text))
        {
            throw new InvalidRequestException("A decision text is required.");
        }

        var decision = await _meetings.GetDecisionAsync(
            RequireTenantId(),
            meetingId,
            decisionId,
            cancellationToken);
        if (decision is null)
        {
            return null;
        }

        decision.Text = request.Text.Trim();
        decision.Status = request.Status;
        decision.DecisionType = request.DecisionType;
        decision.ApprovedByName = request.ApprovedByName?.Trim();
        await _meetings.UpdateDecisionAsync(decision, cancellationToken);
        return ToDecisionDetails(decision);
    }

    public async Task<IReadOnlyList<ActionItemSummary>?> GetActionItemsAsync(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            return null;
        }

        var actions = await _meetings.GetActionItemsAsync(tenantId, meetingId, cancellationToken);
        return actions.Select(ToActionItemSummary).ToArray();
    }

    public async Task<ActionItemDetails> CreateActionItemAsync(
        Guid meetingId,
        CreateActionItemRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = RequireTenantId();
        if (await _meetings.GetAsync(tenantId, meetingId, cancellationToken) is null)
        {
            throw new ResourceNotFoundException("The meeting was not found.");
        }

        if (request.DecisionId.HasValue
            && !await _meetings.DecisionBelongsToMeetingAsync(
                tenantId,
                meetingId,
                request.DecisionId.Value,
                cancellationToken))
        {
            throw new ResourceNotFoundException("The decision was not found for this meeting.");
        }

        if (string.IsNullOrWhiteSpace(request.Description))
        {
            throw new InvalidRequestException("An action item description is required.");
        }

        var actionItem = new ActionItem
        {
            TenantId = tenantId,
            MeetingId = meetingId,
            DecisionId = request.DecisionId,
            Title = string.IsNullOrWhiteSpace(request.Title) ? null : request.Title.Trim(),
            Description = request.Description.Trim(),
            AssigneeName = request.AssigneeName?.Trim(),
            AssigneeEmail = request.AssigneeEmail?.Trim(),
            DueDate = request.DueDate?.ToUniversalTime(),
            DeadlineText = request.DeadlineText?.Trim() ?? request.DueDate?.ToString("O"),
            Priority = request.Priority,
            Status = request.Status,
            CreatedAt = _timeProvider.GetUtcNow()
        };

        await _meetings.AddActionItemAsync(actionItem, cancellationToken);
        return ToActionItemDetails(actionItem);
    }

    public async Task<ActionItemDetails?> UpdateActionItemAsync(
        Guid meetingId,
        Guid actionItemId,
        UpdateActionItemRequest request,
        bool isValidator,
        CancellationToken cancellationToken)
    {
        if (!isValidator)
        {
            throw new AccessDeniedException("The ReadMeeting.ReportValidator application role is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Description))
        {
            throw new InvalidRequestException("An action item description is required.");
        }

        var actionItem = await _meetings.GetActionItemAsync(
            RequireTenantId(),
            meetingId,
            actionItemId,
            cancellationToken);
        if (actionItem is null)
        {
            return null;
        }

        actionItem.Title = string.IsNullOrWhiteSpace(request.Title) ? null : request.Title.Trim();
        actionItem.Description = request.Description.Trim();
        actionItem.AssigneeName = request.AssigneeName?.Trim();
        actionItem.AssigneeEmail = request.AssigneeEmail?.Trim();
        actionItem.DueDate = request.DueDate?.ToUniversalTime();
        actionItem.DeadlineText = request.DeadlineText?.Trim()
            ?? request.DueDate?.ToString("O");
        actionItem.Priority = request.Priority;
        actionItem.Status = request.Status;
        await _meetings.UpdateActionItemAsync(actionItem, cancellationToken);
        return ToActionItemDetails(actionItem);
    }

    public async Task<MeetingDetails> CreateManualAsync(
        CreateManualMeetingRequest request,
        string? requestId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            throw new InvalidRequestException("A meeting title is required.");
        }

        if (request.StartTime.HasValue
            && request.EndTime.HasValue
            && request.EndTime.Value <= request.StartTime.Value)
        {
            throw new InvalidRequestException("The meeting end time must be later than its start time.");
        }

        var tenantId = RequireTenantId();
        var entraObjectId = _currentTenant.EntraObjectId
            ?? throw new InvalidOperationException("The authenticated user context is missing.");
        var user = await _users.GetOrCreateForAuthenticatedUserAsync(
            tenantId,
            entraObjectId,
            cancellationToken);

        if (!user.IsActive)
        {
            throw new AccessDeniedException("The authenticated user account is inactive.");
        }

        var now = _timeProvider.GetUtcNow();
        var meeting = new Meeting
        {
            TenantId = tenantId,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            StartTime = request.StartTime?.ToUniversalTime(),
            EndTime = request.EndTime?.ToUniversalTime(),
            OrganizerUserId = user.Id,
            OrganizerEmail = request.OrganizerEmail?.Trim(),
            OrganizerName = request.OrganizerName?.Trim(),
            DepartmentCode = request.DepartmentCode?.Trim(),
            Status = MeetingCaptureStatus.Scheduled,
            CreatedAt = now
        };
        var capture = new Capture
        {
            TenantId = tenantId,
            MeetingId = meeting.Id,
            Method = CaptureMethod.ManualImport,
            Status = CaptureStatus.Completed,
            CapturedAt = now,
            CreatedAt = now
        };
        var auditLog = new AuditLog
        {
            TenantId = tenantId,
            UserAccountId = user.Id,
            EntityType = nameof(Meeting),
            EntityId = meeting.Id,
            Action = "MeetingCreated",
            DetailsJson = JsonSerializer.Serialize(new { captureMethod = "ManualImport" }),
            RequestId = requestId,
            CreatedAt = now
        };

        await _meetings.AddManualMeetingAsync(meeting, capture, auditLog, cancellationToken);
        return ToDetails(meeting);
    }

    private Guid RequireTenantId() =>
        _currentTenant.TenantId
        ?? throw new InvalidOperationException("The authenticated tenant context is missing.");

    private static MeetingSummary ToSummary(Meeting meeting) => new(
        meeting.Id,
        meeting.Title,
        meeting.StartTime,
        meeting.EndTime,
        meeting.OrganizerName,
        meeting.Status);

    private static MeetingDetails ToDetails(Meeting meeting) => new(
        meeting.Id,
        meeting.Title,
        meeting.Description,
        meeting.StartTime,
        meeting.EndTime,
        meeting.OrganizerEmail,
        meeting.OrganizerName,
        meeting.DepartmentCode,
        meeting.JoinWebUrl,
        meeting.Status,
        meeting.CreatedAt);

    private static MeetingReportDetails ToReportDetails(MeetingReport report) => new(
        report.Id,
        report.MeetingId,
        report.Title,
        report.ReferenceNumber,
        report.ExecutiveSummary,
        report.DecisionsAgreed,
        report.KeyDiscussionPoints,
        report.SharePointDocxUrl,
        report.SharePointFileId,
        report.ApprovalStatus,
        report.ValidatedByEmail,
        report.GeneratedAt,
        report.StructuredContentJson,
        GetRejectionReason(report.StructuredContentJson),
        report.SharePointDriveId,
        report.SharePointFolderId,
        report.SharePointVersion,
        report.SharePointPublishedAt,
        report.SharePointPublishedBy,
        report.SharePointPublicationError);

    private static string? GetRejectionReason(string? structuredContentJson)
    {
        if (string.IsNullOrWhiteSpace(structuredContentJson))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(structuredContentJson);
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("rejectionReason", out var reason)
                && reason.ValueKind == JsonValueKind.String
                    ? reason.GetString()
                    : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static DecisionSummary ToDecisionSummary(Decision decision) => new(
        decision.Id,
        decision.Text,
        decision.Status,
        decision.DecisionType,
        decision.ApprovedByName,
        decision.CreatedAt);

    private static DecisionDetails ToDecisionDetails(Decision decision) => new(
        decision.Id,
        decision.MeetingId,
        decision.Text,
        decision.Status,
        decision.DecisionType,
        decision.ApprovedByName,
        decision.CreatedAt);

    private static ActionItemSummary ToActionItemSummary(ActionItem actionItem) => new(
        actionItem.Id,
        actionItem.MeetingId,
        actionItem.Title,
        actionItem.Description,
        actionItem.AssigneeName,
        actionItem.AssigneeEmail,
        actionItem.DueDate,
        actionItem.DeadlineText,
        actionItem.Priority,
        actionItem.Status,
        actionItem.CreatedAt);

    private static ActionItemDetails ToActionItemDetails(ActionItem actionItem) => new(
        actionItem.Id,
        actionItem.MeetingId,
        actionItem.DecisionId,
        actionItem.Title,
        actionItem.Description,
        actionItem.AssigneeName,
        actionItem.AssigneeEmail,
        actionItem.DueDate,
        actionItem.DeadlineText,
        actionItem.Priority,
        actionItem.Status,
        actionItem.CreatedAt);

    private static TranscriptDetails ToTranscriptDetails(Transcript transcript)
    {
        var revision = transcript.Revisions
            .OrderByDescending(item => item.RevisionNumber)
            .FirstOrDefault();
        return new TranscriptDetails(
            transcript.Id,
            transcript.MeetingId,
            transcript.ContentFormat,
            transcript.Status,
            transcript.Language,
            revision?.RawContent,
            revision?.RawSha256,
            transcript.RetrievedAt ?? revision?.RetrievedAt ?? transcript.CreatedAt);
    }

    private static ProcessingRunDetails ToProcessingRunDetails(ProcessingRun run) => new(
        run.Id,
        run.MeetingId,
        run.TranscriptId,
        run.Status,
        run.AttemptCount,
        run.CreatedAt,
        run.StartedAt,
        run.CompletedAt,
        run.ModelUsed,
        run.ErrorMessage,
        run.AnalysisJson);
}
