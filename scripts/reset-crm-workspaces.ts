/**
 * One-shot script: Delete ALL CRM tenant workspace mappings and their workspaces,
 * then provision a single tenant.
 *
 * Usage (from crm-bot root, on Node C):
 *   DATABASE_URL=<...> npx tsx scripts/reset-and-provision.ts
 *
 * Or via the internal API from local:
 *   See bottom of file for curl examples.
 */

import prisma from "@typebot.io/prisma";

async function main() {
  console.log("=== Fetching all CRM workspace mappings ===");

  const mappings = (await prisma.$queryRaw`
    SELECT "id", "tenantId", "workspaceId", "ownerEmail"
    FROM "CrmTenantWorkspaceMapping"
  `) as { id: string; tenantId: string; workspaceId: string; ownerEmail: string }[];

  console.log(`Found ${mappings.length} mappings:`);
  for (const m of mappings) {
    console.log(`  tenant=${m.tenantId} workspace=${m.workspaceId} email=${m.ownerEmail}`);
  }

  if (mappings.length === 0) {
    console.log("No mappings to delete.");
  } else {
    for (const m of mappings) {
      console.log(`\n--- Deleting tenant ${m.tenantId} / workspace ${m.workspaceId} ---`);

      // Delete channel flow bindings
      await prisma.$executeRaw`
        DELETE FROM "CrmChannelFlowBinding" WHERE "tenantId" = ${m.tenantId}
      `;

      // Delete published typebots
      await prisma.publicTypebot.deleteMany({
        where: { typebot: { workspaceId: m.workspaceId } },
      });

      // Delete results + answers
      const typebots = await prisma.typebot.findMany({
        where: { workspaceId: m.workspaceId },
        select: { id: true },
      });
      for (const t of typebots) {
        await prisma.answer.deleteMany({ where: { result: { typebotId: t.id } } });
        await prisma.answerV2.deleteMany({ where: { result: { typebotId: t.id } } });
        await prisma.result.deleteMany({ where: { typebotId: t.id } });
      }

      // Delete typebots
      await prisma.typebot.deleteMany({ where: { workspaceId: m.workspaceId } });

      // Delete folders
      await prisma.dashboardFolder.deleteMany({ where: { workspaceId: m.workspaceId } });

      // Delete members
      await prisma.memberInWorkspace.deleteMany({ where: { workspaceId: m.workspaceId } });

      // Delete workspace
      await prisma.workspace.deleteMany({ where: { id: m.workspaceId } });

      // Delete mapping
      await prisma.$executeRaw`
        DELETE FROM "CrmTenantWorkspaceMapping" WHERE "id" = ${m.id}
      `;

      console.log(`  ✓ Deleted workspace ${m.workspaceId}`);
    }
  }

  // Clean up orphan users created by provisioning (optional)
  console.log("\n=== Cleanup complete ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
