using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ReadMeeting.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Tenants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EntraTenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    DisplayName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tenants", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EntraObjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Upn = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: true),
                    DisplayName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Mail = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_Users_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EntityType = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Action = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DetailsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RequestId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    SourceIp = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_AuditLogs_Users_TenantId_UserAccountId",
                        columns: x => new { x.TenantId, x.UserAccountId },
                        principalTable: "Users",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "HostProfiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreferredDisplayName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    JobTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    OfficeLocation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HostProfiles", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_HostProfiles_Users_TenantId_UserAccountId",
                        columns: x => new { x.TenantId, x.UserAccountId },
                        principalTable: "Users",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Meetings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MicrosoftGraphId = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    StartTime = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EndTime = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    OrganizerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OrganizerEmail = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: true),
                    OrganizerName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    DepartmentCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    JoinWebUrl = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Meetings", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_Meetings_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Meetings_Users_TenantId_OrganizerUserId",
                        columns: x => new { x.TenantId, x.OrganizerUserId },
                        principalTable: "Users",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Captures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Method = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    SourceReference = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    CapturedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Captures", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_Captures_Meetings_TenantId_MeetingId",
                        columns: x => new { x.TenantId, x.MeetingId },
                        principalTable: "Meetings",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Decisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    DecisionType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedByName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Decisions", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_Decisions_Meetings_TenantId_MeetingId",
                        columns: x => new { x.TenantId, x.MeetingId },
                        principalTable: "Meetings",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Decisions_Users_TenantId_ApprovedByUserId",
                        columns: x => new { x.TenantId, x.ApprovedByUserId },
                        principalTable: "Users",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MeetingReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ReferenceNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ExecutiveSummary = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DecisionsAgreed = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    KeyDiscussionPoints = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SharePointDocxUrl = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    SharePointFileId = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ApprovalStatus = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ValidatedByEmail = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: true),
                    ValidatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    GeneratedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeetingReports", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_MeetingReports_Meetings_TenantId_MeetingId",
                        columns: x => new { x.TenantId, x.MeetingId },
                        principalTable: "Meetings",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Transcripts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GraphTranscriptId = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ContentFormat = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Language = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    RetrievalMode = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    RetrievedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ParsedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Transcripts", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_Transcripts_Meetings_TenantId_MeetingId",
                        columns: x => new { x.TenantId, x.MeetingId },
                        principalTable: "Meetings",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ActionItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DecisionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AssigneeUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    AssigneeName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    AssigneeEmail = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: true),
                    DueDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Priority = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActionItems", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_ActionItems_Decisions_TenantId_DecisionId",
                        columns: x => new { x.TenantId, x.DecisionId },
                        principalTable: "Decisions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ActionItems_Meetings_TenantId_MeetingId",
                        columns: x => new { x.TenantId, x.MeetingId },
                        principalTable: "Meetings",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ActionItems_Users_TenantId_AssigneeUserId",
                        columns: x => new { x.TenantId, x.AssigneeUserId },
                        principalTable: "Users",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProcessingRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TranscriptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RequestPayloadHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SourceContentHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ParserVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AttemptCount = table.Column<int>(type: "int", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProcessingRuns", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ProcessingRun_AttemptCount", "[AttemptCount] >= 0");
                    table.ForeignKey(
                        name: "FK_ProcessingRuns_Meetings_TenantId_MeetingId",
                        columns: x => new { x.TenantId, x.MeetingId },
                        principalTable: "Meetings",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProcessingRuns_Transcripts_TenantId_TranscriptId",
                        columns: x => new { x.TenantId, x.TranscriptId },
                        principalTable: "Transcripts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProcessingRuns_Users_TenantId_RequestedByUserId",
                        columns: x => new { x.TenantId, x.RequestedByUserId },
                        principalTable: "Users",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TranscriptRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TranscriptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RevisionNumber = table.Column<int>(type: "int", nullable: false),
                    SourceFormat = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    RetrievalMode = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    RawContent = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RawContentReference = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    RawSha256 = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: true),
                    ContentType = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    GraphRequestId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RetrievedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TranscriptRevisions", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_TranscriptRevision_RevisionNumber", "[RevisionNumber] > 0");
                    table.ForeignKey(
                        name: "FK_TranscriptRevisions_Transcripts_TenantId_TranscriptId",
                        columns: x => new { x.TenantId, x.TranscriptId },
                        principalTable: "Transcripts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProcessingEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProcessingRunId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AttemptNumber = table.Column<int>(type: "int", nullable: false),
                    Stage = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FromStatus = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    ToStatus = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ErrorCode = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    GraphErrorCode = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    HttpStatus = table.Column<int>(type: "int", nullable: true),
                    GraphRequestId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RetryAfterSeconds = table.Column<int>(type: "int", nullable: true),
                    RedactedMessage = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProcessingEvents", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_ProcessingEvents_ProcessingRuns_TenantId_ProcessingRunId",
                        columns: x => new { x.TenantId, x.ProcessingRunId },
                        principalTable: "ProcessingRuns",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TranscriptCues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TranscriptRevisionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SequenceNumber = table.Column<int>(type: "int", nullable: false),
                    StartMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    EndMilliseconds = table.Column<long>(type: "bigint", nullable: true),
                    SpeakerName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    SpeakerAttribution = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    NormalizedText = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TranscriptCues", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_TranscriptCues_TenantId_Id_TranscriptRevisionId", x => new { x.TenantId, x.Id, x.TranscriptRevisionId });
                    table.CheckConstraint("CK_TranscriptCue_EndMilliseconds", "[EndMilliseconds] IS NULL OR [EndMilliseconds] >= [StartMilliseconds]");
                    table.CheckConstraint("CK_TranscriptCue_SequenceNumber", "[SequenceNumber] > 0");
                    table.CheckConstraint("CK_TranscriptCue_StartMilliseconds", "[StartMilliseconds] >= 0");
                    table.ForeignKey(
                        name: "FK_TranscriptCues_TranscriptRevisions_TenantId_TranscriptRevisionId",
                        columns: x => new { x.TenantId, x.TranscriptRevisionId },
                        principalTable: "TranscriptRevisions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SourceEvidence",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TranscriptRevisionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TranscriptCueId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SourceType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SourceLocator = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: false),
                    SourceText = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    ExcerptHash = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: true),
                    StartMilliseconds = table.Column<long>(type: "bigint", nullable: true),
                    EndMilliseconds = table.Column<long>(type: "bigint", nullable: true),
                    ReferenceUri = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SourceEvidence", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SourceEvidence_Meetings_TenantId_MeetingId",
                        columns: x => new { x.TenantId, x.MeetingId },
                        principalTable: "Meetings",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SourceEvidence_TranscriptCues_TenantId_TranscriptCueId_TranscriptRevisionId",
                        columns: x => new { x.TenantId, x.TranscriptCueId, x.TranscriptRevisionId },
                        principalTable: "TranscriptCues",
                        principalColumns: new[] { "TenantId", "Id", "TranscriptRevisionId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SourceEvidence_TranscriptRevisions_TenantId_TranscriptRevisionId",
                        columns: x => new { x.TenantId, x.TranscriptRevisionId },
                        principalTable: "TranscriptRevisions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ActionEvidence",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActionItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceEvidenceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActionEvidence", x => new { x.TenantId, x.ActionItemId, x.SourceEvidenceId });
                    table.ForeignKey(
                        name: "FK_ActionEvidence_ActionItems_TenantId_ActionItemId",
                        columns: x => new { x.TenantId, x.ActionItemId },
                        principalTable: "ActionItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ActionEvidence_SourceEvidence_TenantId_SourceEvidenceId",
                        columns: x => new { x.TenantId, x.SourceEvidenceId },
                        principalTable: "SourceEvidence",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DecisionEvidence",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DecisionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceEvidenceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DecisionEvidence", x => new { x.TenantId, x.DecisionId, x.SourceEvidenceId });
                    table.ForeignKey(
                        name: "FK_DecisionEvidence_Decisions_TenantId_DecisionId",
                        columns: x => new { x.TenantId, x.DecisionId },
                        principalTable: "Decisions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DecisionEvidence_SourceEvidence_TenantId_SourceEvidenceId",
                        columns: x => new { x.TenantId, x.SourceEvidenceId },
                        principalTable: "SourceEvidence",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActionEvidence_TenantId_SourceEvidenceId",
                table: "ActionEvidence",
                columns: new[] { "TenantId", "SourceEvidenceId" });

            migrationBuilder.CreateIndex(
                name: "IX_ActionItems_TenantId_AssigneeUserId",
                table: "ActionItems",
                columns: new[] { "TenantId", "AssigneeUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ActionItems_TenantId_DecisionId",
                table: "ActionItems",
                columns: new[] { "TenantId", "DecisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_ActionItems_TenantId_MeetingId_Status",
                table: "ActionItems",
                columns: new[] { "TenantId", "MeetingId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_TenantId_CreatedAt",
                table: "AuditLogs",
                columns: new[] { "TenantId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_TenantId_UserAccountId",
                table: "AuditLogs",
                columns: new[] { "TenantId", "UserAccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_Captures_TenantId_MeetingId",
                table: "Captures",
                columns: new[] { "TenantId", "MeetingId" });

            migrationBuilder.CreateIndex(
                name: "IX_DecisionEvidence_TenantId_SourceEvidenceId",
                table: "DecisionEvidence",
                columns: new[] { "TenantId", "SourceEvidenceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Decisions_TenantId_ApprovedByUserId",
                table: "Decisions",
                columns: new[] { "TenantId", "ApprovedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_Decisions_TenantId_MeetingId",
                table: "Decisions",
                columns: new[] { "TenantId", "MeetingId" });

            migrationBuilder.CreateIndex(
                name: "IX_HostProfiles_TenantId_UserAccountId",
                table: "HostProfiles",
                columns: new[] { "TenantId", "UserAccountId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MeetingReports_TenantId_MeetingId_GeneratedAt",
                table: "MeetingReports",
                columns: new[] { "TenantId", "MeetingId", "GeneratedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MeetingReports_TenantId_ReferenceNumber",
                table: "MeetingReports",
                columns: new[] { "TenantId", "ReferenceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Meetings_TenantId_MicrosoftGraphId",
                table: "Meetings",
                columns: new[] { "TenantId", "MicrosoftGraphId" },
                unique: true,
                filter: "[MicrosoftGraphId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Meetings_TenantId_OrganizerUserId",
                table: "Meetings",
                columns: new[] { "TenantId", "OrganizerUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_Meetings_TenantId_StartTime",
                table: "Meetings",
                columns: new[] { "TenantId", "StartTime" });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingEvents_TenantId_ProcessingRunId_OccurredAt",
                table: "ProcessingEvents",
                columns: new[] { "TenantId", "ProcessingRunId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingRuns_TenantId_MeetingId_Status",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "MeetingId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingRuns_TenantId_RequestedByUserId_IdempotencyKey",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "RequestedByUserId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProcessingRuns_TenantId_TranscriptId",
                table: "ProcessingRuns",
                columns: new[] { "TenantId", "TranscriptId" });

            migrationBuilder.CreateIndex(
                name: "IX_SourceEvidence_TenantId_MeetingId_TranscriptRevisionId_TranscriptCueId",
                table: "SourceEvidence",
                columns: new[] { "TenantId", "MeetingId", "TranscriptRevisionId", "TranscriptCueId" });

            migrationBuilder.CreateIndex(
                name: "IX_SourceEvidence_TenantId_TranscriptCueId_TranscriptRevisionId",
                table: "SourceEvidence",
                columns: new[] { "TenantId", "TranscriptCueId", "TranscriptRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_SourceEvidence_TenantId_TranscriptRevisionId",
                table: "SourceEvidence",
                columns: new[] { "TenantId", "TranscriptRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_EntraTenantId",
                table: "Tenants",
                column: "EntraTenantId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_Status",
                table: "Tenants",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_TranscriptCues_TenantId_TranscriptRevisionId_SequenceNumber",
                table: "TranscriptCues",
                columns: new[] { "TenantId", "TranscriptRevisionId", "SequenceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TranscriptCues_TenantId_TranscriptRevisionId_StartMilliseconds",
                table: "TranscriptCues",
                columns: new[] { "TenantId", "TranscriptRevisionId", "StartMilliseconds" });

            migrationBuilder.CreateIndex(
                name: "IX_TranscriptRevisions_TenantId_TranscriptId_RevisionNumber",
                table: "TranscriptRevisions",
                columns: new[] { "TenantId", "TranscriptId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Transcripts_TenantId_MeetingId_GraphTranscriptId",
                table: "Transcripts",
                columns: new[] { "TenantId", "MeetingId", "GraphTranscriptId" },
                unique: true,
                filter: "[GraphTranscriptId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Users_TenantId_EntraObjectId",
                table: "Users",
                columns: new[] { "TenantId", "EntraObjectId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActionEvidence");

            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "Captures");

            migrationBuilder.DropTable(
                name: "DecisionEvidence");

            migrationBuilder.DropTable(
                name: "HostProfiles");

            migrationBuilder.DropTable(
                name: "MeetingReports");

            migrationBuilder.DropTable(
                name: "ProcessingEvents");

            migrationBuilder.DropTable(
                name: "ActionItems");

            migrationBuilder.DropTable(
                name: "SourceEvidence");

            migrationBuilder.DropTable(
                name: "ProcessingRuns");

            migrationBuilder.DropTable(
                name: "Decisions");

            migrationBuilder.DropTable(
                name: "TranscriptCues");

            migrationBuilder.DropTable(
                name: "TranscriptRevisions");

            migrationBuilder.DropTable(
                name: "Transcripts");

            migrationBuilder.DropTable(
                name: "Meetings");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Tenants");
        }
    }
}
