using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using ReadMeeting.Infrastructure.Persistence;

namespace ReadMeeting.Api;

public sealed class PostgreSqlMigrationContextFactory : IDesignTimeDbContextFactory<ReadMeetingDbContext>
{
    public ReadMeetingDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .AddUserSecrets<Program>(optional: true)
            .Build();
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? configuration.GetConnectionString("DefaultConnection");

        var options = new DbContextOptionsBuilder<ReadMeetingDbContext>()
            .UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsAssembly("ReadMeeting.PostgreSqlMigrations"))
            .Options;

        return new ReadMeetingDbContext(options, new CurrentTenantContext());
    }
}
