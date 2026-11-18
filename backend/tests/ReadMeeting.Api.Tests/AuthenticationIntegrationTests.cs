using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using ReadMeeting.Application.Security;
using ReadMeeting.Domain.Entities;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Api.Tests;

public sealed class AuthenticationIntegrationTests : IClassFixture<ApiFactory>
{
    internal const string TestTenantId = "11111111-1111-4111-8111-111111111111";
    internal const string TestApiClientId = "22222222-2222-4222-8222-222222222222";
    internal const string TestSpaClientId = "33333333-3333-4333-8333-333333333333";
    internal const string TestAudience = "api://readmeeting-test";
    internal const string TestRequiredScope = "access_as_user";
    private const string Issuer = $"https://login.microsoftonline.com/{TestTenantId}/v2.0";

    private readonly ApiFactory _factory;

    public AuthenticationIntegrationTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Protected_endpoint_rejects_missing_and_malformed_tokens()
    {
        using var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/security/context")).StatusCode);

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/security/context");
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer malformed-test-token");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task Protected_endpoint_rejects_invalid_signature()
    {
        using var client = _factory.CreateClient();
        var invalidKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes("a-different-local-test-key-not-production"));

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            await GetStatusAsync(client, CreateToken(signingKey: invalidKey)));
    }

    [Fact]
    public async Task Protected_endpoint_rejects_expired_token()
    {
        using var client = _factory.CreateClient();
        var token = CreateToken(expires: DateTime.UtcNow.AddMinutes(-5));

        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, token));
    }

    [Fact]
    public async Task Protected_endpoint_rejects_wrong_audience()
    {
        using var client = _factory.CreateClient();
        var token = CreateToken(audience: "api://another-api");

        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, token));
    }

    [Fact]
    public async Task Protected_endpoint_rejects_wrong_issuer()
    {
        using var client = _factory.CreateClient();
        var token = CreateToken(issuer: "https://login.microsoftonline.com/common/v2.0");

        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, token));
    }

    [Fact]
    public async Task Valid_legacy_v1_issuer_token_is_accepted()
    {
        using var client = _factory.CreateClient();
        var userObjectId = "4f4e5331-1474-44fe-b206-2356a38cb1fd";
        var token = CreateToken(objectId: userObjectId, issuer: $"https://sts.windows.net/{TestTenantId}/");

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/security/context");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");

        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Valid_api_token_is_accepted_and_context_comes_from_signed_claims()
    {
        using var client = _factory.CreateClient();
        var userObjectId = "4f4e5331-1474-44fe-b206-2356a38cb1fd";
        var token = CreateToken(objectId: userObjectId);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/v1/security/context?tenantId={Uri.EscapeDataString(TestSpaClientId)}");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
        request.Headers.TryAddWithoutValidation("X-Tenant-Id", TestSpaClientId);

        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var context = await response.Content.ReadFromJsonAsync<SecurityContext>();
        Assert.NotNull(context);
        Assert.Equal(TestTenantId, context.TenantId);
        Assert.Equal(userObjectId, context.UserObjectId);
    }

    [Fact]
    public async Task Valid_token_without_required_scope_is_forbidden()
    {
        using var client = _factory.CreateClient();
        var token = CreateToken(scope: "User.Read");

        Assert.Equal(HttpStatusCode.Forbidden, await GetStatusAsync(client, token));
    }

    [Fact]
    public async Task Token_for_another_tenant_or_client_is_forbidden()
    {
        using var client = _factory.CreateClient();
        var otherTenantToken = CreateToken(tenantId: "337a6551-f7ad-4717-8656-843a893d83bd");
        var otherClientToken = CreateToken(callingClientId: "39e2242b-ecf3-4f1b-97cf-7721b0504898");

        Assert.Equal(HttpStatusCode.Forbidden, await GetStatusAsync(client, otherTenantToken));
        Assert.Equal(HttpStatusCode.Forbidden, await GetStatusAsync(client, otherClientToken));
    }

    [Fact]
    public async Task User_context_is_isolated_between_signed_users()
    {
        using var client = _factory.CreateClient();
        var firstUserId = "4f4e5331-1474-44fe-b206-2356a38cb1fd";
        var secondUserId = "7c29683b-efc9-4521-a54f-e817a9c61f8e";

        var first = await GetContextAsync(client, CreateToken(objectId: firstUserId));
        var second = await GetContextAsync(client, CreateToken(objectId: secondUserId));

        Assert.NotEqual(first.UserObjectId, second.UserObjectId);
        Assert.Equal(firstUserId, first.UserObjectId);
        Assert.Equal(secondUserId, second.UserObjectId);
    }

    [Fact]
    public async Task Authentication_logs_do_not_contain_bearer_values()
    {
        using var client = _factory.CreateClient();
        const string marker = "test-only-bearer-marker";
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/security/context");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {marker}");

        await client.SendAsync(request);

        Assert.DoesNotContain(marker, string.Join(Environment.NewLine, _factory.Logs.Messages));
    }

    [Fact]
    public async Task Cors_only_allows_configured_frontend_origins()
    {
        using var client = _factory.CreateClient();
        using var allowedRequest = new HttpRequestMessage(HttpMethod.Options, "/api/v1/security/context");
        allowedRequest.Headers.TryAddWithoutValidation("Origin", "https://frontend.test");
        allowedRequest.Headers.TryAddWithoutValidation("Access-Control-Request-Method", "GET");
        using var allowedResponse = await client.SendAsync(allowedRequest);
        Assert.Equal("https://frontend.test", allowedResponse.Headers.GetValues("Access-Control-Allow-Origin").Single());

        using var deniedRequest = new HttpRequestMessage(HttpMethod.Options, "/api/v1/security/context");
        deniedRequest.Headers.TryAddWithoutValidation("Origin", "https://untrusted.test");
        deniedRequest.Headers.TryAddWithoutValidation("Access-Control-Request-Method", "GET");
        using var deniedResponse = await client.SendAsync(deniedRequest);
        Assert.False(deniedResponse.Headers.Contains("Access-Control-Allow-Origin"));
    }

    private static async Task<HttpStatusCode> GetStatusAsync(HttpClient client, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/security/context");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
        using var response = await client.SendAsync(request);
        return response.StatusCode;
    }

    private static async Task<SecurityContext> GetContextAsync(HttpClient client, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/security/context");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SecurityContext>())!;
    }

    internal static string CreateToken(
        string? issuer = null,
        string? audience = null,
        DateTime? expires = null,
        string? tenantId = null,
        string? objectId = null,
        string? scope = null,
        string? callingClientId = null,
        SecurityKey? signingKey = null)
    {
        var claims = new[]
        {
            new Claim("tid", tenantId ?? TestTenantId),
            new Claim("oid", objectId ?? "4f4e5331-1474-44fe-b206-2356a38cb1fd"),
            new Claim("scp", scope ?? TestRequiredScope),
            new Claim("azp", callingClientId ?? TestSpaClientId)
        };
        var token = new JwtSecurityToken(
            issuer: issuer ?? Issuer,
            audience: audience ?? TestAudience,
            claims: claims,
            notBefore: expires is { } expiration && expiration <= DateTime.UtcNow
                ? expiration.AddMinutes(-10)
                : DateTime.UtcNow.AddMinutes(-1),
            expires: expires ?? DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                signingKey ?? ApiFactory.SigningKey,
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed record SecurityContext(string TenantId, string UserObjectId);
}

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public static readonly SymmetricSecurityKey SigningKey = new(
        Encoding.UTF8.GetBytes("only-for-local-integration-tests-not-production"));

    public CapturingLoggerProvider Logs { get; } = new();

    private readonly SqliteConnection _sqliteConnection = new("Data Source=:memory:");

    public ApiFactory()
    {
        _sqliteConnection.Open();
    }

    public async Task EnsureDatabaseCreatedAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider
            .GetRequiredService<ReadMeetingDbContext>()
            .Database.EnsureCreatedAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("AzureAd:TenantId", AuthenticationIntegrationTests.TestTenantId);
        builder.UseSetting("AzureAd:ClientId", AuthenticationIntegrationTests.TestApiClientId);
        builder.UseSetting("AzureAd:AllowedClientId", AuthenticationIntegrationTests.TestSpaClientId);
        builder.UseSetting("AzureAd:Audience", AuthenticationIntegrationTests.TestAudience);
        builder.UseSetting("AzureAd:RequiredScope", AuthenticationIntegrationTests.TestRequiredScope);
        builder.UseSetting("Cors:AllowedOrigins:0", "https://frontend.test");
        builder.UseSetting(
            "ConnectionStrings:DefaultConnection",
            "Host=localhost;Database=ReadMeetingTests");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<ReadMeetingDbContext>();
            services.RemoveAll<DbContextOptions<ReadMeetingDbContext>>();
            services.AddScoped(serviceProvider =>
                new ReadMeetingDbContext(
                    new DbContextOptionsBuilder<ReadMeetingDbContext>()
                        .UseSqlite(_sqliteConnection)
                        .Options,
                    serviceProvider.GetRequiredService<ICurrentTenantAccessor>()));
            services.PostConfigure<JwtBearerOptions>(
                JwtBearerDefaults.AuthenticationScheme,
                options =>
                {
                    options.ConfigurationManager = null!;
                    options.TokenValidationParameters.IssuerSigningKey = SigningKey;
                    options.TokenValidationParameters.ValidateIssuerSigningKey = true;
                });
            services.AddSingleton<ILoggerProvider>(Logs);
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _sqliteConnection.Dispose();
        }

        base.Dispose(disposing);
    }
}

public sealed class CapturingLoggerProvider : ILoggerProvider
{
    public ConcurrentQueue<string> Messages { get; } = new();

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(Messages);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(ConcurrentQueue<string> messages) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            messages.Enqueue(
                exception is null
                    ? formatter(state, exception)
                    : $"{formatter(state, exception)} {exception.GetType().Name}: {exception.Message}");
        }
    }
}
