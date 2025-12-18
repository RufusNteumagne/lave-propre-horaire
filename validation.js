import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const createShiftSchema = z.object({
  userId: z.string(),
  siteId: z.string(),
  dayOfWeek: z.number().int().min(1).max(7),
  startMin: z.number().int().min(0).max(24 * 60 - 1),
  endMin: z.number().int().min(1).max(24 * 60),
  checklist: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "CONFIRMED", "DONE"]).default("PLANNED"),
}).refine((x) => x.endMin > x.startMin, { message: "endMin must be > startMin" });
