using Microsoft.Identity.Web;
using ReadMeeting.Application.Interfaces;

namespace ReadMeeting.Api.Security;

public sealed class GraphOnBehalfOfTokenProvider : IGraphOnBehalfOfTokenProvider
{
    private readonly ITokenAcquisition _tokenAcquisition;
    private readonly IConfiguration _configuration;

    public GraphOnBehalfOfTokenProvider(
        ITokenAcquisition tokenAcquisition,
        IConfiguration configuration)
    {
        _tokenAcquisition = tokenAcquisition;
        _configuration = configuration;
    }

    public Task<string> AcquireAccessTokenAsync()
    {
        var scopes = _configuration.GetSection("Graph:Scopes").Get<string[]>()?
            .Where(scope => !string.IsNullOrWhiteSpace(scope))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        if (scopes is not { Length: > 0 })
        {
            throw new InvalidOperationException(
                "At least one administrator-approved Graph scope must be configured under Graph:Scopes.");
        }

        return _tokenAcquisition.GetAccessTokenForUserAsync(scopes);
    }
}
