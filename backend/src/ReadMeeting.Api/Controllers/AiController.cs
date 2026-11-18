using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Configuration;
using System.ComponentModel.DataAnnotations;
using ReadMeeting.Infrastructure.Ai;

namespace ReadMeeting.Api.Controllers;

[ApiController]
[Authorize(Policy = "ApiUser")]
[Route("api/v1/ai")]
public sealed class AiController(
    GeminiMeetingProcessor processor,
    IConfiguration configuration,
    HealthCheckService healthChecks) : ControllerBase
{
    [HttpGet("status")]
    public async Task<ActionResult<AiStatusResponse>> GetStatus(CancellationToken cancellationToken)
    {
        var persistenceConfigured = !string.IsNullOrWhiteSpace(
            configuration.GetConnectionString("DefaultConnection"));
        var healthReport = await healthChecks.CheckHealthAsync(
            check => check.Tags.Contains("ready"),
            cancellationToken);
        var persistenceAvailable = persistenceConfigured
            && healthReport.Entries.TryGetValue("postgresql", out var check)
            && check.Status == Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Healthy;

        return Ok(new AiStatusResponse(
            processor.IsConfigured,
            persistenceConfigured,
            processor.ConfiguredModel,
            persistenceAvailable));
    }

    [HttpPost("analyze-transcript")]
    [RequestSizeLimit(1_048_576)]
    [ProducesResponseType<TranscriptAnalysisPreview>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<TranscriptAnalysisPreview>> AnalyzeTranscript(
        [FromBody] AnalyzeTranscriptRequest request,
        CancellationToken cancellationToken)
    {
        if (!processor.IsConfigured)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Moteur IA non configuré",
                detail: "Le fournisseur Gemini doit être configuré dans l'environnement serveur de l'API.");
        }

        if (string.IsNullOrWhiteSpace(request.GraphMeetingId)
            || request.GraphMeetingId.Length > 512
            || string.IsNullOrWhiteSpace(request.GraphTranscriptId)
            || request.GraphTranscriptId.Length > 512
            || string.IsNullOrWhiteSpace(request.Content)
            || request.Content.Length > 120_000)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Transcription invalide",
                Detail = "Les identifiants Graph et une transcription non vide de 120 000 caractères maximum sont requis.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var analysis = await processor.AnalyzeTranscriptAsync(request.Content, cancellationToken);
        return Ok(new TranscriptAnalysisPreview(
            MeetingId: request.GraphMeetingId,
            TranscriptId: request.GraphTranscriptId,
            AiConfigured: true,
            Persisted: false,
            ModelUsed: processor.LastSuccessfulModel ?? processor.ConfiguredModel!,
            Analysis: analysis));
    }

    [HttpPost("chat")]
    [RequestSizeLimit(1_048_576)]
    [ProducesResponseType<TranscriptChatResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<TranscriptChatResponse>> Chat(
        [FromBody] TranscriptChatRequest request,
        CancellationToken cancellationToken)
    {
        if (!processor.IsConfigured)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Moteur IA non configuré",
                detail: "Le fournisseur Gemini doit être configuré dans l'environnement serveur de l'API.");
        }

        if (string.IsNullOrWhiteSpace(request.GraphMeetingId)
            || request.GraphMeetingId.Length > 512
            || string.IsNullOrWhiteSpace(request.GraphTranscriptId)
            || request.GraphTranscriptId.Length > 512
            || string.IsNullOrWhiteSpace(request.Content)
            || request.Content.Length > 120_000
            || string.IsNullOrWhiteSpace(request.Question)
            || request.Question.Length > 4_000
            || request.History.Count > 12
            || request.History.Any(turn =>
                (turn.Role != "user" && turn.Role != "assistant")
                || string.IsNullOrWhiteSpace(turn.Content)
                || turn.Content.Length > 3_000))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Demande conversationnelle invalide",
                Detail = "Vérifiez les identifiants, la transcription, la question et les 12 derniers tours maximum.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var answer = await processor.AnswerTranscriptQuestionAsync(
            request.Content,
            request.Question,
            request.History.Select(turn =>
                new GeminiMeetingProcessor.TranscriptConversationTurn(turn.Role, turn.Content)).ToArray(),
            cancellationToken);
        return Ok(new TranscriptChatResponse(
            request.GraphMeetingId,
            request.GraphTranscriptId,
            processor.LastSuccessfulModel ?? processor.ConfiguredModel!,
            answer.Answer,
            answer.Answerable,
            answer.Citations));
    }
}

public sealed record AiStatusResponse(
    bool Configured,
    bool PersistenceConfigured,
    string? Model,
    bool PersistenceAvailable);
public sealed record AnalyzeTranscriptRequest(
    [property: Required, StringLength(512)] string GraphMeetingId,
    [property: Required, StringLength(512)] string GraphTranscriptId,
    [property: Required, StringLength(120_000)] string Content);
public sealed record TranscriptAnalysisPreview(
    string MeetingId,
    string TranscriptId,
    bool AiConfigured,
    bool Persisted,
    string ModelUsed,
    GeminiMeetingProcessor.MeetingAnalysis Analysis);
public sealed record TranscriptChatTurnRequest(
    [property: Required, StringLength(3_000)] string Role,
    [property: Required, StringLength(3_000)] string Content);
public sealed record TranscriptChatRequest(
    [property: Required, StringLength(512)] string GraphMeetingId,
    [property: Required, StringLength(512)] string GraphTranscriptId,
    [property: Required, StringLength(120_000)] string Content,
    [property: Required, StringLength(4_000)] string Question,
    [property: Required] IReadOnlyList<TranscriptChatTurnRequest> History);
public sealed record TranscriptChatResponse(
    string MeetingId,
    string TranscriptId,
    string ModelUsed,
    string Answer,
    bool Answerable,
    IReadOnlyList<GeminiMeetingProcessor.EvidenceClaim> Citations);
