using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ReadMeeting.Application.Meetings;

namespace ReadMeeting.Api.Controllers;

[ApiController]
[Authorize(Policy = "ApiUser")]
[Route("api/v1/processing-runs")]
public sealed class ProcessingRunsController(MeetingService meetings) : ControllerBase
{
    [HttpGet("{processingRunId:guid}")]
    [ProducesResponseType<ProcessingRunDetails>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProcessingRunDetails>> Get(
        Guid processingRunId,
        CancellationToken cancellationToken)
    {
        var result = await meetings.GetProcessingRunAsync(processingRunId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
