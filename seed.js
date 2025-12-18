import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@lavepropre.ca";
  const supEmail = "sup@lavepropre.ca";
  const empEmail = "employe1@lavepropre.ca";

  const adminPass = await bcrypt.hash("Admin!1234", 10);
  const supPass = await bcrypt.hash("Supervisor!1234", 10);
  const empPass = await bcrypt.hash("Employe!1234", 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      role: "ADMIN",
      name: "Admin Lave Propre",
      email: adminEmail,
      phone: "873 682 2117",
      password: adminPass,
      employmentType: "Admin",
      hourlyRate: 0,
      active: true,
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: supEmail },
    update: {},
    create: {
      role: "SUPERVISOR",
      name: "Superviseur",
      email: supEmail,
      password: supPass,
      employmentType: "Superviseur",
      hourlyRate: 0,
      active: true,
    },
  });

  const emp = await prisma.user.upsert({
    where: { email: empEmail },
    update: {},
    create: {
      role: "EMPLOYEE",
      name: "Employé(e) 1",
      email: empEmail,
      password: empPass,
      employmentType: "Temps partiel",
      hourlyRate: 2200, // 22$/h
      active: true,
    },
  });

  const site1 = await prisma.site.upsert({
    where: { name: "AMECCI (Bureaux + Usine)" },
    update: {},
    create: {
      name: "AMECCI (Bureaux + Usine)",
      city: "Sherbrooke",
      frequency: "Hebdomadaire",
      defaultDurationMin: 180,
      notes: "Contrat récurrent — 3h",
    },
  });

  const site2 = await prisma.site.upsert({
    where: { name: "Client Résidentiel (Exemple)" },
    update: {},
    create: {
      name: "Client Résidentiel (Exemple)",
      city: "Sherbrooke",
      frequency: "Aux 2 semaines",
      defaultDurationMin: 150,
      notes: "Résidentiel — rotation",
    },
  });

  // Access: supervisor can manage site1 only
  await prisma.siteAccess.upsert({
    where: { userId_siteId: { userId: supervisor.id, siteId: site1.id } },
    update: {},
    create: { userId: supervisor.id, siteId: site1.id },
  });

  // Shifts
  await prisma.shift.createMany({
    data: [
      { dayOfWeek: 1, startMin: 17*60, endMin: 20*60, checklist: "Contrat 3h — AMECCI", status: "PLANNED", userId: emp.id, siteId: site1.id },
      { dayOfWeek: 3, startMin: 9*60, endMin: 11*60+30, checklist: "Résidentiel — standard", status: "PLANNED", userId: emp.id, siteId: site2.id },
      { dayOfWeek: 5, startMin: 17*60, endMin: 20*60, checklist: "Contrat 3h — AMECCI", status: "CONFIRMED", userId: emp.id, siteId: site1.id },
    ],
    skipDuplicates: true,
  });

  console.log("Seed OK:", { admin: admin.email, supervisor: supervisor.email, employee: emp.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
