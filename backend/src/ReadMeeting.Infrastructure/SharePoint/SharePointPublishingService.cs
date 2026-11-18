using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using ReadMeeting.Application.Interfaces;
using ReadMeeting.Application.Meetings;
using ReadMeeting.Application.Security;
using ReadMeeting.Domain.Entities;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Infrastructure.SharePoint;

public sealed class SharePointPublishingService(
    HttpClient httpClient,
    IGraphOnBehalfOfTokenProvider tokenProvider,
    ReadMeetingDbContext dbContext,
    ICurrentTenantAccessor currentTenant,
    IConfiguration configuration,
    TimeProvider timeProvider,
    ILogger<SharePointPublishingService> logger) : ISharePointPublishingService
{
    private const int MaximumSimpleUploadBytes = 4_000_000;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<SharePointSite>> SearchSitesAsync(
        string search,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(search))
        {
            throw new InvalidRequestException("A site search term is required.");
        }

        var token = await AcquireTokenAsync();
        var url = GraphUri($"sites?search={Uri.EscapeDataString(search.Trim())}&$select=id,name,webUrl");
        var items = await GetCollectionAsync(url, token, cancellationToken);
        return items.Select(item => new SharePointSite(
            GetString(item, "id") ?? string.Empty,
            GetString(item, "name") ?? string.Empty,
            GetString(item, "webUrl"))).Where(item => !string.IsNullOrWhiteSpace(item.Id)).ToArray();
    }

    public async Task<IReadOnlyList<SharePointDrive>> GetDrivesAsync(
        string siteId,
        CancellationToken cancellationToken)
    {
        var resolvedSiteId = ResolveConfiguredValue(siteId, "SiteId");
        var token = await AcquireTokenAsync();
        var url = GraphUri($"sites/{Uri.EscapeDataString(resolvedSiteId)}/drives?$select=id,name,driveType");
        var items = await GetCollectionAsync(url, token, cancellationToken);
        return items.Select(item => new SharePointDrive(
            GetString(item, "id") ?? string.Empty,
            GetString(item, "name") ?? string.Empty,
            GetString(item, "driveType"))).Where(item => !string.IsNullOrWhiteSpace(item.Id)).ToArray();
    }

    public async Task<IReadOnlyList<SharePointFolder>> GetFoldersAsync(
        string driveId,
        string? parentFolderId,
        CancellationToken cancellationToken)
    {
        var resolvedDriveId = ResolveConfiguredValue(driveId, "DriveId");
        var resolvedParentId = string.IsNullOrWhiteSpace(parentFolderId)
            ? configuration["Graph:SharePoint:DestinationFolderId"] ?? "root"
            : parentFolderId.Trim();
        var token = await AcquireTokenAsync();
        var parentRoute = resolvedParentId.Equals("root", StringComparison.OrdinalIgnoreCase)
            ? $"drives/{Uri.EscapeDataString(resolvedDriveId)}/root"
            : $"drives/{Uri.EscapeDataString(resolvedDriveId)}/items/{Uri.EscapeDataString(resolvedParentId)}";
        var parent = await GetJsonAsync(GraphUri($"{parentRoute}?$select=id,folder,parentReference"), token, cancellationToken);
        if (!parent.RootElement.TryGetProperty("folder", out _))
        {
            throw new InvalidRequestException("The selected SharePoint destination is not a folder.");
        }

        var children = await GetCollectionAsync(
            GraphUri($"{parentRoute}/children?$select=id,name,folder,webUrl&$top=200"),
            token,
            cancellationToken);
        return children
            .Where(item => item.TryGetProperty("folder", out _))
            .Select(item => new SharePointFolder(
                GetString(item, "id") ?? string.Empty,
                GetString(item, "name") ?? string.Empty,
                GetString(item, "webUrl")))
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .ToArray();
    }

    public async Task<SharePointPublicationResult> PublishReportAsync(
        Guid meetingId,
        Guid reportId,
        PublishMeetingReportRequest request,
        string actorEmail,
        CancellationToken cancellationToken)
    {
        var tenantId = currentTenant.TenantId
            ?? throw new InvalidOperationException("The authenticated tenant context is missing.");
        if (string.IsNullOrWhiteSpace(actorEmail))
        {
            throw new AccessDeniedException("The authenticated validator email is required to publish a report.");
        }

        var report = await dbContext.MeetingReports
            .Include(item => item.Meeting)
            .SingleOrDefaultAsync(
                item => item.TenantId == tenantId
                    && item.MeetingId == meetingId
                    && item.Id == reportId,
                cancellationToken);
        if (report is null)
        {
            throw new ResourceNotFoundException("The meeting report was not found.");
        }

        if (report.ApprovalStatus is not ReportApprovalStatus.Approved
            and not ReportApprovalStatus.PublicationFailed)
        {
            throw new InvalidRequestException("Only an approved report can be published or retried.");
        }

        var siteId = request.SiteId?.Trim() ?? configuration["Graph:SharePoint:SiteId"] ?? string.Empty;
        var driveId = request.DriveId?.Trim() ?? configuration["Graph:SharePoint:DriveId"] ?? string.Empty;
        var folderId = request.FolderId?.Trim()
            ?? configuration["Graph:SharePoint:DestinationFolderId"]
            ?? string.Empty;

        report.ApprovalStatus = ReportApprovalStatus.Publishing;
        report.SharePointPublicationError = null;
        dbContext.AuditLogs.Add(CreateAuditLog(
            tenantId,
            reportId,
            "SharePointPublicationStarted",
            actorEmail,
            new { siteId, driveId, folderId }));
        await dbContext.SaveChangesAsync(cancellationToken);

        try
        {
            siteId = ResolveConfiguredValue(request.SiteId, "SiteId");
            driveId = ResolveConfiguredValue(request.DriveId, "DriveId");
            folderId = ResolveConfiguredValue(request.FolderId, "DestinationFolderId");
            var token = await AcquireTokenAsync();
            await ValidateDriveAndFolderAsync(siteId, driveId, folderId, token, cancellationToken);

            var fileName = CreateFileName(report);
            var document = DocxReportGenerator.Generate(report, report.Meeting);
            if (document.Length > MaximumSimpleUploadBytes)
            {
                throw new InvalidRequestException(
                    "The generated report exceeds the Microsoft Graph simple-upload limit.");
            }

            var uploadRoute = folderId.Equals("root", StringComparison.OrdinalIgnoreCase)
                ? $"drives/{Uri.EscapeDataString(driveId)}/root:/{Uri.EscapeDataString(fileName)}:/content"
                : $"drives/{Uri.EscapeDataString(driveId)}/items/{Uri.EscapeDataString(folderId)}:/{Uri.EscapeDataString(fileName)}:/content";
            var item = await PutFileAsync(
                GraphUri($"{uploadRoute}?@microsoft.graph.conflictBehavior=replace"),
                token,
                document,
                cancellationToken);

            var fileId = GetString(item.RootElement, "id");
            var webUrl = GetString(item.RootElement, "webUrl");
            if (string.IsNullOrWhiteSpace(fileId)
                || !Uri.TryCreate(webUrl, UriKind.Absolute, out var documentUri)
                || documentUri.Scheme != Uri.UriSchemeHttps)
            {
                throw new SharePointGraphException(
                    "Microsoft Graph did not confirm the uploaded file with a valid ID and HTTPS URL.",
                    (int)HttpStatusCode.BadGateway,
                    "InvalidDriveItemResponse");
            }

            var publishedAt = timeProvider.GetUtcNow();
            var version = GetString(item.RootElement, "eTag") ?? GetString(item.RootElement, "cTag");
            report.SharePointDocxUrl = webUrl;
            report.SharePointFileId = fileId;
            report.SharePointDriveId = driveId;
            report.SharePointFolderId = folderId;
            report.SharePointVersion = version;
            report.SharePointPublishedAt = publishedAt;
            report.SharePointPublishedBy = actorEmail.Trim();
            report.SharePointPublicationError = null;
            report.ApprovalStatus = ReportApprovalStatus.Published;
            dbContext.AuditLogs.Add(CreateAuditLog(
                tenantId,
                reportId,
                "SharePointPublicationConfirmed",
                actorEmail,
                new { siteId, driveId, folderId, fileId, fileName, webUrl, version }));
            await dbContext.SaveChangesAsync(cancellationToken);

            return new SharePointPublicationResult(
                reportId,
                fileName,
                fileId,
                webUrl,
                driveId,
                folderId,
                version,
                publishedAt);
        }
        catch (Exception exception)
        {
            var safeMessage = exception switch
            {
                SharePointConfigurationException => exception.Message,
                SharePointGraphException => exception.Message,
                InvalidRequestException => exception.Message,
                AccessDeniedException => exception.Message,
                OperationCanceledException => "The SharePoint publication was cancelled before it could be confirmed.",
                _ => "The SharePoint publication could not be completed. The report remains unpublished."
            };
            report.ApprovalStatus = ReportApprovalStatus.PublicationFailed;
            report.SharePointPublicationError = safeMessage.Length <= 4000 ? safeMessage : safeMessage[..4000];
            dbContext.AuditLogs.Add(CreateAuditLog(
                tenantId,
                reportId,
                "SharePointPublicationFailed",
                actorEmail,
                new { siteId, driveId, folderId, message = report.SharePointPublicationError }));

            try
            {
                await dbContext.SaveChangesAsync(CancellationToken.None);
            }
            catch (Exception persistenceException)
            {
                logger.LogError(
                    "SharePoint publication failure state could not be persisted. Report {ReportId}; exception type {ExceptionType}.",
                    reportId,
                    persistenceException.GetType().Name);
                throw new SharePointGraphException(
                    "The report was not marked as published, but the API could not persist the publication failure state. Retry only after checking the report status.",
                    (int)HttpStatusCode.ServiceUnavailable,
                    "PublicationStateNotPersisted");
            }

            if (exception is SharePointConfigurationException
                or SharePointGraphException
                or InvalidRequestException
                or AccessDeniedException
                or OperationCanceledException)
            {
                throw;
            }

            logger.LogError(
                "SharePoint publication failed for report {ReportId}. Exception type: {ExceptionType}.",
                reportId,
                exception.GetType().Name);
            throw new SharePointGraphException(safeMessage, null, "PublicationFailed");
        }
    }

    private async Task ValidateDriveAndFolderAsync(
        string siteId,
        string driveId,
        string folderId,
        string token,
        CancellationToken cancellationToken)
    {
        var drives = await GetCollectionAsync(
            GraphUri($"sites/{Uri.EscapeDataString(siteId)}/drives?$select=id"),
            token,
            cancellationToken);
        if (!drives.Any(drive => string.Equals(
                GetString(drive, "id"),
                driveId,
                StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidRequestException("The selected document library is not available in the configured SharePoint site.");
        }

        var folderRoute = folderId.Equals("root", StringComparison.OrdinalIgnoreCase)
            ? $"drives/{Uri.EscapeDataString(driveId)}/root"
            : $"drives/{Uri.EscapeDataString(driveId)}/items/{Uri.EscapeDataString(folderId)}";
        var folder = await GetJsonAsync(
            GraphUri($"{folderRoute}?$select=id,folder,parentReference"),
            token,
            cancellationToken);
        if (!folder.RootElement.TryGetProperty("folder", out _))
        {
            throw new InvalidRequestException("The selected SharePoint destination is not an accessible folder.");
        }
    }

    private async Task<string> AcquireTokenAsync()
    {
        var scopes = configuration.GetSection("Graph:Scopes").Get<string[]>()?
            .Where(scope => !string.IsNullOrWhiteSpace(scope))
            .ToArray() ?? [];
        var hasClientSecret = !string.IsNullOrWhiteSpace(configuration["AzureAd:ClientSecret"]);
        var hasClientCertificate = configuration.GetSection("AzureAd:ClientCertificates").GetChildren().Any();
        var missing = new List<string>();
        if (scopes.Length == 0) missing.Add("Graph:Scopes");
        if (!hasClientSecret && !hasClientCertificate)
        {
            missing.Add("AzureAd:ClientSecret or AzureAd:ClientCertificates");
        }

        if (missing.Count > 0)
        {
            throw new SharePointConfigurationException(
                $"SharePoint publication requires administrator-provided configuration: {string.Join(", ", missing)}. Configure secrets outside appsettings.json.");
        }

        try
        {
            return await tokenProvider.AcquireAccessTokenAsync();
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            throw new SharePointConfigurationException(
                "A delegated Microsoft Graph token could not be acquired. Verify the OBO application credential, Graph scopes, consent, and current user session.");
        }
    }

    private async Task<IReadOnlyList<JsonElement>> GetCollectionAsync(
        Uri firstPage,
        string token,
        CancellationToken cancellationToken)
    {
        var items = new List<JsonElement>();
        var visited = new HashSet<string>(StringComparer.Ordinal);
        Uri? nextPage = firstPage;
        while (nextPage is not null)
        {
            if (!visited.Add(nextPage.AbsoluteUri))
            {
                throw new SharePointGraphException(
                    "Microsoft Graph returned a repeated pagination link.",
                    (int)HttpStatusCode.BadGateway,
                    "RepeatedNextLink");
            }

            using var response = await SendAsync(HttpMethod.Get, nextPage, token, null, cancellationToken);
            using var document = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken),
                cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("value", out var value)
                || value.ValueKind != JsonValueKind.Array)
            {
                throw new SharePointGraphException(
                    "Microsoft Graph returned an invalid collection response.",
                    (int)HttpStatusCode.BadGateway,
                    "InvalidCollectionResponse");
            }

            items.AddRange(value.EnumerateArray().Select(item => item.Clone()));
            var link = GetString(document.RootElement, "@odata.nextLink");
            nextPage = string.IsNullOrWhiteSpace(link) ? null : ValidateNextLink(link);
        }

        return items;
    }

    private async Task<JsonDocument> GetJsonAsync(Uri uri, string token, CancellationToken cancellationToken)
    {
        using var response = await SendAsync(HttpMethod.Get, uri, token, null, cancellationToken);
        return await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
    }

    private async Task<JsonDocument> PutFileAsync(
        Uri uri,
        string token,
        byte[] content,
        CancellationToken cancellationToken)
    {
        using var fileContent = new ByteArrayContent(content);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        using var response = await SendAsync(HttpMethod.Put, uri, token, fileContent, cancellationToken);
        return await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        Uri uri,
        string token,
        HttpContent? content,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, uri)
        {
            Content = content
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (HttpRequestException)
        {
            throw new SharePointGraphException(
                "Microsoft Graph could not be reached. The report remains unpublished.",
                null,
                "GraphNetworkError");
        }

        if (response.IsSuccessStatusCode) return response;

        var errorCode = await ReadGraphErrorCodeAsync(response, cancellationToken);
        var retryAfter = response.Headers.RetryAfter?.Delta is { } delay
            ? (int?)Math.Max(1, delay.TotalSeconds)
            : response.Headers.RetryAfter?.Date is { } retryDate
                ? (int?)Math.Max(1, (retryDate - DateTimeOffset.UtcNow).TotalSeconds)
                : null;
        var status = (int)response.StatusCode;
        var message = response.StatusCode switch
        {
            HttpStatusCode.Unauthorized => "Microsoft Graph rejected the delegated token. Renew the session and verify OBO configuration.",
            HttpStatusCode.Forbidden => "Microsoft Graph denied access. Verify delegated Graph permissions, admin consent, and access to the selected SharePoint resources.",
            HttpStatusCode.NotFound => "The selected SharePoint site, library, folder, or report file was not found or is not accessible.",
            (HttpStatusCode)429 => $"Microsoft Graph throttled the SharePoint request. Wait {retryAfter ?? 10} seconds before retrying.",
            _ when status >= 500 => "Microsoft Graph is temporarily unavailable. The report remains unpublished.",
            _ => $"Microsoft Graph rejected the SharePoint request (HTTP {status})."
        };
        response.Dispose();
        throw new SharePointGraphException(message, status, errorCode, retryAfter);
    }

    private async Task<string?> ReadGraphErrorCodeAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        try
        {
            using var body = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken),
                cancellationToken: cancellationToken);
            return body.RootElement.TryGetProperty("error", out var error)
                ? GetString(error, "code")
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private Uri GraphUri(string route)
    {
        var configuredBase = configuration["Graph:BaseUrl"] ?? "https://graph.microsoft.com/v1.0";
        if (!Uri.TryCreate(configuredBase, UriKind.Absolute, out var graphBase)
            || graphBase.Scheme != Uri.UriSchemeHttps
            || !IsMicrosoftGraphHost(graphBase.Host)
            || !string.IsNullOrEmpty(graphBase.UserInfo)
            || !string.IsNullOrEmpty(graphBase.Query)
            || !string.IsNullOrEmpty(graphBase.Fragment))
        {
            throw new SharePointConfigurationException(
                "Graph:BaseUrl must be an HTTPS Microsoft Graph API base URL.");
        }

        var basePath = graphBase.AbsoluteUri.TrimEnd('/');
        if (!basePath.EndsWith("/v1.0", StringComparison.OrdinalIgnoreCase))
        {
            throw new SharePointConfigurationException(
                "Graph:BaseUrl must target the Microsoft Graph v1.0 endpoint.");
        }

        return new Uri($"{basePath}/{route.TrimStart('/')}", UriKind.Absolute);
    }

    private static bool IsMicrosoftGraphHost(string host)
    {
        var normalizedHost = host.ToLowerInvariant();
        return normalizedHost is "graph.microsoft.com"
            or "graph.microsoft.us"
            or "graph.microsoft.de"
            or "microsoftgraph.chinacloudapi.cn";
    }

    private Uri ValidateNextLink(string nextLink)
    {
        if (!Uri.TryCreate(nextLink, UriKind.Absolute, out var link)
            || link.Scheme != Uri.UriSchemeHttps
            || !string.IsNullOrEmpty(link.UserInfo)
            || !string.Equals(link.Host, GraphUri(string.Empty).Host, StringComparison.OrdinalIgnoreCase)
            || !link.AbsolutePath.Contains("/v1.0/", StringComparison.OrdinalIgnoreCase))
        {
            throw new SharePointGraphException(
                "Microsoft Graph returned an untrusted pagination link.",
                (int)HttpStatusCode.BadGateway,
                "UntrustedNextLink");
        }

        return link;
    }

    private string ResolveConfiguredValue(string? supplied, string key)
    {
        var configured = configuration[$"Graph:SharePoint:{key}"];
        if (!string.IsNullOrWhiteSpace(configured)
            && !string.IsNullOrWhiteSpace(supplied)
            && !string.Equals(configured, supplied.Trim(), StringComparison.OrdinalIgnoreCase)
            && key is "SiteId" or "DriveId")
        {
            throw new InvalidRequestException($"The selected SharePoint {key} does not match the configured DGF destination.");
        }

        var value = string.IsNullOrWhiteSpace(supplied) ? configured : supplied.Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new SharePointConfigurationException(
                $"Set Graph:SharePoint:{key} in external configuration or select an accessible SharePoint destination.");
        }

        return value;
    }

    private static string CreateFileName(MeetingReport report)
    {
        var safeReference = Regex.Replace(report.ReferenceNumber, @"[^A-Za-z0-9._-]+", "-").Trim('-', '.');
        if (string.IsNullOrWhiteSpace(safeReference)) safeReference = "report";
        if (safeReference.Length > 80) safeReference = safeReference[..80];
        return $"{safeReference}-{report.Id:N}.docx";
    }

    private static AuditLog CreateAuditLog(
        Guid tenantId,
        Guid reportId,
        string action,
        string actorEmail,
        object details) => new()
    {
        TenantId = tenantId,
        EntityType = nameof(MeetingReport),
        EntityId = reportId,
        Action = action,
        DetailsJson = JsonSerializer.Serialize(new { actorEmail, details }, JsonOptions)
    };

    private static string? GetString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
