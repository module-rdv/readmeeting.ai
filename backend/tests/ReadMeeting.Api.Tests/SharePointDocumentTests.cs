using System.IO.Compression;
using System.Xml.Linq;
using ReadMeeting.Domain.Entities;
using ReadMeeting.Infrastructure.SharePoint;

namespace ReadMeeting.Api.Tests;

public sealed class SharePointDocumentTests
{
    [Fact]
    public void Approved_report_is_written_as_a_valid_docx_using_only_saved_report_data()
    {
        var report = new MeetingReport
        {
            Title = "Revue budgétaire",
            ReferenceNumber = "CR-DGF-2026-001",
            ExecutiveSummary = "Synthèse approuvée.",
            DecisionsAgreed = "Décision approuvée.",
            KeyDiscussionPoints = "Point consigné.",
            StructuredContentJson = """
                {
                  "participants": ["Personne mentionnée"],
                  "proposals": ["Proposition enregistrée"],
                  "risks": ["Risque consigné"]
                }
                """,
            ValidatedByEmail = "validator@example.test",
            ValidatedAt = new DateTimeOffset(2026, 11, 18, 12, 0, 0, TimeSpan.Zero),
            GeneratedAt = new DateTimeOffset(2026, 11, 18, 11, 0, 0, TimeSpan.Zero)
        };
        var meeting = new Meeting
        {
            Title = "Comité de suivi",
            Description = "Objet de réunion enregistré.",
            StartTime = new DateTimeOffset(2026, 11, 18, 10, 0, 0, TimeSpan.Zero),
            OrganizerName = "Organisateur enregistré"
        };

        var bytes = DocxReportGenerator.Generate(report, meeting);
        using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        var documentEntry = archive.GetEntry("word/document.xml");
        Assert.NotNull(documentEntry);

        using var documentStream = documentEntry.Open();
        var document = XDocument.Load(documentStream);
        XNamespace word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        var text = string.Join(
            "\n",
            document.Descendants(word + "t").Select(element => element.Value));

        Assert.Contains("Direction Générale des Financements", text);
        Assert.Contains("Revue budgétaire", text);
        Assert.Contains("Synthèse approuvée.", text);
        Assert.Contains("Personne mentionnée", text);
        Assert.Contains("Proposition enregistrée", text);
        Assert.Contains("Risque consigné", text);
        Assert.Contains("validator@example.test", text);
        Assert.Contains("Non renseigné dans le compte rendu approuvé.", text);
        Assert.DoesNotContain("décision fictive", text, StringComparison.OrdinalIgnoreCase);
    }
}
