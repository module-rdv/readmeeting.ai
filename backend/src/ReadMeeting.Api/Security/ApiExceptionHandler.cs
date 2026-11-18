using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ReadMeeting.Application.Security;
using System;
using System.Data.Common;
using System.Net;

namespace ReadMeeting.Api.Security;

public sealed class ApiExceptionHandler(
    ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, title) = exception switch
        {
            AccessDeniedException => (StatusCodes.Status403Forbidden, "Access denied"),
            InvalidRequestException => (StatusCodes.Status400BadRequest, "Invalid request"),
            ResourceNotFoundException => (StatusCodes.Status404NotFound, "Resource not found"),
            SharePointConfigurationException => (StatusCodes.Status503ServiceUnavailable, "SharePoint is not configured"),
            SharePointGraphException { HttpStatus: 429 } =>
                (StatusCodes.Status503ServiceUnavailable, "Microsoft Graph is throttling SharePoint requests"),
            SharePointGraphException => (StatusCodes.Status502BadGateway, "Microsoft Graph SharePoint request failed"),
            DbException => (StatusCodes.Status503ServiceUnavailable, "PostgreSQL unavailable"),
            TimeoutException => (StatusCodes.Status504GatewayTimeout, "Dependency timeout"),
            HttpRequestException { StatusCode: HttpStatusCode.TooManyRequests } =>
                (StatusCodes.Status503ServiceUnavailable, "Gemini quota exhausted"),
            HttpRequestException { StatusCode: HttpStatusCode.ServiceUnavailable } =>
                (StatusCodes.Status503ServiceUnavailable, "Gemini capacity unavailable"),
            HttpRequestException { StatusCode: HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden } =>
                (StatusCodes.Status502BadGateway, "Gemini credentials rejected"),
            HttpRequestException { StatusCode: null } =>
                (StatusCodes.Status504GatewayTimeout, "Gemini request timed out or could not connect"),
            HttpRequestException =>
                (StatusCodes.Status502BadGateway, "Gemini provider request failed"),
            _ => (0, string.Empty)
        };

        if (statusCode == 0)
        {
            logger.LogError(
                "An API dependency operation failed. Exception type: {ExceptionType}.",
                exception.GetType().Name);
            httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await httpContext.Response.WriteAsJsonAsync(
                new ProblemDetails
                {
                    Status = StatusCodes.Status500InternalServerError,
                    Title = "API operation failed",
                    Detail = "The API could not complete the request. Retry or contact the service administrator."
                },
                cancellationToken);
            return true;
        }

        if (statusCode == StatusCodes.Status403Forbidden)
        {
            logger.LogWarning("A user was denied access to a meeting operation.");
        }

        httpContext.Response.StatusCode = statusCode;
        if (exception is SharePointGraphException
            {
                HttpStatus: 429,
                RetryAfterSeconds: { } retryAfterSeconds
            })
        {
            httpContext.Response.Headers.RetryAfter = retryAfterSeconds.ToString(
                System.Globalization.CultureInfo.InvariantCulture);
        }
        await httpContext.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Status = statusCode,
                Title = title,
                Detail = statusCode switch
                {
                    StatusCodes.Status503ServiceUnavailable when exception is DbException =>
                        "PostgreSQL is currently unavailable. Check /health/ready and retry.",
                    StatusCodes.Status503ServiceUnavailable when exception is HttpRequestException =>
                        exception.Message,
                    StatusCodes.Status503ServiceUnavailable when exception is SharePointConfigurationException =>
                        exception.Message,
                    StatusCodes.Status503ServiceUnavailable when exception is SharePointGraphException =>
                        exception.Message,
                    StatusCodes.Status502BadGateway when exception is SharePointGraphException =>
                        exception.Message,
                    StatusCodes.Status502BadGateway when exception is HttpRequestException =>
                        exception.Message,
                    StatusCodes.Status504GatewayTimeout when exception is HttpRequestException =>
                        exception.Message,
                    StatusCodes.Status504GatewayTimeout =>
                        "A required service did not respond before the configured timeout.",
                    _ => exception.Message
                }
            },
            cancellationToken);
        return true;
    }
}
