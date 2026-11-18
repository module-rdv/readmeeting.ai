using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ReadMeeting.Infrastructure.Ai;
using ReadMeeting.Application.Meetings;
using ReadMeeting.Application.Security;
using ReadMeeting.Application.Users;
using ReadMeeting.Infrastructure.Processing;
using ReadMeeting.Infrastructure.Persistence.Repositories;
using ReadMeeting.Infrastructure.SharePoint;
using Microsoft.Extensions.Hosting;

namespace ReadMeeting.Infrastructure.Persistence;

public static class ReadMeetingInfrastructureExtensions
{
    public static IServiceCollection AddReadMeetingPersistence(
        this IServiceCollection services,
        IConfiguration configuration,
        bool allowMissingConnectionString = false)
    {
        services.AddHttpClient<GeminiMeetingProcessor>(client =>
                client.Timeout = TimeSpan.FromSeconds(90))
            .RedactLoggedHeaders(header =>
                string.Equals(header, "x-goog-api-key", StringComparison.OrdinalIgnoreCase));
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            if (allowMissingConnectionString)
            {
                return services;
            }

            throw new InvalidOperationException(
                "ConnectionStrings:DefaultConnection is required to register PostgreSQL persistence.");
        }

        services.AddScoped<CurrentTenantContext>();
        services.AddScoped<ICurrentTenantAccessor>(
            serviceProvider => serviceProvider.GetRequiredService<CurrentTenantContext>());
        services.AddDbContext<ReadMeetingDbContext>(options =>
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsAssembly("ReadMeeting.PostgreSqlMigrations")));
        services.AddScoped<IMeetingRepository, EfMeetingRepository>();
        services.AddScoped<IUserAccountRepository, EfUserAccountRepository>();
        services.AddScoped<MeetingService>();
        services.AddHttpClient<ISharePointPublishingService, SharePointPublishingService>(client =>
                client.Timeout = TimeSpan.FromSeconds(30))
            .RedactLoggedHeaders(header =>
                string.Equals(header, "Authorization", StringComparison.OrdinalIgnoreCase));
        services.AddScoped<ProcessingRunQueue>();
        services.AddHostedService<ProcessingRunWorker>();
        return services;
    }
}
