using Microsoft.EntityFrameworkCore;
using ReadMeeting.Application.Users;
using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Infrastructure.Persistence.Repositories;

public sealed class EfUserAccountRepository(ReadMeetingDbContext dbContext) : IUserAccountRepository
{
    public async Task<UserAccount> GetOrCreateForAuthenticatedUserAsync(
        Guid tenantId,
        Guid entraObjectId,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.SingleOrDefaultAsync(
            account => account.TenantId == tenantId && account.EntraObjectId == entraObjectId,
            cancellationToken);

        if (user is not null)
        {
            return user;
        }

        user = new UserAccount
        {
            TenantId = tenantId,
            EntraObjectId = entraObjectId
        };
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);
        return user;
    }
}
