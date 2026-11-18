using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.Json;
using Microsoft.Extensions.Configuration.UserSecrets;
using Npgsql;

[assembly: UserSecretsId("2b408f10-afd5-4484-9b08-2be0e77ffae2")]

const string caPath = "/home/leonce/.postgresql/ca.pem";
const string connectionName = "DefaultConnection";

if (args.Contains("--verify", StringComparer.Ordinal))
{
    return VerifyUserSecrets();
}

if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") != "Development")
{
    Console.Error.WriteLine("Exécutez cet outil avec ASPNETCORE_ENVIRONMENT=Development.");
    return 1;
}

if (!File.Exists(caPath))
{
    Console.Error.WriteLine("Le certificat CA configuré est absent.");
    return 1;
}

try
{
    await using var caFile = File.OpenRead(caPath);
    if (caFile.Length == 0)
    {
        Console.Error.WriteLine("Le certificat CA configuré est vide.");
        return 1;
    }
}
catch (Exception error) when (error is IOException or UnauthorizedAccessException)
{
    Console.Error.WriteLine("Le certificat CA configuré n'est pas accessible.");
    return 1;
}

var host = Prompt("Host Aiven");
var portText = Prompt("Port Aiven");
var database = Prompt("Database Aiven");
var username = Prompt("Username Aiven");
var password = PromptSecret("Password Aiven");

if (string.IsNullOrWhiteSpace(host)
    || !int.TryParse(portText, out var port)
    || port is < 1 or > 65535
    || string.IsNullOrWhiteSpace(database)
    || string.IsNullOrWhiteSpace(username)
    || string.IsNullOrEmpty(password))
{
    Console.Error.WriteLine("Configuration refusée : un champ requis est vide ou le port est invalide.");
    return 1;
}

var connectionString = new NpgsqlConnectionStringBuilder
{
    Host = host.Trim(),
    Port = port,
    Database = database.Trim(),
    Username = username.Trim(),
    Password = password,
    SslMode = SslMode.VerifyFull,
    RootCertificate = caPath,
}.ConnectionString;

var userSecretsBuilder = new ConfigurationBuilder()
    .AddUserSecrets(Assembly.GetExecutingAssembly(), optional: true);
_ = userSecretsBuilder.Build();
var secretSource = userSecretsBuilder.Sources
    .OfType<JsonConfigurationSource>()
    .LastOrDefault(source => source.Path?.EndsWith("secrets.json", StringComparison.OrdinalIgnoreCase) == true);
var secretsPath = secretSource?.Path;
if (!string.IsNullOrWhiteSpace(secretsPath) && !Path.IsPathRooted(secretsPath))
{
    secretsPath = secretSource?.FileProvider?.GetFileInfo(secretsPath).PhysicalPath
        ?? Path.GetFullPath(secretsPath);
}
if (string.IsNullOrWhiteSpace(secretsPath))
{
    Console.Error.WriteLine("Impossible de déterminer l'emplacement local des User Secrets.");
    return 1;
}

var secrets = File.Exists(secretsPath)
    ? JsonNode.Parse(await File.ReadAllTextAsync(secretsPath)) as JsonObject
    : new JsonObject();
if (secrets is null)
{
    Console.Error.WriteLine("Le fichier User Secrets n'est pas un objet JSON valide; aucun changement effectué.");
    return 1;
}

var connectionStrings = secrets["ConnectionStrings"] as JsonObject;
if (secrets["ConnectionStrings"] is not null && connectionStrings is null)
{
    Console.Error.WriteLine("La section ConnectionStrings existante n'est pas modifiable; aucun changement effectué.");
    return 1;
}

secrets.Remove("ConnectionStrings:DefaultConnection");
connectionStrings ??= new JsonObject();
secrets["ConnectionStrings"] = connectionStrings;
connectionStrings[connectionName] = connectionString;

var directory = Path.GetDirectoryName(secretsPath);
if (string.IsNullOrWhiteSpace(directory))
{
    Console.Error.WriteLine("Impossible de déterminer le répertoire User Secrets; aucun changement effectué.");
    return 1;
}

Directory.CreateDirectory(directory);
var temporaryPath = Path.Combine(directory, $".secrets-{Guid.NewGuid():N}.tmp");
try
{
    var fileOptions = new FileStreamOptions
    {
        Mode = FileMode.CreateNew,
        Access = FileAccess.Write,
        Share = FileShare.None,
        Options = FileOptions.Asynchronous,
    };
    if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
    {
        fileOptions.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
    }

    await using (var output = new FileStream(temporaryPath, fileOptions))
    {
        await JsonSerializer.SerializeAsync(
            output,
            secrets,
            new JsonSerializerOptions { WriteIndented = true });
        await output.FlushAsync();
    }
    File.Move(temporaryPath, secretsPath, overwrite: true);
    SetUserOnlyPermissions(secretsPath);
}
catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
{
    if (File.Exists(temporaryPath))
    {
        File.Delete(temporaryPath);
    }

    Console.Error.WriteLine($"Échec d'écriture du fichier User Secrets ({error.GetType().Name}); aucune valeur n'a été affichée.");
    return 1;
}

var reloaded = new ConfigurationBuilder()
    .AddUserSecrets(Assembly.GetExecutingAssembly(), optional: false)
    .Build();
var savedConnectionString = reloaded.GetConnectionString(connectionName);
if (string.IsNullOrWhiteSpace(savedConnectionString))
{
    Console.Error.WriteLine("Écriture effectuée, mais relecture de la clé impossible.");
    return 1;
}

var saved = new NpgsqlConnectionStringBuilder(savedConnectionString);
var complete = !string.IsNullOrWhiteSpace(saved.Host)
    && saved.Port == port
    && !string.IsNullOrWhiteSpace(saved.Database)
    && !string.IsNullOrWhiteSpace(saved.Username)
    && !string.IsNullOrWhiteSpace(saved.Password)
    && saved.SslMode == SslMode.VerifyFull
    && string.Equals(saved.RootCertificate, caPath, StringComparison.Ordinal);

Console.WriteLine($"User Secrets de l'API mis à jour: {complete}");
Console.WriteLine($"Clé: ConnectionStrings:{connectionName}");
Console.WriteLine($"Mode TLS: {saved.SslMode}");
Console.WriteLine($"Certificat CA configuré: {string.Equals(saved.RootCertificate, caPath, StringComparison.Ordinal)}");
Console.WriteLine("Aucune valeur de connexion n'a été affichée.");
return complete ? 0 : 1;

static string Prompt(string label)
{
    Console.Write($"{label}: ");
    return Console.ReadLine() ?? string.Empty;
}

static string PromptSecret(string label)
{
    if (Console.IsInputRedirected)
    {
        throw new InvalidOperationException("L'outil doit être exécuté dans un terminal interactif.");
    }

    Console.Write($"{label} (saisie masquée): ");
    var secret = new List<char>();
    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter)
        {
            Console.WriteLine();
            return new string(secret.ToArray());
        }

        if (key.Key == ConsoleKey.Backspace)
        {
            if (secret.Count > 0)
            {
                secret.RemoveAt(secret.Count - 1);
            }
            continue;
        }

        if (!char.IsControl(key.KeyChar))
        {
            secret.Add(key.KeyChar);
        }
    }

}

static void SetUserOnlyPermissions(string path)
{
    if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
    {
        File.SetUnixFileMode(
            path,
            UnixFileMode.UserRead | UnixFileMode.UserWrite);
    }
}

static int VerifyUserSecrets()
{
    if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") != "Development")
    {
        Console.Error.WriteLine("Exécutez la vérification avec ASPNETCORE_ENVIRONMENT=Development.");
        return 1;
    }

    try
    {
        var configuration = new ConfigurationBuilder()
            .AddUserSecrets(Assembly.GetExecutingAssembly(), optional: false)
            .Build();
        var connectionString = configuration.GetConnectionString(connectionName);
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            Console.WriteLine("User Secrets chargés: clé absente.");
            return 1;
        }

        var settings = new NpgsqlConnectionStringBuilder(connectionString);
        var complete = !string.IsNullOrWhiteSpace(settings.Host)
            && settings.Port is > 0 and <= 65535
            && !string.IsNullOrWhiteSpace(settings.Database)
            && !string.IsNullOrWhiteSpace(settings.Username)
            && !string.IsNullOrWhiteSpace(settings.Password);
        var caReadable = settings.RootCertificate == caPath && File.Exists(caPath);

        Console.WriteLine("User Secrets chargés: oui.");
        Console.WriteLine($"Champs de connexion présents: {complete}.");
        Console.WriteLine($"SSL VerifyFull: {settings.SslMode == SslMode.VerifyFull}.");
        Console.WriteLine($"Chemin CA configuré et présent: {caReadable}.");
        Console.WriteLine("Aucune valeur de connexion n'a été affichée.");
        return complete && settings.SslMode == SslMode.VerifyFull && caReadable ? 0 : 1;
    }
    catch (Exception error) when (error is FormatException or ArgumentException or IOException)
    {
        Console.Error.WriteLine($"Vérification User Secrets échouée ({error.GetType().Name}); aucune valeur n'a été affichée.");
        return 1;
    }
}
