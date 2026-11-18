using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Application.Users;

public interface IUserAccountRepository
{
    Task<UserAccount> GetOrCreateForAuthenticatedUserAsync(
        Guid tenantId,
        Guid entraObjectId,
        CancellationToken cancellationToken);
}
