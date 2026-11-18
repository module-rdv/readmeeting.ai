using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ReadMeeting.PostgreSqlMigrations.Migrations
{
    /// <inheritdoc />
    public partial class AddSharePointPublicationMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SharePointDriveId",
                table: "MeetingReports",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SharePointFolderId",
                table: "MeetingReports",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SharePointPublicationError",
                table: "MeetingReports",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SharePointPublishedAt",
                table: "MeetingReports",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SharePointPublishedBy",
                table: "MeetingReports",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SharePointVersion",
                table: "MeetingReports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SharePointDriveId",
                table: "MeetingReports");

            migrationBuilder.DropColumn(
                name: "SharePointFolderId",
                table: "MeetingReports");

            migrationBuilder.DropColumn(
                name: "SharePointPublicationError",
                table: "MeetingReports");

            migrationBuilder.DropColumn(
                name: "SharePointPublishedAt",
                table: "MeetingReports");

            migrationBuilder.DropColumn(
                name: "SharePointPublishedBy",
                table: "MeetingReports");

            migrationBuilder.DropColumn(
                name: "SharePointVersion",
                table: "MeetingReports");
        }
    }
}
