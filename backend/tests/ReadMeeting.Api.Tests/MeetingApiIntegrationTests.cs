using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ReadMeeting.Domain.Entities;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Api.Tests;

public sealed class MeetingApiIntegrationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public MeetingApiIntegrationTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Meeting_endpoints_require_the_existing_api_authorization_policy()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/meetings");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        using var forbiddenRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/meetings");
        forbiddenRequest.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            AuthenticationIntegrationTests.CreateToken(scope: "User.Read"));
        using var forbiddenResponse = await client.SendAsync(forbiddenRequest);
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResponse.StatusCode);
    }

    [Fact]
    public async Task Manual_meeting_is_saved_under_the_authenticated_tenant_not_request_data()
    {
        await _factory.EnsureDatabaseCreatedAsync();
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/meetings")
        {
            Content = JsonContent.Create(new
            {
                title = "Planning meeting",
                startTime = "2026-04-15T10:00:00+02:00",
                endTime = "2026-04-15T11:00:00+02:00",
                tenantId = "55555555-5555-4555-8555-555555555555"
            })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            AuthenticationIntegrationTests.CreateToken());

        using var response = await client.SendAsync(request);
        Assert.True(
            response.StatusCode == HttpStatusCode.Created,
            $"Expected Created, got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}\n"
            + string.Join(Environment.NewLine, _factory.Logs.Messages));
        var result = await response.Content.ReadFromJsonAsync<MeetingResponse>();
        Assert.NotNull(result);
        Assert.Equal("Planning meeting", result.Title);

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ReadMeetingDbContext>();
        var tenant = await dbContext.Tenants
            .IgnoreQueryFilters()
            .SingleAsync(item => item.EntraTenantId == Guid.Parse(AuthenticationIntegrationTests.TestTenantId));
        var meeting = await dbContext.Meetings
            .IgnoreQueryFilters()
            .SingleAsync(item => item.Id == result.Id);
        var capture = await dbContext.Captures
            .IgnoreQueryFilters()
            .SingleAsync(item => item.MeetingId == result.Id);

        Assert.Equal(tenant.Id, meeting.TenantId);
        Assert.NotEqual(Guid.Parse("55555555-5555-4555-8555-555555555555"), meeting.TenantId);
        Assert.Equal(CaptureMethod.ManualImport, capture.Method);
        Assert.Equal(DateTimeOffset.Parse("2026-04-15T08:00:00+00:00"), meeting.StartTime);

        using var listRequest = CreateAuthorizedRequest(HttpMethod.Get, "/api/v1/meetings");
        using var listResponse = await client.SendAsync(listRequest);
        Assert.True(
            listResponse.StatusCode == HttpStatusCode.OK,
            $"Expected OK, got {(int)listResponse.StatusCode}: {await listResponse.Content.ReadAsStringAsync()}\n"
            + string.Join(Environment.NewLine, _factory.Logs.Messages));
        var listedMeetings = await listResponse.Content.ReadFromJsonAsync<MeetingResponse[]>();
        Assert.NotNull(listedMeetings);
        Assert.Contains(listedMeetings, item => item.Id == result.Id);

        using var detailRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{result.Id}");
        using var detailResponse = await client.SendAsync(detailRequest);
        Assert.Equal(HttpStatusCode.OK, detailResponse.StatusCode);

        using var transcriptsRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{result.Id}/transcripts");
        using var transcriptsResponse = await client.SendAsync(transcriptsRequest);
        Assert.Equal(HttpStatusCode.OK, transcriptsResponse.StatusCode);
        var transcripts = await transcriptsResponse.Content.ReadFromJsonAsync<object[]>();
        Assert.NotNull(transcripts);
        Assert.Empty(transcripts);

        using var runsRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{result.Id}/processing-runs");
        using var runsResponse = await client.SendAsync(runsRequest);
        Assert.Equal(HttpStatusCode.OK, runsResponse.StatusCode);
        var runs = await runsResponse.Content.ReadFromJsonAsync<object[]>();
        Assert.NotNull(runs);
        Assert.Empty(runs);

        using var reportsRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{result.Id}/reports");
        using var reportsResponse = await client.SendAsync(reportsRequest);
        Assert.Equal(HttpStatusCode.OK, reportsResponse.StatusCode);
        var reports = await reportsResponse.Content.ReadFromJsonAsync<object[]>();
        Assert.NotNull(reports);
        Assert.Empty(reports);

        using var missingRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{Guid.NewGuid()}");
        using var missingResponse = await client.SendAsync(missingRequest);
        Assert.Equal(HttpStatusCode.NotFound, missingResponse.StatusCode);

        using var invalidRangeRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            "/api/v1/meetings?from=2026-04-16T00%3A00%3A00Z&to=2026-04-15T00%3A00%3A00Z");
        using var invalidRangeResponse = await client.SendAsync(invalidRangeRequest);
        Assert.Equal(HttpStatusCode.BadRequest, invalidRangeResponse.StatusCode);

        using var invalidCreateRequest = CreateAuthorizedRequest(HttpMethod.Post, "/api/v1/meetings");
        invalidCreateRequest.Content = JsonContent.Create(new { title = "" });
        using var invalidCreateResponse = await client.SendAsync(invalidCreateRequest);
        Assert.Equal(HttpStatusCode.BadRequest, invalidCreateResponse.StatusCode);
    }

    [Fact]
    public async Task Meeting_transcript_and_processing_run_complete_the_persisted_api_workflow()
    {
        await _factory.EnsureDatabaseCreatedAsync();
        using var client = _factory.CreateClient();

        using var createMeeting = CreateAuthorizedRequest(HttpMethod.Post, "/api/v1/meetings");
        createMeeting.Content = JsonContent.Create(new { title = "Fixture: workflow meeting" });
        using var meetingResponse = await client.SendAsync(createMeeting);
        Assert.Equal(HttpStatusCode.Created, meetingResponse.StatusCode);
        var meeting = await meetingResponse.Content.ReadFromJsonAsync<MeetingResponse>();
        Assert.NotNull(meeting);

        const string fixtureContent = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nFixture transcript.";
        using var createTranscript = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{meeting.Id}/transcript");
        createTranscript.Content = JsonContent.Create(new
        {
            content = fixtureContent,
            contentFormat = "TextVtt",
            language = "en",
            tenantId = "55555555-5555-4555-8555-555555555555"
        });
        using var transcriptResponse = await client.SendAsync(createTranscript);
        Assert.Equal(HttpStatusCode.Created, transcriptResponse.StatusCode);
        using var transcriptJson = JsonDocument.Parse(await transcriptResponse.Content.ReadAsStringAsync());
        var transcriptId = transcriptJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(meeting.Id, transcriptJson.RootElement.GetProperty("meetingId").GetGuid());
        Assert.Equal(fixtureContent, transcriptJson.RootElement.GetProperty("content").GetString());
        Assert.Equal(64, transcriptJson.RootElement.GetProperty("sha256").GetString()?.Length);

        using var readTranscript = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{meeting.Id}/transcript");
        using var readTranscriptResponse = await client.SendAsync(readTranscript);
        Assert.Equal(HttpStatusCode.OK, readTranscriptResponse.StatusCode);
        using var savedTranscript = JsonDocument.Parse(await readTranscriptResponse.Content.ReadAsStringAsync());
        Assert.Equal(transcriptId, savedTranscript.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(fixtureContent, savedTranscript.RootElement.GetProperty("content").GetString());

        using var createRun = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{meeting.Id}/processing-runs");
        createRun.Content = JsonContent.Create(new { transcriptId });
        using var runResponse = await client.SendAsync(createRun);
        Assert.Equal(HttpStatusCode.Created, runResponse.StatusCode);
        using var runJson = JsonDocument.Parse(await runResponse.Content.ReadAsStringAsync());
        var runId = runJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Queued", runJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(transcriptId, runJson.RootElement.GetProperty("transcriptId").GetGuid());

        using var readRun = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/processing-runs/{runId}");
        using var readRunResponse = await client.SendAsync(readRun);
        Assert.Equal(HttpStatusCode.OK, readRunResponse.StatusCode);
        using var savedRun = JsonDocument.Parse(await readRunResponse.Content.ReadAsStringAsync());
        Assert.Equal("Queued", savedRun.RootElement.GetProperty("status").GetString());
        Assert.Equal(meeting.Id, savedRun.RootElement.GetProperty("meetingId").GetGuid());

        using var listRuns = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{meeting.Id}/processing-runs");
        using var listRunsResponse = await client.SendAsync(listRuns);
        Assert.Equal(HttpStatusCode.OK, listRunsResponse.StatusCode);
        using var listedRuns = JsonDocument.Parse(await listRunsResponse.Content.ReadAsStringAsync());
        Assert.Single(listedRuns.RootElement.EnumerateArray());

        using var invalidTranscript = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{meeting.Id}/transcript");
        invalidTranscript.Content = JsonContent.Create(new { content = "   ", contentFormat = "Unknown" });
        using var invalidTranscriptResponse = await client.SendAsync(invalidTranscript);
        Assert.Equal(HttpStatusCode.BadRequest, invalidTranscriptResponse.StatusCode);

        using var missingRun = CreateAuthorizedRequest(HttpMethod.Get, $"/api/v1/processing-runs/{Guid.NewGuid()}");
        using var missingRunResponse = await client.SendAsync(missingRun);
        Assert.Equal(HttpStatusCode.NotFound, missingRunResponse.StatusCode);
    }

    [Fact]
    public async Task Meeting_reports_decisions_and_actions_are_persisted_and_filtered_by_tenant()
    {
        await _factory.EnsureDatabaseCreatedAsync();
        using var client = _factory.CreateClient();

        using var createMeeting = CreateAuthorizedRequest(HttpMethod.Post, "/api/v1/meetings");
        createMeeting.Content = JsonContent.Create(new { title = "Minutes workflow meeting" });
        using var meetingResponse = await client.SendAsync(createMeeting);
        Assert.Equal(HttpStatusCode.Created, meetingResponse.StatusCode);
        var meeting = await meetingResponse.Content.ReadFromJsonAsync<MeetingResponse>();
        Assert.NotNull(meeting);

        using var createReport = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{meeting.Id}/reports");
        createReport.Content = JsonContent.Create(new
        {
            title = "CR-DGF-2026-001",
            referenceNumber = "CR-DGF-2026-001",
            executiveSummary = "Summary",
            decisionsAgreed = "Approved",
            keyDiscussionPoints = "Operational follow-up",
            approvalStatus = "Draft"
        });
        using var reportResponse = await client.SendAsync(createReport);
        Assert.Equal(HttpStatusCode.Created, reportResponse.StatusCode);

        using var createDecision = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{meeting.Id}/decisions");
        createDecision.Content = JsonContent.Create(new
        {
            text = "Proceed with the pilot",
            status = "Confirmed",
            decisionType = "Consensus"
        });
        using var decisionResponse = await client.SendAsync(createDecision);
        Assert.Equal(HttpStatusCode.Created, decisionResponse.StatusCode);

        using var createAction = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{meeting.Id}/actions");
        createAction.Content = JsonContent.Create(new
        {
            title = "Coordinate rollout",
            description = "Prepare the rollout checklist",
            assigneeName = "DGF Coord",
            assigneeEmail = "coord@example.com",
            status = "Pending",
            priority = "High"
        });
        using var actionResponse = await client.SendAsync(createAction);
        Assert.Equal(HttpStatusCode.Created, actionResponse.StatusCode);

        using var reportList = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{meeting.Id}/reports");
        using var reportListResponse = await client.SendAsync(reportList);
        Assert.Equal(HttpStatusCode.OK, reportListResponse.StatusCode);

        using var decisionList = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{meeting.Id}/decisions");
        using var decisionListResponse = await client.SendAsync(decisionList);
        Assert.Equal(HttpStatusCode.OK, decisionListResponse.StatusCode);

        using var actionList = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{meeting.Id}/actions");
        using var actionListResponse = await client.SendAsync(actionList);
        Assert.Equal(HttpStatusCode.OK, actionListResponse.StatusCode);

        var decisionPayload = await decisionListResponse.Content.ReadFromJsonAsync<object[]>();
        var actionPayload = await actionListResponse.Content.ReadFromJsonAsync<object[]>();
        Assert.NotNull(decisionPayload);
        Assert.NotNull(actionPayload);
        Assert.NotEmpty(decisionPayload);
        Assert.NotEmpty(actionPayload);
    }

    [Fact]
    public async Task Report_cannot_be_marked_published_without_a_confirmed_graph_upload()
    {
        await _factory.EnsureDatabaseCreatedAsync();
        using var client = _factory.CreateClient();

        using var createMeeting = CreateAuthorizedRequest(HttpMethod.Post, "/api/v1/meetings");
        createMeeting.Content = JsonContent.Create(new { title = "Publication security meeting" });
        using var meetingResponse = await client.SendAsync(createMeeting);
        Assert.True(
            meetingResponse.StatusCode == HttpStatusCode.Created,
            $"Expected Created, got {(int)meetingResponse.StatusCode}: {await meetingResponse.Content.ReadAsStringAsync()}\n"
            + string.Join(Environment.NewLine, _factory.Logs.Messages));
        var meeting = await meetingResponse.Content.ReadFromJsonAsync<MeetingResponse>();
        Assert.NotNull(meeting);

        using var createReport = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{meeting.Id}/reports");
        createReport.Content = JsonContent.Create(new
        {
            title = "Approved minutes",
            referenceNumber = $"CR-{Guid.NewGuid():N}",
            executiveSummary = "Approved summary",
            decisionsAgreed = "Decision recorded",
            keyDiscussionPoints = "Discussion recorded",
            sharePointDocxUrl = "https://example.invalid/fake.docx",
            sharePointFileId = "not-a-graph-id",
            approvalStatus = "Draft"
        });
        using var reportResponse = await client.SendAsync(createReport);
        Assert.Equal(HttpStatusCode.Created, reportResponse.StatusCode);
        using var reportPayload = JsonDocument.Parse(await reportResponse.Content.ReadAsStringAsync());
        var reportId = reportPayload.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(JsonValueKind.Null, reportPayload.RootElement.GetProperty("sharePointDocxUrl").ValueKind);
        Assert.Equal(JsonValueKind.Null, reportPayload.RootElement.GetProperty("sharePointFileId").ValueKind);

        using var markPublished = CreateAuthorizedRequest(
            HttpMethod.Put,
            $"/api/v1/meetings/{meeting.Id}/reports/{reportId}");
        markPublished.Content = JsonContent.Create(new
        {
            title = "Approved minutes",
            executiveSummary = "Approved summary",
            decisionsAgreed = "Decision recorded",
            keyDiscussionPoints = "Discussion recorded",
            approvalStatus = "Published",
            sharePointDocxUrl = "https://example.invalid/fake.docx",
            sharePointFileId = "not-a-graph-id"
        });
        using var publishedResponse = await client.SendAsync(markPublished);
        Assert.Equal(HttpStatusCode.BadRequest, publishedResponse.StatusCode);

        using var readReport = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{meeting.Id}/reports/{reportId}");
        using var readResponse = await client.SendAsync(readReport);
        Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
        using var savedReport = JsonDocument.Parse(await readResponse.Content.ReadAsStringAsync());
        Assert.Equal("Draft", savedReport.RootElement.GetProperty("approvalStatus").GetString());
        Assert.Equal(JsonValueKind.Null, savedReport.RootElement.GetProperty("sharePointDocxUrl").ValueKind);
    }

    [Fact]
    public async Task Authenticated_tenant_cannot_read_or_attach_data_to_another_tenants_meeting()
    {
        await _factory.EnsureDatabaseCreatedAsync();
        Guid otherTenantMeetingId;
        Guid otherTenantRunId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<ReadMeetingDbContext>();
            var authenticatedTenant = await dbContext.Tenants
                .IgnoreQueryFilters()
                .SingleAsync(item =>
                    item.EntraTenantId == Guid.Parse(AuthenticationIntegrationTests.TestTenantId));
            var otherTenant = new Tenant { EntraTenantId = Guid.NewGuid() };
            dbContext.Tenants.Add(otherTenant);
            await dbContext.SaveChangesAsync();

            var tenantContext = scope.ServiceProvider.GetRequiredService<CurrentTenantContext>();
            tenantContext.Set(otherTenant.Id, otherTenant.EntraTenantId, Guid.NewGuid());
            var otherMeeting = new Meeting
            {
                TenantId = otherTenant.Id,
                Title = "Other tenant fixture"
            };
            var otherUser = new UserAccount
            {
                TenantId = otherTenant.Id,
                EntraObjectId = Guid.NewGuid()
            };
            var otherRun = new ProcessingRun
            {
                TenantId = otherTenant.Id,
                Meeting = otherMeeting,
                RequestedByUser = otherUser,
                IdempotencyKey = Guid.NewGuid().ToString("N"),
                RequestPayloadHash = new string('a', 64),
                ParserVersion = "fixture-v1",
                Status = ProcessingRunStatus.Queued
            };
            dbContext.Meetings.Add(otherMeeting);
            dbContext.Users.Add(otherUser);
            dbContext.ProcessingRuns.Add(otherRun);
            await dbContext.SaveChangesAsync();
            otherTenantMeetingId = otherMeeting.Id;
            otherTenantRunId = otherRun.Id;
            Assert.NotEqual(authenticatedTenant.Id, otherTenant.Id);
        }

        using var client = _factory.CreateClient();
        using var getRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/meetings/{otherTenantMeetingId}");
        using var getResponse = await client.SendAsync(getRequest);
        Assert.Equal(HttpStatusCode.NotFound, getResponse.StatusCode);

        using var runRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/v1/processing-runs/{otherTenantRunId}");
        using var runResponse = await client.SendAsync(runRequest);
        Assert.Equal(HttpStatusCode.NotFound, runResponse.StatusCode);

        using var transcriptRequest = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/v1/meetings/{otherTenantMeetingId}/transcript");
        transcriptRequest.Content = JsonContent.Create(new
        {
            content = "Fixture content",
            contentFormat = "TextPlainUnattributed"
        });
        using var transcriptResponse = await client.SendAsync(transcriptRequest);
        Assert.Equal(HttpStatusCode.NotFound, transcriptResponse.StatusCode);
    }

    private static HttpRequestMessage CreateAuthorizedRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            AuthenticationIntegrationTests.CreateToken());
        return request;
    }

    private sealed record MeetingResponse(Guid Id, string Title);
}
