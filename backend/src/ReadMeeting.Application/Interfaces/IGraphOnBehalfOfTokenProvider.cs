namespace ReadMeeting.Application.Interfaces;

public interface IGraphOnBehalfOfTokenProvider
{
    Task<string> AcquireAccessTokenAsync();
}
