using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ReadMeeting.PostgreSqlMigrations.Migrations
{
    /// <inheritdoc />
    public partial class EnforceActionDecisionSameMeeting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ActionItems_Decisions_TenantId_DecisionId",
                table: "ActionItems");

            migrationBuilder.DropIndex(
                name: "IX_ActionItems_TenantId_DecisionId",
                table: "ActionItems");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Decisions_TenantId_Id_MeetingId",
                table: "Decisions",
                columns: new[] { "TenantId", "Id", "MeetingId" });

            migrationBuilder.CreateIndex(
                name: "IX_ActionItems_TenantId_DecisionId_MeetingId",
                table: "ActionItems",
                columns: new[] { "TenantId", "DecisionId", "MeetingId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ActionItems_Decisions_TenantId_DecisionId_MeetingId",
                table: "ActionItems",
                columns: new[] { "TenantId", "DecisionId", "MeetingId" },
                principalTable: "Decisions",
                principalColumns: new[] { "TenantId", "Id", "MeetingId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ActionItems_Decisions_TenantId_DecisionId_MeetingId",
                table: "ActionItems");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_Decisions_TenantId_Id_MeetingId",
                table: "Decisions");

            migrationBuilder.DropIndex(
                name: "IX_ActionItems_TenantId_DecisionId_MeetingId",
                table: "ActionItems");

            migrationBuilder.CreateIndex(
                name: "IX_ActionItems_TenantId_DecisionId",
                table: "ActionItems",
                columns: new[] { "TenantId", "DecisionId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ActionItems_Decisions_TenantId_DecisionId",
                table: "ActionItems",
                columns: new[] { "TenantId", "DecisionId" },
                principalTable: "Decisions",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }
    }
}
