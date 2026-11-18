namespace ReadMeeting.Application.Security;

public sealed class SharePointGraphException(
    string message,
    int? httpStatus,
    string? graphErrorCode,
    int? retryAfterSeconds = null) : Exception(message)
{
    public int? HttpStatus { get; } = httpStatus;

    public string? GraphErrorCode { get; } = graphErrorCode;

    public int? RetryAfterSeconds { get; } = retryAfterSeconds;
}
