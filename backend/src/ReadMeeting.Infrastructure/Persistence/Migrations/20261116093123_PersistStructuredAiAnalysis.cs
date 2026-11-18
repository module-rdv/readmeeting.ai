using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ReadMeeting.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PersistStructuredAiAnalysis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProcessingRuns_Transcripts_TenantId_TranscriptId",
                table: "ProcessingRuns");

            migrationBuilder.DropForeignKey(
                name: "FK_SourceEvidence_TranscriptRevisions_TenantId_TranscriptRevisionId",
                table: "SourceEvidence");

            migrationBuilder.DropForeignKey(
                name: "FK_TranscriptRevisions_Transcripts_TenantId_TranscriptId",
                table: "TranscriptRevisions");

            migrationBuilder.DropIndex(
                name: "IX_SourceEvidence_TenantId_TranscriptRevisionId",
                table: "SourceEvidence");

            migrationBuilder.DropIndex(
                name: "IX_ProcessingRuns_TenantId_TranscriptId",
                table: "ProcessingRuns");

            migrationBuilder.AddColumn<Guid>(
                name: "MeetingId",
                table: "TranscriptRevisions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE revisions
                SET MeetingId = transcripts.MeetingId
                FROM TranscriptRevisions AS revisions
                INNER JOIN Transcripts AS transcripts
                    ON transcripts.TenantId = revisions.TenantId
                    AND transcripts.Id = revisions.TranscriptId;
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "MeetingId",
                table: "TranscriptRevisions",
                type: "uniqueidentifier",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AnalysisJson",
                table: "ProcessingRuns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ErrorMessage",
                table: "ProcessingRuns",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModelUsed",
                table: "ProcessingRuns",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StructuredContentJson",
                table: "MeetingReports",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeadlineText",
                table: "ActionItems",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Transcripts_TenantId_Id_MeetingId",
                table: "Transcripts",
                columns: new[] { "TenantId", "Id", "MeetingId" });

            migrationBuilder.AddUniqueConstraint(
                name: "AK_TranscriptRevisions_TenantId_Id_MeetingId",
                table: "TranscriptRevisions",
                columns: new[] { "TenantId", "Id", "MeetingId" });

            migrationBuilder.CreateIndex(
                name: "IX_TranscriptRevisions_TenantId_TranscriptId_MeetingId",
                table: "TranscriptRevisions",
                columns: new[] { "TenantId", "TranscriptId", "MeetingId" });

            migrationBuilder.CreateIndex(
                name: "IX_SourceEvidence_TenantId_TranscriptRevisionId_MeetingId",
                table: "SourceEvidence",
                columns: new[] { "TenantId", "TranscriptRevisionId", "MeetingId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_SourceEvidence_TranscriptLink",
                table: "SourceEvidence",
                sql: "([SourceType] = 'TranscriptCue' AND [TranscriptRevisionId] IS NOT NULL AND [TranscriptCueId] IS NOT NULL) OR ([SourceType] <> 'TranscriptCue' AND [TranscriptCueId] IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingRuns_TenantId_TranscriptId_MeetingId",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "TranscriptId", "MeetingId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingRuns_TenantId_TranscriptId_ParserVersion",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "TranscriptId", "ParserVersion" },
                unique: true,
                filter: "[TranscriptId] IS NOT NULL AND [Status] IN ('Queued', 'ResolvingMeeting', 'DiscoveringTranscript', 'DownloadingTranscript', 'ParsingTranscript', 'ValidatingTranscript', 'PersistingTranscript')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ProcessingRun_RequestPayloadHash",
                table: "ProcessingRuns",
                sql: "LEN([RequestPayloadHash]) = 64");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Meeting_TimeRange",
                table: "Meetings",
                sql: "[EndTime] IS NULL OR [StartTime] IS NULL OR [EndTime] > [StartTime]");

            migrationBuilder.AddForeignKey(
                name: "FK_ProcessingRuns_Transcripts_TenantId_TranscriptId_MeetingId",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "TranscriptId", "MeetingId" },
                principalTable: "Transcripts",
                principalColumns: new[] { "TenantId", "Id", "MeetingId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SourceEvidence_TranscriptRevisions_TenantId_TranscriptRevisionId_MeetingId",
                table: "SourceEvidence",
                columns: new[] { "TenantId", "TranscriptRevisionId", "MeetingId" },
                principalTable: "TranscriptRevisions",
                principalColumns: new[] { "TenantId", "Id", "MeetingId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TranscriptRevisions_Transcripts_TenantId_TranscriptId_MeetingId",
                table: "TranscriptRevisions",
                columns: new[] { "TenantId", "TranscriptId", "MeetingId" },
                principalTable: "Transcripts",
                principalColumns: new[] { "TenantId", "Id", "MeetingId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProcessingRuns_Transcripts_TenantId_TranscriptId_MeetingId",
                table: "ProcessingRuns");

            migrationBuilder.DropForeignKey(
                name: "FK_SourceEvidence_TranscriptRevisions_TenantId_TranscriptRevisionId_MeetingId",
                table: "SourceEvidence");

            migrationBuilder.DropForeignKey(
                name: "FK_TranscriptRevisions_Transcripts_TenantId_TranscriptId_MeetingId",
                table: "TranscriptRevisions");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_Transcripts_TenantId_Id_MeetingId",
                table: "Transcripts");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_TranscriptRevisions_TenantId_Id_MeetingId",
                table: "TranscriptRevisions");

            migrationBuilder.DropIndex(
                name: "IX_TranscriptRevisions_TenantId_TranscriptId_MeetingId",
                table: "TranscriptRevisions");

            migrationBuilder.DropIndex(
                name: "IX_SourceEvidence_TenantId_TranscriptRevisionId_MeetingId",
                table: "SourceEvidence");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SourceEvidence_TranscriptLink",
                table: "SourceEvidence");

            migrationBuilder.DropIndex(
                name: "IX_ProcessingRuns_TenantId_TranscriptId_MeetingId",
                table: "ProcessingRuns");

            migrationBuilder.DropIndex(
                name: "IX_ProcessingRuns_TenantId_TranscriptId_ParserVersion",
                table: "ProcessingRuns");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ProcessingRun_RequestPayloadHash",
                table: "ProcessingRuns");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Meeting_TimeRange",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "MeetingId",
                table: "TranscriptRevisions");

            migrationBuilder.DropColumn(
                name: "AnalysisJson",
                table: "ProcessingRuns");

            migrationBuilder.DropColumn(
                name: "ErrorMessage",
                table: "ProcessingRuns");

            migrationBuilder.DropColumn(
                name: "ModelUsed",
                table: "ProcessingRuns");

            migrationBuilder.DropColumn(
                name: "StructuredContentJson",
                table: "MeetingReports");

            migrationBuilder.DropColumn(
                name: "DeadlineText",
                table: "ActionItems");

            migrationBuilder.CreateIndex(
                name: "IX_SourceEvidence_TenantId_TranscriptRevisionId",
                table: "SourceEvidence",
                columns: new[] { "TenantId", "TranscriptRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingRuns_TenantId_TranscriptId",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "TranscriptId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ProcessingRuns_Transcripts_TenantId_TranscriptId",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "TranscriptId" },
                principalTable: "Transcripts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SourceEvidence_TranscriptRevisions_TenantId_TranscriptRevisionId",
                table: "SourceEvidence",
                columns: new[] { "TenantId", "TranscriptRevisionId" },
                principalTable: "TranscriptRevisions",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TranscriptRevisions_Transcripts_TenantId_TranscriptId",
                table: "TranscriptRevisions",
                columns: new[] { "TenantId", "TranscriptId" },
                principalTable: "Transcripts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }
    }
}
