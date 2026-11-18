using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using System.Text.Json.Serialization;
using Microsoft.Identity.Web;
using ReadMeeting.Application.Interfaces;
using ReadMeeting.Api.Health;
using ReadMeeting.Api.Security;
using ReadMeeting.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

var entra = builder.Configuration.GetSection("AzureAd");
var tenantId = entra["TenantId"];
var clientId = entra["ClientId"];
var allowedClientId = entra["AllowedClientId"];
var audience = entra["Audience"];
var requiredScope = entra["RequiredScope"];
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

var invalidConfiguration = new List<string>();
if (!Guid.TryParse(tenantId, out _))
{
    invalidConfiguration.Add("AzureAd:TenantId must be a GUID.");
}
if (!Guid.TryParse(clientId, out _))
{
    invalidConfiguration.Add("AzureAd:ClientId must be the API application's client ID in GUID format.");
}
if (!Guid.TryParse(allowedClientId, out _))
{
    invalidConfiguration.Add("AzureAd:AllowedClientId must be the authorized calling application's client ID in GUID format.");
}
if (string.IsNullOrWhiteSpace(audience))
{
    invalidConfiguration.Add("AzureAd:Audience must equal the API access token's aud claim.");
}
if (string.IsNullOrWhiteSpace(requiredScope)
    || requiredScope.Any(char.IsWhiteSpace))
{
    invalidConfiguration.Add("AzureAd:RequiredScope must be one scope value from the API access token's scp claim.");
}
if (allowedOrigins.Length == 0)
{
    invalidConfiguration.Add("Cors:AllowedOrigins must contain at least one valid origin.");
}
for (var index = 0; index < allowedOrigins.Length; index++)
{
    var origin = allowedOrigins[index];
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)
        || (uri.Scheme != Uri.UriSchemeHttps
            && !(uri.Scheme == Uri.UriSchemeHttp
                && (uri.Host == "localhost" || uri.Host == "127.0.0.1")))
        || !string.IsNullOrEmpty(uri.UserInfo)
        || uri.AbsolutePath != "/"
        || !string.IsNullOrEmpty(uri.Query)
        || !string.IsNullOrEmpty(uri.Fragment))
    {
        invalidConfiguration.Add($"Cors:AllowedOrigins:{index} must be a valid HTTPS origin (localhost HTTP is permitted for development).");
    }
}
if (invalidConfiguration.Count > 0)
{
    throw new InvalidOperationException(
        $"API startup configuration is invalid: {string.Join(" ", invalidConfiguration)}");
}

var validIssuer = $"https://login.microsoftonline.com/{tenantId}/v2.0";
var validIssuers = new[]
{
    validIssuer,
    $"https://login.microsoftonline.com/{tenantId}/",
    $"https://login.windows.net/{tenantId}/",
    $"https://sts.windows.net/{tenantId}/"
};
var persistenceConfigured = !string.IsNullOrWhiteSpace(
    builder.Configuration.GetConnectionString("DefaultConnection"));
if (!persistenceConfigured && !builder.Environment.IsDevelopment())
{
    throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection is required outside Development.");
}

builder.Services.AddHealthChecks()
    .AddCheck("api", () => Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy(), tags: ["live"]);
if (persistenceConfigured)
{
    builder.Services.AddHealthChecks()
        .AddCheck<PostgreSqlHealthCheck>("postgresql", tags: ["ready"]);
}
else
{
    builder.Services.AddHealthChecks()
        .AddCheck(
            "postgresql",
            () => Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Unhealthy(
                "PostgreSQL persistence is not configured."),
            tags: ["ready"]);
}
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddCors(options =>
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(entra)
    .EnableTokenAcquisitionToCallDownstreamApi()
    .AddInMemoryTokenCaches();
builder.Services.AddScoped<IGraphOnBehalfOfTokenProvider, GraphOnBehalfOfTokenProvider>();
builder.Services.AddReadMeetingPersistence(
    builder.Configuration,
    allowMissingConnectionString: builder.Environment.IsDevelopment());
builder.Services.Configure<JwtBearerOptions>(
    JwtBearerDefaults.AuthenticationScheme,
    options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters.ValidateIssuer = true;
        options.TokenValidationParameters.ValidIssuers = validIssuers;
        options.TokenValidationParameters.IssuerValidator = (issuer, _, _) =>
            validIssuers.Contains(issuer, StringComparer.Ordinal)
                ? issuer
                : throw new Microsoft.IdentityModel.Tokens.SecurityTokenInvalidIssuerException();
        options.TokenValidationParameters.ValidateAudience = true;
        options.TokenValidationParameters.ValidAudience = audience;
        options.TokenValidationParameters.ValidateLifetime = true;
        options.TokenValidationParameters.ValidateIssuerSigningKey = true;
        options.Events ??= new JwtBearerEvents();
        options.Events.OnAuthenticationFailed = context =>
        {
            var logger = context.HttpContext.RequestServices
                .GetRequiredService<ILoggerFactory>()
                .CreateLogger("BearerAuthentication");
            logger.LogWarning("Bearer authentication failed.");
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("ApiUser", policy =>
        policy.RequireAuthenticatedUser()
            .RequireAssertion(context =>
            {
                var claims = context.User;
                var scopes = claims.FindAll("scp")
                    .SelectMany(claim => claim.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries));
                var callingClientId = claims.FindFirst("azp")?.Value
                    ?? claims.FindFirst("appid")?.Value;

                return string.Equals(
                        claims.FindFirst("tid")?.Value,
                        tenantId,
                        StringComparison.OrdinalIgnoreCase)
                    && Guid.TryParse(claims.FindFirst("oid")?.Value, out _)
                    && string.Equals(callingClientId, allowedClientId, StringComparison.OrdinalIgnoreCase)
                    && scopes.Contains(requiredScope, StringComparer.Ordinal);
            }));
});

var app = builder.Build();
if (!persistenceConfigured)
{
    app.Logger.LogWarning(
        "PostgreSQL persistence is not configured; only database-independent features are available in Development.");
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseWhen(
    context => context.Request.Path.StartsWithSegments("/api/v1/meetings")
        || context.Request.Path.StartsWithSegments("/api/v1/processing-runs")
        || context.Request.Path.StartsWithSegments("/api/v1/dashboard"),
    branch => branch.UseMiddleware<TenantResolutionMiddleware>());
app.MapHealthChecks("/health", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live"),
    ResponseWriter = WriteHealthResponse
});
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = WriteHealthResponse
});
app.MapControllers();
app.MapGet("/api/v1/security/context", (System.Security.Claims.ClaimsPrincipal user) =>
    Results.Ok(new
    {
        tenantId = user.FindFirst("tid")!.Value,
        userObjectId = user.FindFirst("oid")!.Value
    }))
    .RequireAuthorization("ApiUser");

app.Run();

static Task WriteHealthResponse(HttpContext context, Microsoft.Extensions.Diagnostics.HealthChecks.HealthReport report)
{
    context.Response.ContentType = "application/json";
    return System.Text.Json.JsonSerializer.SerializeAsync(
        context.Response.Body,
        new
        {
            status = report.Status.ToString().ToLowerInvariant(),
            checks = report.Entries.ToDictionary(
                entry => entry.Key,
                entry => entry.Value.Status.ToString().ToLowerInvariant())
        },
        cancellationToken: context.RequestAborted);
}

public partial class Program { }
