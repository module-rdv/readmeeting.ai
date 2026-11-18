using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using ReadMeeting.Domain.Entities;

namespace ReadMeeting.Infrastructure.SharePoint;

public static class DocxReportGenerator
{
    private static readonly XNamespace Word =
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    public static byte[] Generate(MeetingReport report, Meeting meeting)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            XNamespace contentTypes = "http://schemas.openxmlformats.org/package/2006/content-types";
            WriteXml(archive, "[Content_Types].xml", new XDocument(
                new XElement(contentTypes + "Types",
                    new XElement(contentTypes + "Default", new XAttribute("Extension", "rels"),
                        new XAttribute("ContentType", "application/vnd.openxmlformats-package.relationships+xml")),
                    new XElement(contentTypes + "Default", new XAttribute("Extension", "xml"),
                        new XAttribute("ContentType", "application/xml")),
                    new XElement(contentTypes + "Override", new XAttribute("PartName", "/word/document.xml"),
                        new XAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")))));

            XNamespace relationships = "http://schemas.openxmlformats.org/package/2006/relationships";
            WriteXml(archive, "_rels/.rels", new XDocument(
                new XElement(relationships + "Relationships",
                    new XElement(relationships + "Relationship",
                        new XAttribute("Id", "rId1"),
                        new XAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"),
                        new XAttribute("Target", "word/document.xml")))));

            var sections = ReadStructuredContent(report.StructuredContentJson);
            var paragraphs = new List<XElement>
            {
                Paragraph("Direction Générale des Financements", bold: true, fontSize: 28, after: 120),
                Paragraph("COMPTE RENDU DE RÉUNION", bold: true, fontSize: 24, after: 220),
                Paragraph(report.Title, bold: true, fontSize: 22, after: 180),
                Paragraph($"Référence : {report.ReferenceNumber}", bold: true),
                Paragraph($"Réunion : {meeting.Title}"),
                Paragraph($"Date : {FormatDate(meeting.StartTime)}"),
                Paragraph($"Organisateur : {FirstAvailable(meeting.OrganizerName, meeting.OrganizerEmail)}"),
                Heading("Objet"),
                Paragraph(FirstAvailable(meeting.Description, FindSection(sections, "object", "objet"))),
                Heading("Participants connus"),
                Paragraph(FindSection(sections, "participants", "participantsKnown", "attendees")),
                Heading("Synthèse"),
                Paragraph(report.ExecutiveSummary),
                Heading("Points abordés"),
                Paragraph(report.KeyDiscussionPoints),
                Heading("Propositions"),
                Paragraph(FindSection(sections, "proposals", "propositions")),
                Heading("Décisions confirmées"),
                Paragraph(report.DecisionsAgreed),
                Heading("Actions"),
                Paragraph(FindSection(sections, "actions", "actionItems")),
                Heading("Risques et réserves"),
                Paragraph(FindSection(sections, "risks", "reservations")),
                Heading("Points restant à clarifier"),
                Paragraph(FindSection(sections, "openQuestions", "clarifications", "questions")),
                Heading("Traçabilité"),
                Paragraph($"Compte rendu : {report.ReferenceNumber}"),
                Paragraph($"Généré le : {FormatDate(report.GeneratedAt)}"),
                Paragraph($"Approuvé par : {FirstAvailable(report.ValidatedByEmail)}"),
                Paragraph($"Approuvé le : {FormatDate(report.ValidatedAt)}")
            };

            var document = new XDocument(
                new XElement(Word + "document",
                    new XAttribute(XNamespace.Xmlns + "w", Word),
                    new XElement(Word + "body",
                        paragraphs,
                        new XElement(Word + "sectPr",
                            new XElement(Word + "pgSz",
                                new XAttribute(Word + "w", "11906"),
                                new XAttribute(Word + "h", "16838")),
                            new XElement(Word + "pgMar",
                                new XAttribute(Word + "top", "1440"),
                                new XAttribute(Word + "right", "1440"),
                                new XAttribute(Word + "bottom", "1440"),
                                new XAttribute(Word + "left", "1440"))))));
            WriteXml(archive, "word/document.xml", document);
        }

        return output.ToArray();
    }

    private static XElement Heading(string text) =>
        Paragraph(text, bold: true, fontSize: 22, before: 180, after: 80);

    private static XElement Paragraph(
        string? text,
        bool bold = false,
        int? fontSize = null,
        int before = 0,
        int after = 40)
    {
        var properties = new XElement(Word + "pPr");
        if (before != 0 || after != 0)
        {
            properties.Add(new XElement(Word + "spacing",
                new XAttribute(Word + "before", before),
                new XAttribute(Word + "after", after)));
        }

        var runProperties = new XElement(Word + "rPr");
        if (bold) runProperties.Add(new XElement(Word + "b"));
        if (fontSize.HasValue) runProperties.Add(new XElement(Word + "sz", new XAttribute(Word + "val", fontSize.Value)));
        return new XElement(Word + "p",
            properties,
            new XElement(Word + "r",
                runProperties,
                new XElement(Word + "t",
                    new XAttribute(XNamespace.Xml + "space", "preserve"),
                    string.IsNullOrWhiteSpace(text) ? "Non renseigné dans le compte rendu approuvé." : text.Trim())));
    }

    private static string FormatDate(DateTimeOffset? value) =>
        value?.ToUniversalTime().ToString("dd/MM/yyyy HH:mm 'UTC'", System.Globalization.CultureInfo.InvariantCulture)
        ?? "Non renseignée";

    private static string FirstAvailable(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim()
        ?? "Non renseigné dans le compte rendu approuvé.";

    private static Dictionary<string, string> ReadStructuredContent(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var document = JsonDocument.Parse(json);
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            Flatten(document.RootElement, values);
            return values;
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException(
                "Structured content on the approved report is not valid JSON.",
                exception);
        }
    }

    private static void Flatten(JsonElement element, IDictionary<string, string> values)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                var formatted = FormatValue(property.Value);
                if (!string.IsNullOrWhiteSpace(formatted) && !values.ContainsKey(property.Name))
                {
                    values[property.Name] = formatted;
                }
                Flatten(property.Value, values);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray()) Flatten(item, values);
        }
    }

    private static string? FindSection(
        IReadOnlyDictionary<string, string> values,
        params string[] aliases)
    {
        foreach (var alias in aliases)
        {
            var match = values.FirstOrDefault(item =>
                string.Equals(NormalizeKey(item.Key), NormalizeKey(alias), StringComparison.Ordinal));
            if (!string.IsNullOrWhiteSpace(match.Value)) return match.Value;
        }
        return null;
    }

    private static string NormalizeKey(string value) =>
        new(value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());

    private static string? FormatValue(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False => element.ToString(),
            JsonValueKind.Array => string.Join(Environment.NewLine,
                element.EnumerateArray().Select(FormatValue).Where(value => !string.IsNullOrWhiteSpace(value))),
            JsonValueKind.Object => string.Join(Environment.NewLine,
                element.EnumerateObject()
                    .Select(property => $"{property.Name}: {FormatValue(property.Value)}")
                    .Where(value => !value.EndsWith(": ", StringComparison.Ordinal))),
            _ => null
        };

    private static void WriteXml(ZipArchive archive, string name, XDocument document)
    {
        var entry = archive.CreateEntry(name, CompressionLevel.Optimal);
        using var stream = entry.Open();
        using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        document.Save(writer, SaveOptions.DisableFormatting);
    }
}
