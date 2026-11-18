CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "Tenants" (
        "Id" uuid NOT NULL,
        "EntraTenantId" uuid NOT NULL,
        "TenantCode" character varying(100),
        "DisplayName" character varying(300),
        "Status" character varying(24) NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_Tenants" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "Users" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "EntraObjectId" uuid NOT NULL,
        "Upn" character varying(320),
        "DisplayName" character varying(300),
        "Mail" character varying(320),
        "IsActive" boolean NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_Users" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_Users_Tenants_TenantId" FOREIGN KEY ("TenantId") REFERENCES "Tenants" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "AuditLogs" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "UserAccountId" uuid,
        "EntityType" character varying(200) NOT NULL,
        "EntityId" uuid,
        "Action" character varying(100) NOT NULL,
        "DetailsJson" text NOT NULL,
        "RequestId" character varying(200),
        "SourceIp" character varying(64),
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_AuditLogs" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_AuditLogs_Users_TenantId_UserAccountId" FOREIGN KEY ("TenantId", "UserAccountId") REFERENCES "Users" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "HostProfiles" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "UserAccountId" uuid NOT NULL,
        "PreferredDisplayName" character varying(300),
        "JobTitle" character varying(200),
        "OfficeLocation" character varying(200),
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_HostProfiles" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_HostProfiles_Users_TenantId_UserAccountId" FOREIGN KEY ("TenantId", "UserAccountId") REFERENCES "Users" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "Meetings" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MicrosoftGraphId" character varying(500),
        "Title" character varying(500) NOT NULL,
        "Description" character varying(4000),
        "StartTime" timestamp with time zone,
        "EndTime" timestamp with time zone,
        "OrganizerUserId" uuid,
        "OrganizerEmail" character varying(320),
        "OrganizerName" character varying(300),
        "DepartmentCode" character varying(100),
        "JoinWebUrl" character varying(2048),
        "Status" character varying(32) NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_Meetings" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "CK_Meeting_TimeRange" CHECK ("EndTime" IS NULL OR "StartTime" IS NULL OR "EndTime" > "StartTime"),
        CONSTRAINT "FK_Meetings_Tenants_TenantId" FOREIGN KEY ("TenantId") REFERENCES "Tenants" ("Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_Meetings_Users_TenantId_OrganizerUserId" FOREIGN KEY ("TenantId", "OrganizerUserId") REFERENCES "Users" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "Captures" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "Method" character varying(32) NOT NULL,
        "Status" character varying(24) NOT NULL,
        "SourceReference" character varying(2048),
        "CapturedAt" timestamp with time zone,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_Captures" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_Captures_Meetings_TenantId_MeetingId" FOREIGN KEY ("TenantId", "MeetingId") REFERENCES "Meetings" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "Decisions" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "Text" character varying(4000) NOT NULL,
        "Status" character varying(24) NOT NULL,
        "DecisionType" character varying(32) NOT NULL,
        "ApprovedByUserId" uuid,
        "ApprovedByName" character varying(300),
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_Decisions" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_Decisions_Meetings_TenantId_MeetingId" FOREIGN KEY ("TenantId", "MeetingId") REFERENCES "Meetings" ("TenantId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_Decisions_Users_TenantId_ApprovedByUserId" FOREIGN KEY ("TenantId", "ApprovedByUserId") REFERENCES "Users" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "MeetingReports" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "Title" character varying(500) NOT NULL,
        "ReferenceNumber" character varying(100) NOT NULL,
        "ExecutiveSummary" text NOT NULL,
        "DecisionsAgreed" text NOT NULL,
        "KeyDiscussionPoints" text NOT NULL,
        "StructuredContentJson" text,
        "SharePointDocxUrl" character varying(2048),
        "SharePointFileId" character varying(500),
        "ApprovalStatus" character varying(24) NOT NULL,
        "ValidatedByEmail" character varying(320),
        "ValidatedAt" timestamp with time zone,
        "GeneratedAt" timestamp with time zone NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_MeetingReports" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_MeetingReports_Meetings_TenantId_MeetingId" FOREIGN KEY ("TenantId", "MeetingId") REFERENCES "Meetings" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "Transcripts" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "GraphTranscriptId" character varying(500),
        "ContentFormat" character varying(40) NOT NULL,
        "Language" character varying(20),
        "RetrievalMode" character varying(40) NOT NULL,
        "Status" character varying(24) NOT NULL,
        "RetrievedAt" timestamp with time zone,
        "ParsedAt" timestamp with time zone,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_Transcripts" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "AK_Transcripts_TenantId_Id_MeetingId" UNIQUE ("TenantId", "Id", "MeetingId"),
        CONSTRAINT "FK_Transcripts_Meetings_TenantId_MeetingId" FOREIGN KEY ("TenantId", "MeetingId") REFERENCES "Meetings" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "ActionItems" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "DecisionId" uuid,
        "AssigneeUserId" uuid,
        "Title" character varying(500),
        "Description" character varying(4000) NOT NULL,
        "AssigneeName" character varying(300),
        "AssigneeEmail" character varying(320),
        "DueDate" timestamp with time zone,
        "DeadlineText" character varying(300),
        "Priority" character varying(24) NOT NULL,
        "Status" character varying(24) NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_ActionItems" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_ActionItems_Decisions_TenantId_DecisionId" FOREIGN KEY ("TenantId", "DecisionId") REFERENCES "Decisions" ("TenantId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ActionItems_Meetings_TenantId_MeetingId" FOREIGN KEY ("TenantId", "MeetingId") REFERENCES "Meetings" ("TenantId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ActionItems_Users_TenantId_AssigneeUserId" FOREIGN KEY ("TenantId", "AssigneeUserId") REFERENCES "Users" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "ProcessingRuns" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "TranscriptId" uuid,
        "RequestedByUserId" uuid NOT NULL,
        "IdempotencyKey" character varying(200) NOT NULL,
        "RequestPayloadHash" character varying(64) NOT NULL,
        "SourceContentHash" character varying(64),
        "ParserVersion" character varying(100) NOT NULL,
        "ModelUsed" character varying(200),
        "ErrorMessage" character varying(2000),
        "AnalysisJson" text,
        "Status" character varying(40) NOT NULL,
        "AttemptCount" integer NOT NULL,
        "StartedAt" timestamp with time zone,
        "CompletedAt" timestamp with time zone,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_ProcessingRuns" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "CK_ProcessingRun_AttemptCount" CHECK ("AttemptCount" >= 0),
        CONSTRAINT "CK_ProcessingRun_RequestPayloadHash" CHECK (LENGTH("RequestPayloadHash") = 64),
        CONSTRAINT "FK_ProcessingRuns_Meetings_TenantId_MeetingId" FOREIGN KEY ("TenantId", "MeetingId") REFERENCES "Meetings" ("TenantId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ProcessingRuns_Transcripts_TenantId_TranscriptId_MeetingId" FOREIGN KEY ("TenantId", "TranscriptId", "MeetingId") REFERENCES "Transcripts" ("TenantId", "Id", "MeetingId") ON DELETE RESTRICT,
        CONSTRAINT "FK_ProcessingRuns_Users_TenantId_RequestedByUserId" FOREIGN KEY ("TenantId", "RequestedByUserId") REFERENCES "Users" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "TranscriptRevisions" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "TranscriptId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "RevisionNumber" integer NOT NULL,
        "SourceFormat" character varying(40) NOT NULL,
        "RetrievalMode" character varying(40) NOT NULL,
        "RawContent" text,
        "RawContentReference" character varying(2048),
        "RawSha256" character(64),
        "ContentType" character varying(200),
        "GraphRequestId" character varying(200),
        "RetrievedAt" timestamp with time zone NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_TranscriptRevisions" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "AK_TranscriptRevisions_TenantId_Id_MeetingId" UNIQUE ("TenantId", "Id", "MeetingId"),
        CONSTRAINT "CK_TranscriptRevision_RevisionNumber" CHECK ("RevisionNumber" > 0),
        CONSTRAINT "FK_TranscriptRevisions_Transcripts_TenantId_TranscriptId_Meeti~" FOREIGN KEY ("TenantId", "TranscriptId", "MeetingId") REFERENCES "Transcripts" ("TenantId", "Id", "MeetingId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "ProcessingEvents" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "ProcessingRunId" uuid NOT NULL,
        "AttemptNumber" integer NOT NULL,
        "Stage" character varying(100) NOT NULL,
        "FromStatus" character varying(40),
        "ToStatus" character varying(40) NOT NULL,
        "ErrorCode" character varying(200),
        "GraphErrorCode" character varying(200),
        "HttpStatus" integer,
        "GraphRequestId" character varying(200),
        "RetryAfterSeconds" integer,
        "RedactedMessage" character varying(2000),
        "OccurredAt" timestamp with time zone NOT NULL,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_ProcessingEvents" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "FK_ProcessingEvents_ProcessingRuns_TenantId_ProcessingRunId" FOREIGN KEY ("TenantId", "ProcessingRunId") REFERENCES "ProcessingRuns" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "TranscriptCues" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "TranscriptRevisionId" uuid NOT NULL,
        "SequenceNumber" integer NOT NULL,
        "StartMilliseconds" bigint NOT NULL,
        "EndMilliseconds" bigint,
        "SpeakerName" character varying(300),
        "SpeakerAttribution" character varying(24) NOT NULL,
        "Text" text NOT NULL,
        "NormalizedText" text,
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_TranscriptCues" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "AK_TranscriptCues_TenantId_Id_TranscriptRevisionId" UNIQUE ("TenantId", "Id", "TranscriptRevisionId"),
        CONSTRAINT "CK_TranscriptCue_EndMilliseconds" CHECK ("EndMilliseconds" IS NULL OR "EndMilliseconds" >= "StartMilliseconds"),
        CONSTRAINT "CK_TranscriptCue_SequenceNumber" CHECK ("SequenceNumber" > 0),
        CONSTRAINT "CK_TranscriptCue_StartMilliseconds" CHECK ("StartMilliseconds" >= 0),
        CONSTRAINT "FK_TranscriptCues_TranscriptRevisions_TenantId_TranscriptRevis~" FOREIGN KEY ("TenantId", "TranscriptRevisionId") REFERENCES "TranscriptRevisions" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "SourceEvidence" (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "MeetingId" uuid NOT NULL,
        "TranscriptRevisionId" uuid,
        "TranscriptCueId" uuid,
        "SourceType" character varying(32) NOT NULL,
        "SourceLocator" character varying(2048) NOT NULL,
        "SourceText" character varying(4000),
        "ExcerptHash" character(64),
        "StartMilliseconds" bigint,
        "EndMilliseconds" bigint,
        "ReferenceUri" character varying(2048),
        "CreatedAt" timestamp with time zone NOT NULL,
        "UpdatedAt" timestamp with time zone,
        CONSTRAINT "PK_SourceEvidence" PRIMARY KEY ("TenantId", "Id"),
        CONSTRAINT "CK_SourceEvidence_TranscriptLink" CHECK (("SourceType" = 'TranscriptCue' AND "TranscriptRevisionId" IS NOT NULL AND "TranscriptCueId" IS NOT NULL) OR ("SourceType" <> 'TranscriptCue' AND "TranscriptCueId" IS NULL)),
        CONSTRAINT "FK_SourceEvidence_Meetings_TenantId_MeetingId" FOREIGN KEY ("TenantId", "MeetingId") REFERENCES "Meetings" ("TenantId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_SourceEvidence_TranscriptCues_TenantId_TranscriptCueId_Tran~" FOREIGN KEY ("TenantId", "TranscriptCueId", "TranscriptRevisionId") REFERENCES "TranscriptCues" ("TenantId", "Id", "TranscriptRevisionId") ON DELETE RESTRICT,
        CONSTRAINT "FK_SourceEvidence_TranscriptRevisions_TenantId_TranscriptRevis~" FOREIGN KEY ("TenantId", "TranscriptRevisionId", "MeetingId") REFERENCES "TranscriptRevisions" ("TenantId", "Id", "MeetingId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "ActionEvidence" (
        "TenantId" uuid NOT NULL,
        "ActionItemId" uuid NOT NULL,
        "SourceEvidenceId" uuid NOT NULL,
        CONSTRAINT "PK_ActionEvidence" PRIMARY KEY ("TenantId", "ActionItemId", "SourceEvidenceId"),
        CONSTRAINT "FK_ActionEvidence_ActionItems_TenantId_ActionItemId" FOREIGN KEY ("TenantId", "ActionItemId") REFERENCES "ActionItems" ("TenantId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ActionEvidence_SourceEvidence_TenantId_SourceEvidenceId" FOREIGN KEY ("TenantId", "SourceEvidenceId") REFERENCES "SourceEvidence" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE TABLE "DecisionEvidence" (
        "TenantId" uuid NOT NULL,
        "DecisionId" uuid NOT NULL,
        "SourceEvidenceId" uuid NOT NULL,
        CONSTRAINT "PK_DecisionEvidence" PRIMARY KEY ("TenantId", "DecisionId", "SourceEvidenceId"),
        CONSTRAINT "FK_DecisionEvidence_Decisions_TenantId_DecisionId" FOREIGN KEY ("TenantId", "DecisionId") REFERENCES "Decisions" ("TenantId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_DecisionEvidence_SourceEvidence_TenantId_SourceEvidenceId" FOREIGN KEY ("TenantId", "SourceEvidenceId") REFERENCES "SourceEvidence" ("TenantId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_ActionEvidence_TenantId_SourceEvidenceId" ON "ActionEvidence" ("TenantId", "SourceEvidenceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_ActionItems_TenantId_AssigneeUserId" ON "ActionItems" ("TenantId", "AssigneeUserId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_ActionItems_TenantId_DecisionId" ON "ActionItems" ("TenantId", "DecisionId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_ActionItems_TenantId_MeetingId_Status" ON "ActionItems" ("TenantId", "MeetingId", "Status");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_AuditLogs_TenantId_CreatedAt" ON "AuditLogs" ("TenantId", "CreatedAt");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_AuditLogs_TenantId_UserAccountId" ON "AuditLogs" ("TenantId", "UserAccountId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_Captures_TenantId_MeetingId" ON "Captures" ("TenantId", "MeetingId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_DecisionEvidence_TenantId_SourceEvidenceId" ON "DecisionEvidence" ("TenantId", "SourceEvidenceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_Decisions_TenantId_ApprovedByUserId" ON "Decisions" ("TenantId", "ApprovedByUserId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_Decisions_TenantId_MeetingId" ON "Decisions" ("TenantId", "MeetingId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_HostProfiles_TenantId_UserAccountId" ON "HostProfiles" ("TenantId", "UserAccountId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_MeetingReports_TenantId_MeetingId_GeneratedAt" ON "MeetingReports" ("TenantId", "MeetingId", "GeneratedAt");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_MeetingReports_TenantId_ReferenceNumber" ON "MeetingReports" ("TenantId", "ReferenceNumber");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_Meetings_TenantId_MicrosoftGraphId" ON "Meetings" ("TenantId", "MicrosoftGraphId") WHERE "MicrosoftGraphId" IS NOT NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_Meetings_TenantId_OrganizerUserId" ON "Meetings" ("TenantId", "OrganizerUserId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_Meetings_TenantId_StartTime" ON "Meetings" ("TenantId", "StartTime");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_ProcessingEvents_TenantId_ProcessingRunId_OccurredAt" ON "ProcessingEvents" ("TenantId", "ProcessingRunId", "OccurredAt");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_ProcessingRuns_TenantId_MeetingId_Status" ON "ProcessingRuns" ("TenantId", "MeetingId", "Status");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_ProcessingRuns_TenantId_RequestedByUserId_IdempotencyKey" ON "ProcessingRuns" ("TenantId", "RequestedByUserId", "IdempotencyKey");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_ProcessingRuns_TenantId_TranscriptId_MeetingId" ON "ProcessingRuns" ("TenantId", "TranscriptId", "MeetingId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_ProcessingRuns_TenantId_TranscriptId_ParserVersion" ON "ProcessingRuns" ("TenantId", "TranscriptId", "ParserVersion") WHERE "TranscriptId" IS NOT NULL AND "Status" IN ('Queued', 'ResolvingMeeting', 'DiscoveringTranscript', 'DownloadingTranscript', 'ParsingTranscript', 'ValidatingTranscript', 'PersistingTranscript');
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_SourceEvidence_TenantId_MeetingId_TranscriptRevisionId_Tran~" ON "SourceEvidence" ("TenantId", "MeetingId", "TranscriptRevisionId", "TranscriptCueId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_SourceEvidence_TenantId_TranscriptCueId_TranscriptRevisionId" ON "SourceEvidence" ("TenantId", "TranscriptCueId", "TranscriptRevisionId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_SourceEvidence_TenantId_TranscriptRevisionId_MeetingId" ON "SourceEvidence" ("TenantId", "TranscriptRevisionId", "MeetingId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_Tenants_EntraTenantId" ON "Tenants" ("EntraTenantId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_Tenants_Status" ON "Tenants" ("Status");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_TranscriptCues_TenantId_TranscriptRevisionId_SequenceNumber" ON "TranscriptCues" ("TenantId", "TranscriptRevisionId", "SequenceNumber");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_TranscriptCues_TenantId_TranscriptRevisionId_StartMilliseco~" ON "TranscriptCues" ("TenantId", "TranscriptRevisionId", "StartMilliseconds");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE INDEX "IX_TranscriptRevisions_TenantId_TranscriptId_MeetingId" ON "TranscriptRevisions" ("TenantId", "TranscriptId", "MeetingId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_TranscriptRevisions_TenantId_TranscriptId_RevisionNumber" ON "TranscriptRevisions" ("TenantId", "TranscriptId", "RevisionNumber");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_Transcripts_TenantId_MeetingId_GraphTranscriptId" ON "Transcripts" ("TenantId", "MeetingId", "GraphTranscriptId") WHERE "GraphTranscriptId" IS NOT NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    CREATE UNIQUE INDEX "IX_Users_TenantId_EntraObjectId" ON "Users" ("TenantId", "EntraObjectId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261116140923_InitialPostgres') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261116140923_InitialPostgres', '10.0.13');
    END IF;
END $EF$;
COMMIT;

