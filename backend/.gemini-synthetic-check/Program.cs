using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using ReadMeeting.Infrastructure.Ai;

const string userSecretsId = "2b408f10-afd5-4484-9b08-2be0e77ffae2";
const string requiredModel = "gemini-4-hydrogen";
const string syntheticTranscript = """
    00:00:00.000 --> 00:00:08.000
    Sofia: The fictional Aurora Widgets review begins.
    00:00:08.000 --> 00:00:19.000
    Malik: I propose sharing one sample design by Friday.
    00:00:19.000 --> 00:00:27.000
    Sofia: Malik will share the sample by Friday. No other decision is made.
    """;

var configuration = new ConfigurationBuilder()
    .AddUserSecrets(userSecretsId, reloadOnChange: false)
    .Build();
var apiKeyAvailable = !string.IsNullOrWhiteSpace(configuration["Ai:Gemini:ApiKey"]);
var configuredModel = configuration["Ai:Gemini:Model"];
Console.WriteLine($"GEMINI_KEY_AVAILABLE={apiKeyAvailable}");
Console.WriteLine($"MODEL_MATCHES_REQUIRED={string.Equals(configuredModel, requiredModel, StringComparison.Ordinal)}");

if (args.Contains("--recent-runs", StringComparer.Ordinal))
{
    var rawConnectionString = configuration.GetConnectionString("DefaultConnection");
    if (string.IsNullOrWhiteSpace(rawConnectionString))
    {
        Console.WriteLine("POSTGRESQL_CONFIGURED=False");
        return 2;
    }

    await using var connection = new NpgsqlConnection(rawConnectionString);
    await connection.OpenAsync();
    await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
    await using (var readOnlyCommand = new NpgsqlCommand("SET TRANSACTION READ ONLY", connection, transaction))
    {
        await readOnlyCommand.ExecuteNonQueryAsync();
    }

    await using var recentRuns = new NpgsqlCommand(
        """
        SELECT "Status", "AttemptCount", "ModelUsed", "ErrorMessage", "CreatedAt"
        FROM "ProcessingRuns"
        WHERE "CreatedAt" >= @since
        ORDER BY "CreatedAt" DESC
        LIMIT 10
        """,
        connection,
        transaction);
    recentRuns.Parameters.AddWithValue("since", DateTimeOffset.UtcNow.AddHours(-1));
    await using var reader = await recentRuns.ExecuteReaderAsync();
    var rowCount = 0;
    while (await reader.ReadAsync())
    {
        rowCount++;
        var errorMessage = reader.IsDBNull(3) ? "none" : reader.GetString(3);
        Console.WriteLine(
            $"PROCESSING_RUN={rowCount}; STATUS={reader.GetString(0)}; ATTEMPTS={reader.GetInt32(1)}; MODEL={(reader.IsDBNull(2) ? "none" : reader.GetString(2))}; ERROR={errorMessage}; CREATED_AT={reader.GetFieldValue<DateTimeOffset>(4):O}");
    }

    Console.WriteLine($"RECENT_PROCESSING_RUN_COUNT={rowCount}; TRANSACTION_READ_ONLY=True");
    await transaction.CommitAsync();
    return 0;
}

if (!apiKeyAvailable || !string.Equals(configuredModel, requiredModel, StringComparison.Ordinal))
{
    Console.WriteLine("SYNTHETIC_GEMINI_CALL=SKIPPED");
    return 2;
}

var processor = new GeminiMeetingProcessor(
    configuration,
    new HttpClient { Timeout = Timeout.InfiniteTimeSpan },
    TimeProvider.System,
    NullLogger<GeminiMeetingProcessor>.Instance);

try
{
    var analysis = await processor.AnalyzeTranscriptAsync(syntheticTranscript, CancellationToken.None);
    Console.WriteLine($"SYNTHETIC_GEMINI_CALL=SUCCEEDED; MODEL={processor.LastSuccessfulModel}; DECISIONS={analysis.Decisions.Count}");
    return 0;
}
catch (HttpRequestException exception)
{
    Console.WriteLine(
        $"SYNTHETIC_GEMINI_CALL=FAILED; ERROR=ProviderHttp; HTTP={(int?)exception.StatusCode}; MESSAGE={exception.Message}");
    return 1;
}
catch (Exception exception)
{
    Console.WriteLine(
        $"SYNTHETIC_GEMINI_CALL=FAILED; ERROR={exception.GetType().Name}; MESSAGE={exception.Message}");
    return 1;
}
