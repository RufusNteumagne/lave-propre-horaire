import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { signToken, comparePassword } from "./lib/auth.js";
import { requireAuth, requireAnyRole } from "./middleware/auth.js";
import { loginSchema, createShiftSchema } from "./validation.js";
import { toCsv } from "./lib/csv.js";
import { notifyEmail } from "./lib/notify.js";

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (req, res) => res.json({ ok: true }));

/** AUTH */
app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await comparePassword(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken({ userId: user.id, role: user.role }, process.env.JWT_SECRET);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active },
  });
});

/** SITES */
app.get("/sites", requireAuth, async (req, res) => {
  const sites = await prisma.site.findMany({ orderBy: { createdAt: "desc" } });
  res.json(sites);
});

/** USERS (Admin/Supervisor read; only Admin should edit in prod) */
app.get("/users", requireAuth, requireAnyRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, phone: true, role: true, active: true, employmentType: true, hourlyRate: true },
  });
  res.json(users);
});

/** ACCESS (Admin) */
app.get("/access", requireAuth, requireAnyRole(["ADMIN"]), async (req, res) => {
  const access = await prisma.siteAccess.findMany({
    include: { user: { select: { id: true, name: true, email: true, role: true } }, site: { select: { id: true, name: true } } },
    orderBy: { id: "desc" },
  });
  res.json(access);
});

app.post("/access", requireAuth, requireAnyRole(["ADMIN"]), async (req, res) => {
  const { userId, siteId } = req.body || {};
  if (!userId || !siteId) return res.status(400).json({ error: "userId and siteId required" });
  const row = await prisma.siteAccess.upsert({
    where: { userId_siteId: { userId, siteId } },
    update: {},
    create: { userId, siteId },
  });
  res.status(201).json(row);
});

app.delete("/access", requireAuth, requireAnyRole(["ADMIN"]), async (req, res) => {
  const { userId, siteId } = req.body || {};
  if (!userId || !siteId) return res.status(400).json({ error: "userId and siteId required" });
  await prisma.siteAccess.delete({ where: { userId_siteId: { userId, siteId } } });
  res.json({ ok: true });
});

/** SHIFTS */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function canManageSite(reqUser, siteId) {
  if (reqUser.role === "ADMIN") return true;
  if (reqUser.role !== "SUPERVISOR") return false;
  const ok = await prisma.siteAccess.findUnique({ where: { userId_siteId: { userId: reqUser.userId, siteId } } });
  return Boolean(ok);
}

app.get("/shifts", requireAuth, async (req, res) => {
  // Admin sees all; supervisor sees assigned sites; employee sees own
  if (req.user.role === "ADMIN") {
    const shifts = await prisma.shift.findMany({
      include: { user: { select: { id: true, name: true, email: true, hourlyRate: true } }, site: { select: { id: true, name: true, city: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    });
    return res.json(shifts);
  }

  if (req.user.role === "SUPERVISOR") {
    const siteIds = (await prisma.siteAccess.findMany({ where: { userId: req.user.userId }, select: { siteId: true } })).map(x => x.siteId);
    const shifts = await prisma.shift.findMany({
      where: { siteId: { in: siteIds } },
      include: { user: { select: { id: true, name: true, email: true, hourlyRate: true } }, site: { select: { id: true, name: true, city: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    });
    return res.json(shifts);
  }

  const shifts = await prisma.shift.findMany({
    where: { userId: req.user.userId },
    include: { user: { select: { id: true, name: true, email: true, hourlyRate: true } }, site: { select: { id: true, name: true, city: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
  });
  return res.json(shifts);
});

app.post("/shifts", requireAuth, requireAnyRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const parsed = createShiftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cand = parsed.data;

  if (!(await canManageSite(req.user, cand.siteId))) return res.status(403).json({ error: "Forbidden (site)" });

  const existing = await prisma.shift.findMany({
    where: { userId: cand.userId, dayOfWeek: cand.dayOfWeek },
    select: { startMin: true, endMin: true },
  });
  if (existing.some((s) => overlaps(cand.startMin, cand.endMin, s.startMin, s.endMin))) {
    return res.status(409).json({ error: "Overlap" });
  }

  const shift = await prisma.shift.create({ data: cand });
  // notify employee (if email exists)
  const emp = await prisma.user.findUnique({ where: { id: cand.userId }, select: { email: true, name: true } });
  if (emp?.email) {
    await notifyEmail({
      to: emp.email,
      subject: "Nouveau quart — Lave Propre & Service",
      text: `Bonjour ${emp.name},\n\nUn nouveau quart a été planifié (jour ${cand.dayOfWeek}, ${cand.startMin}-${cand.endMin}).\n\n— Lave Propre & Service`,
    });
  }

  res.status(201).json(shift);
});

app.patch("/shifts/:id", requireAuth, requireAnyRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const { id } = req.params;
  const current = await prisma.shift.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ error: "Not found" });

  const cand = {
    userId: req.body.userId ?? current.userId,
    siteId: req.body.siteId ?? current.siteId,
    dayOfWeek: req.body.dayOfWeek ?? current.dayOfWeek,
    startMin: req.body.startMin ?? current.startMin,
    endMin: req.body.endMin ?? current.endMin,
    checklist: req.body.checklist ?? current.checklist,
    status: req.body.status ?? current.status,
  };

  if (!(await canManageSite(req.user, cand.siteId))) return res.status(403).json({ error: "Forbidden (site)" });
  if (cand.endMin <= cand.startMin) return res.status(400).json({ error: "Invalid time" });

  const existing = await prisma.shift.findMany({
    where: { userId: cand.userId, dayOfWeek: cand.dayOfWeek, NOT: { id } },
    select: { startMin: true, endMin: true },
  });
  if (existing.some((s) => overlaps(cand.startMin, cand.endMin, s.startMin, s.endMin))) {
    return res.status(409).json({ error: "Overlap" });
  }

  const shift = await prisma.shift.update({ where: { id }, data: cand });

  const emp = await prisma.user.findUnique({ where: { id: cand.userId }, select: { email: true, name: true } });
  if (emp?.email) {
    await notifyEmail({
      to: emp.email,
      subject: "Mise à jour de quart — Lave Propre & Service",
      text: `Bonjour ${emp.name},\n\nVotre quart a été modifié (jour ${cand.dayOfWeek}, ${cand.startMin}-${cand.endMin}).\n\n— Lave Propre & Service`,
    });
  }

  res.json(shift);
});

app.delete("/shifts/:id", requireAuth, requireAnyRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const cur = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!cur) return res.status(404).json({ error: "Not found" });
  if (!(await canManageSite(req.user, cur.siteId))) return res.status(403).json({ error: "Forbidden (site)" });

  await prisma.shift.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/** Employee confirm */
app.patch("/shifts/:id/confirm", requireAuth, async (req, res) => {
  const { id } = req.params;
  const shift = await prisma.shift.findUnique({ where: { id } });
  if (!shift) return res.status(404).json({ error: "Not found" });

  if (req.user.role !== "EMPLOYEE" || shift.userId !== req.user.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const updated = await prisma.shift.update({ where: { id }, data: { status: "CONFIRMED" } });
  res.json(updated);
});

/** PAYROLL SUMMARY */
app.get("/payroll/summary", requireAuth, requireAnyRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  // based on current recurring week (dayOfWeek), sum minutes per user for shifts visible to requester
  let visible;
  if (req.user.role === "ADMIN") {
    visible = await prisma.shift.findMany({ include: { user: true, site: true } });
  } else {
    const siteIds = (await prisma.siteAccess.findMany({ where: { userId: req.user.userId }, select: { siteId: true } })).map(x => x.siteId);
    visible = await prisma.shift.findMany({ where: { siteId: { in: siteIds } }, include: { user: true, site: true } });
  }

  const byUser = new Map();
  for (const s of visible) {
    const dur = s.endMin - s.startMin;
    const u = s.user;
    const rateCents = u.hourlyRate ?? 0;
    if (!byUser.has(u.id)) byUser.set(u.id, { userId: u.id, name: u.name, email: u.email, minutes: 0, rateCents });
    byUser.get(u.id).minutes += dur;
    byUser.get(u.id).rateCents = rateCents;
  }

  const rows = Array.from(byUser.values()).map((r) => {
    const hours = r.minutes / 60;
    const payCents = Math.round(hours * r.rateCents);
    return { ...r, hours, payCents };
  });

  res.json(rows.sort((a,b) => b.payCents - a.payCents));
});

/** EXPORT (Admin/Supervisor for visible shifts) */
app.get("/export/hours.csv", requireAuth, requireAnyRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  let shifts;
  if (req.user.role === "ADMIN") {
    shifts = await prisma.shift.findMany({
      include: { user: { select: { name: true, email: true, hourlyRate: true } }, site: { select: { name: true, city: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    });
  } else {
    const siteIds = (await prisma.siteAccess.findMany({ where: { userId: req.user.userId }, select: { siteId: true } })).map(x => x.siteId);
    shifts = await prisma.shift.findMany({
      where: { siteId: { in: siteIds } },
      include: { user: { select: { name: true, email: true, hourlyRate: true } }, site: { select: { name: true, city: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    });
  }

  const rows = shifts.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    employee: s.user.name,
    employeeEmail: s.user.email,
    hourlyRateCents: s.user.hourlyRate ?? "",
    site: s.site.name,
    city: s.site.city ?? "",
    start: s.startMin,
    end: s.endMin,
    durationMin: s.endMin - s.startMin,
    status: s.status,
    checklist: s.checklist ?? "",
  }));

  const headers = ["dayOfWeek","employee","employeeEmail","hourlyRateCents","site","city","start","end","durationMin","status","checklist"];
  const csv = toCsv(rows, headers);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=heures_lave_propre.csv");
  res.send(csv);
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
