namespace ReadMeeting.Application.Meetings;

public interface ISharePointPublishingService
{
    Task<IReadOnlyList<SharePointSite>> SearchSitesAsync(
        string search,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<SharePointDrive>> GetDrivesAsync(
        string siteId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<SharePointFolder>> GetFoldersAsync(
        string driveId,
        string? parentFolderId,
        CancellationToken cancellationToken);

    Task<SharePointPublicationResult> PublishReportAsync(
        Guid meetingId,
        Guid reportId,
        PublishMeetingReportRequest request,
        string actorEmail,
        CancellationToken cancellationToken);
}
