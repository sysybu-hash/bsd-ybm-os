import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OWNER_EMAIL = "sysybu@gmail.com";

async function main() {
  const allOtherUsers = await prisma.user.findMany({
    select: { id: true, email: true },
  });

  const toClient = allOtherUsers.filter(
    (u) => (u.email ?? "").trim().toLowerCase() !== OWNER_EMAIL,
  );

  if (toClient.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: toClient.map((u) => u.id) } },
      data: { role: "CLIENT" },
    });
  }

  await prisma.user.updateMany({
    where: { email: { equals: OWNER_EMAIL, mode: "insensitive" } },
    data: { role: "SUPER_ADMIN" },
  });

  const owner = await prisma.user.findFirst({
    where: { email: { equals: OWNER_EMAIL, mode: "insensitive" } },
    select: { email: true, role: true },
  });

  if (!owner) {
    console.log(
      JSON.stringify(
        {
          updatedToClientCount: toClient.length,
          ownerExists: false,
          finalSuperAdmins: [],
        },
        null,
        2,
      ),
    );
    return;
  }

  if (owner.role !== "SUPER_ADMIN") {
    await prisma.user.updateMany({
      where: { email: { equals: OWNER_EMAIL, mode: "insensitive" } },
      data: { role: "SUPER_ADMIN" },
    });
  }

  const finalSuperAdmins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    select: { email: true },
    orderBy: { email: "asc" },
  });

  console.log(
    JSON.stringify(
      {
        updatedToClientCount: toClient.length,
        ownerExists: true,
        finalSuperAdmins: finalSuperAdmins.map((u) => u.email),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error("enforce-single-owner failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
