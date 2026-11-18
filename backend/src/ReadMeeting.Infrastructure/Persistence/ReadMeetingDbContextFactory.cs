using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.Reflection;

namespace ReadMeeting.Infrastructure.Persistence;

public sealed class ReadMeetingDbContextFactory : IDesignTimeDbContextFactory<ReadMeetingDbContext>
{
    public ReadMeetingDbContext CreateDbContext(string[] args)
    {
        var apiAssembly = Assembly.Load("ReadMeeting.Api");
        var configuration = new ConfigurationBuilder()
            .AddUserSecrets(apiAssembly, optional: true)
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
