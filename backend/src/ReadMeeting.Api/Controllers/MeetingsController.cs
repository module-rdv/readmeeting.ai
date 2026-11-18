using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using ReadMeeting.Application.Meetings;
using ReadMeeting.Infrastructure.Ai;

namespace ReadMeeting.Api.Controllers;

[ApiController]
[Authorize(Policy = "ApiUser")]
[Route("api/v1/meetings")]
public sealed class MeetingsController(
    MeetingService meetings,
    GeminiMeetingProcessor processor,
    ISharePointPublishingService sharePoint) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<MeetingSummary>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<MeetingSummary>>> List(
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        CancellationToken cancellationToken)
    {
        var result = await meetings.ListAsync(from, to, cancellationToken);
        return Ok(result);
    }

    [HttpGet("/api/v1/dashboard")]
    [ProducesResponseType<MeetingDashboardSummary>(StatusCodes.Status200OK)]
    public async Task<ActionResult<MeetingDashboardSummary>> GetDashboard(
        CancellationToken cancellationToken) =>
        Ok(await meetings.GetDashboardAsync(cancellationToken));

    [HttpGet("{meetingId:guid}")]
    [ProducesResponseType<MeetingDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MeetingDetails>> Get(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetAsync(meetingId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    [ProducesResponseType<MeetingDetails>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<MeetingDetails>> CreateManual(
        [FromBody] CreateManualMeetingRequest request,
        CancellationToken cancellationToken)
    {
        var result = await meetings.CreateManualAsync(
            request,
            HttpContext.TraceIdentifier,
            cancellationToken);
        return CreatedAtAction(nameof(Get), new { meetingId = result.Id }, result);
    }

    [HttpGet("{meetingId:guid}/transcripts")]
    [ProducesResponseType<IReadOnlyList<TranscriptSummary>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<TranscriptSummary>>> GetTranscripts(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetTranscriptsAsync(meetingId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("{meetingId:guid}/transcript")]
    [ProducesResponseType<TranscriptDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TranscriptDetails>> GetTranscript(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetTranscriptAsync(meetingId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("{meetingId:guid}/transcripts/{transcriptId:guid}")]
    [ProducesResponseType<TranscriptDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TranscriptDetails>> GetTranscript(
        Guid meetingId,
        Guid transcriptId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetTranscriptAsync(meetingId, transcriptId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{meetingId:guid}/transcript")]
    [ProducesResponseType<TranscriptDetails>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TranscriptDetails>> CreateTranscript(
        Guid meetingId,
        [FromBody] CreateTranscriptRequest request,
        CancellationToken cancellationToken)
    {
        var result = await meetings.CreateTranscriptAsync(meetingId, request, cancellationToken);
        return CreatedAtAction(
            nameof(GetTranscript),
            new { meetingId },
            result);
    }

    [HttpPost("teams-transcript-analysis")]
    [ProducesResponseType<TeamsTranscriptAnalysisResult>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TeamsTranscriptAnalysisResult>> AnalyzeTeamsTranscript(
        [FromBody] ImportTeamsTranscriptRequest request,
        CancellationToken cancellationToken)
    {
        var imported = await meetings.ImportTeamsTranscriptAsync(request, cancellationToken);
        if (!processor.IsConfigured)
        {
            return Ok(new TeamsTranscriptAnalysisResult(
                imported.Meeting.Id,
                imported.Transcript.Id,
                AiConfigured: false,
                ProcessingRun: null));
        }

        var queuedRun = await meetings.CreateProcessingRunAsync(
            imported.Meeting.Id,
            new CreateProcessingRunRequest { TranscriptId = imported.Transcript.Id },
            cancellationToken);
        var result = await meetings.GetProcessingRunAsync(queuedRun.Id, cancellationToken)
            ?? throw new InvalidOperationException("The newly created processing run could not be retrieved.");
        return Ok(new TeamsTranscriptAnalysisResult(
            imported.Meeting.Id,
            imported.Transcript.Id,
            AiConfigured: true,
            ProcessingRun: result));
    }

    [HttpGet("{meetingId:guid}/processing-runs")]
    [ProducesResponseType<IReadOnlyList<ProcessingRunSummary>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<ProcessingRunSummary>>> GetProcessingRuns(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetProcessingRunsAsync(meetingId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{meetingId:guid}/processing-runs")]
    [ProducesResponseType<ProcessingRunDetails>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProcessingRunDetails>> CreateProcessingRun(
        Guid meetingId,
        [FromBody] CreateProcessingRunRequest request,
        CancellationToken cancellationToken)
    {
        if (!processor.IsConfigured)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Moteur IA non configuré",
                detail: "Le fournisseur Gemini doit être configuré dans l'environnement serveur de l'API.");
        }

        var queuedRun = await meetings.CreateProcessingRunAsync(meetingId, request, cancellationToken);
        var result = await meetings.GetProcessingRunAsync(queuedRun.Id, cancellationToken)
            ?? throw new InvalidOperationException("The newly created processing run could not be retrieved.");
        return CreatedAtAction(
            nameof(ProcessingRunsController.Get),
            "ProcessingRuns",
            new { processingRunId = result.Id },
            result);
    }

    [HttpGet("{meetingId:guid}/reports")]
    [ProducesResponseType<IReadOnlyList<MeetingReportSummary>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<MeetingReportSummary>>> GetReports(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetReportsAsync(meetingId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("{meetingId:guid}/reports/{reportId:guid}")]
    [ProducesResponseType<MeetingReportDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MeetingReportDetails>> GetReport(
        Guid meetingId,
        Guid reportId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetReportAsync(meetingId, reportId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{meetingId:guid}/reports")]
    [ProducesResponseType<MeetingReportDetails>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MeetingReportDetails>> CreateReport(
        Guid meetingId,
        [FromBody] CreateMeetingReportRequest request,
        CancellationToken cancellationToken)
    {
        var result = await meetings.CreateReportAsync(meetingId, request, cancellationToken);
        return CreatedAtAction(nameof(GetReports), new { meetingId }, result);
    }

    [HttpPut("{meetingId:guid}/reports/{reportId:guid}")]
    [ProducesResponseType<MeetingReportDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MeetingReportDetails>> UpdateReport(
        Guid meetingId,
        Guid reportId,
        [FromBody] UpdateMeetingReportRequest request,
        CancellationToken cancellationToken)
    {
        var email = User.FindFirst("email")?.Value
            ?? User.FindFirst("preferred_username")?.Value;
        var result = await meetings.UpdateReportAsync(
            meetingId,
            reportId,
            request,
            email,
            IsReportValidator,
            cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{meetingId:guid}/reports/{reportId:guid}/publish")]
    [ProducesResponseType<SharePointPublicationResult>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SharePointPublicationResult>> PublishReport(
        Guid meetingId,
        Guid reportId,
        [FromBody] PublishMeetingReportRequest request,
        CancellationToken cancellationToken)
    {
        if (!IsReportValidator)
        {
            return Forbid();
        }

        var email = User.FindFirst("email")?.Value
            ?? User.FindFirst("preferred_username")?.Value;
        var result = await sharePoint.PublishReportAsync(
            meetingId,
            reportId,
            request,
            email ?? string.Empty,
            cancellationToken);
        return Ok(result);
    }

    [HttpGet("{meetingId:guid}/decisions")]
    [ProducesResponseType<IReadOnlyList<DecisionSummary>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<DecisionSummary>>> GetDecisions(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetDecisionsAsync(meetingId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{meetingId:guid}/decisions")]
    [ProducesResponseType<DecisionDetails>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DecisionDetails>> CreateDecision(
        Guid meetingId,
        [FromBody] CreateDecisionRequest request,
        CancellationToken cancellationToken)
    {
        var result = await meetings.CreateDecisionAsync(meetingId, request, cancellationToken);
        return CreatedAtAction(nameof(GetDecisions), new { meetingId }, result);
    }

    [HttpPut("{meetingId:guid}/decisions/{decisionId:guid}")]
    [ProducesResponseType<DecisionDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DecisionDetails>> UpdateDecision(
        Guid meetingId,
        Guid decisionId,
        [FromBody] UpdateDecisionRequest request,
        CancellationToken cancellationToken)
    {
        var result = await meetings.UpdateDecisionAsync(
            meetingId,
            decisionId,
            request,
            IsReportValidator,
            cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("{meetingId:guid}/actions")]
    [ProducesResponseType<IReadOnlyList<ActionItemSummary>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<ActionItemSummary>>> GetActionItems(
        Guid meetingId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetActionItemsAsync(meetingId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("{meetingId:guid}/actions")]
    [ProducesResponseType<ActionItemDetails>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ActionItemDetails>> CreateActionItem(
        Guid meetingId,
        [FromBody] CreateActionItemRequest request,
        CancellationToken cancellationToken)
    {
        var result = await meetings.CreateActionItemAsync(meetingId, request, cancellationToken);
        return CreatedAtAction(nameof(GetActionItems), new { meetingId }, result);
    }

    [HttpPut("{meetingId:guid}/actions/{actionItemId:guid}")]
    [ProducesResponseType<ActionItemDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ActionItemDetails>> UpdateActionItem(
        Guid meetingId,
        Guid actionItemId,
        [FromBody] UpdateActionItemRequest request,
        CancellationToken cancellationToken)
    {
        var result = await meetings.UpdateActionItemAsync(
            meetingId,
            actionItemId,
            request,
            IsReportValidator,
            cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    private bool IsReportValidator =>
        User.HasClaim("roles", "ReadMeeting.ReportValidator")
        || User.HasClaim(ClaimTypes.Role, "ReadMeeting.ReportValidator");
}
