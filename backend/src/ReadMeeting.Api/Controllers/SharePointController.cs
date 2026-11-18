using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ReadMeeting.Application.Meetings;

namespace ReadMeeting.Api.Controllers;

[ApiController]
[Authorize(Policy = "ApiUser")]
[Route("api/v1/sharepoint")]
public sealed class SharePointController(ISharePointPublishingService sharePoint) : ControllerBase
{
    [HttpGet("sites")]
    [ProducesResponseType<IReadOnlyList<SharePointSite>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<SharePointSite>>> SearchSites(
        [FromQuery] string search,
        CancellationToken cancellationToken) =>
        Ok(await sharePoint.SearchSitesAsync(search, cancellationToken));

    [HttpGet("sites/{siteId}/drives")]
    [ProducesResponseType<IReadOnlyList<SharePointDrive>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<SharePointDrive>>> GetDrives(
        string siteId,
        CancellationToken cancellationToken) =>
        Ok(await sharePoint.GetDrivesAsync(siteId, cancellationToken));

    [HttpGet("drives/{driveId}/folders")]
    [ProducesResponseType<IReadOnlyList<SharePointFolder>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<SharePointFolder>>> GetFolders(
        string driveId,
        [FromQuery] string? parentFolderId,
        CancellationToken cancellationToken) =>
        Ok(await sharePoint.GetFoldersAsync(driveId, parentFolderId, cancellationToken));
}
