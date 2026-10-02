import { z } from "zod";
import {
  FIRST_HALF_OFF_START_DATE,
  SCRUM_STATUS_LABELS,
  isStatusAllowedOnDate,
} from "./scrum-attendance";

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "blocked"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const taskSourceSchema = z.enum(["manual", "slack", "mail", "planning", "outing"]);
export const mailStatusSchema = z.enum(["unread", "needs_reply", "drafted", "done"]);

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  source: taskSourceSchema.optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reminderAt: z.string().min(1).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  owner: z.string().max(100).optional(),
});

export const updateTaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    source: taskSourceSchema.optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    reminderAt: z.string().min(1).nullable().optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    owner: z.string().max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: "At least one field to update is required",
  });

export const deleteTaskSchema = z.object({
  id: z.string().min(1),
});

export const updateSlackItemSchema = z.object({
  id: z.string().min(1),
  completed: z.boolean(),
});

export const updateMailItemSchema = z.object({
  id: z.string().min(1),
  status: mailStatusSchema,
});

export const sprintApprovalPartySchema = z.enum(["gm", "dev", "qa"]);

export const releasePlatformSchema = z.enum(["android", "ios"]);

export const releaseFunctionRoleSchema = z.enum([
  "product",
  "ux",
  "designer",
  "art",
  "tech_art",
  "devs",
  "qa",
]);

export const releaseFunctionCostInputSchema = z.object({
  role: releaseFunctionRoleSchema,
  involved: z.boolean(),
  effortDays: z.number().min(0).max(999).optional(),
  actualEffortDays: z.number().min(0).max(999).optional(),
});

export const createReleaseSchema = z.object({
  platform: releasePlatformSchema,
  buildNumber: z
    .string()
    .min(1)
    .max(20)
    .regex(/^\d+\.\d+$/, "Use format like 1.180"),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(5000).optional(),
  sprintNote: z.string().max(2000).optional(),
  functionCosts: z.array(releaseFunctionCostInputSchema).max(7).optional(),
});

export const projectResourceTypeSchema = z.enum(["doc", "figma", "link", "sheets", "slides"]);

export const createProjectResourceSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().min(1).max(2000),
  type: projectResourceTypeSchema,
  description: z.string().max(500).optional(),
});

export const updateProjectResourceSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(200).optional(),
    url: z.string().min(1).max(2000).optional(),
    type: projectResourceTypeSchema.optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: "At least one field to update is required",
  });

export const deleteProjectResourceSchema = z.object({
  id: z.string().min(1),
});

export const createPlotBacklogItemSchema = z.object({
  title: z.string().min(1).max(200),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
});

export const deletePlotBacklogItemSchema = z.object({
  id: z.string().min(1),
});

const dateFieldSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createFeatureSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: dateFieldSchema.optional(),
  scopeClosureDate: dateFieldSchema.optional(),
  preProductionClosureDate: dateFieldSchema.optional(),
  releaseDate: dateFieldSchema.optional(),
  functionCosts: z.array(releaseFunctionCostInputSchema).max(7).optional(),
});

export const updateFeatureSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(200).optional(),
    startDate: dateFieldSchema.nullable().optional(),
    scopeClosureDate: dateFieldSchema.nullable().optional(),
    preProductionClosureDate: dateFieldSchema.nullable().optional(),
    releaseDate: dateFieldSchema.nullable().optional(),
    scopeClosureCompleted: z.boolean().optional(),
    specReviewCompleted: z.boolean().optional(),
    addDiscussionNote: z
      .object({
        date: dateFieldSchema,
        content: z.string().min(1).max(10000),
      })
      .optional(),
    removeDiscussionNoteId: z.string().min(1).optional(),
    functionCosts: z.array(releaseFunctionCostInputSchema).max(7).optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: "At least one field to update is required",
  });

export const deleteFeatureSchema = z.object({
  id: z.string().min(1),
});

export const reorderPlotBacklogSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

const outingAttendeesSchema = z
  .array(z.object({ name: z.string().trim().min(1).max(100), confirmed: z.boolean() }))
  .max(100);

export const createOutingSchema = z
  .object({
    title: z.string().min(1).max(200),
    destination: z.string().max(200).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    budget: z.number().positive().optional(),
    budgetPerPerson: z.number().positive().optional(),
    members: z.array(z.string().min(1).max(100)).max(100).optional(),
    attendees: outingAttendeesSchema.optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (data) =>
      data.budget != null ||
      (data.budgetPerPerson != null &&
        (data.attendees?.length ?? data.members?.length ?? 0) > 0),
    { message: "Provide total budget or budget per person with at least one member" }
  );

export const updateOutingSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(200).optional(),
    destination: z.string().max(200).nullable().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    budget: z.number().positive().optional(),
    budgetPerPerson: z.number().positive().nullable().optional(),
    members: z.array(z.string().min(1).max(100)).max(100).optional(),
    attendees: outingAttendeesSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: "At least one field to update is required",
  });

export const outingExpenseTypeSchema = z.enum(["outing", "follow_up"]);

const outingExpenseDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createOutingExpenseSchema = z.object({
  outingId: z.string().min(1),
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  type: outingExpenseTypeSchema,
  date: outingExpenseDateSchema.optional(),
  notes: z.string().max(2000).optional(),
  attendeeCount: z.number().int().positive().optional(),
});

export const updateOutingExpenseSchema = z
  .object({
    outingId: z.string().min(1),
    id: z.string().min(1),
    title: z.string().min(1).max(200).optional(),
    amount: z.number().positive().optional(),
    type: outingExpenseTypeSchema.optional(),
    date: outingExpenseDateSchema.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    attendeeCount: z.number().int().positive().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 2, {
    message: "At least one field to update is required",
  });

export const deleteOutingExpenseSchema = z.object({
  outingId: z.string().min(1),
  id: z.string().min(1),
});

export const scrumStatusSchema = z.enum(["on_time", "late", "leave", "first_half_off", "other"]);

export const scrumDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const upsertScrumAttendanceSchema = z.object({
  date: scrumDateSchema,
  entries: z
    .array(
      z.object({
        member: z.string().min(1).max(100),
        status: scrumStatusSchema,
        note: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(50),
}).superRefine((value, ctx) => {
  value.entries.forEach((entry, index) => {
    if (!isStatusAllowedOnDate(entry.status, value.date)) {
      ctx.addIssue({
        code: "custom",
        path: ["entries", index, "status"],
        message: `"${SCRUM_STATUS_LABELS[entry.status]}" isn't available before ${FIRST_HALF_OFF_START_DATE}`,
      });
    }
  });
});

export const updateScrumAttendanceEntrySchema = z.object({
  id: z.string().min(1),
  status: scrumStatusSchema,
  note: z.string().max(500).nullable().optional(),
});

export const deleteScrumAttendanceEntrySchema = z.object({
  id: z.string().min(1),
});

export const connectScrumSheetSchema = z.object({
  url: z.string().min(1).max(500),
});

export const addScrumMemberSchema = z.object({
  name: z.string().min(1).max(100),
});

export const removeScrumMemberSchema = z.object({
  name: z.string().min(1),
});

export const addScrumHolidaySchema = z.object({
  date: scrumDateSchema,
  label: z.string().max(200).optional(),
});

export const removeScrumHolidaySchema = z.object({
  date: scrumDateSchema,
});

export const updateSprintApprovalSchema = z.object({
  id: z.string().min(1),
  party: sprintApprovalPartySchema.optional(),
  approved: z.boolean().optional(),
  mailSent: z.boolean().optional(),
}).refine(
  (data) =>
    (data.party != null && data.approved != null) ||
    data.mailSent != null,
  { message: "Provide party+approved or mailSent" }
).refine(
  (data) =>
    !(data.party != null && data.mailSent != null),
  { message: "Cannot update party and mailSent in one request" }
);

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000),
      })
    )
    .max(20)
    .optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
});

export const releaseStatusSchema = z.enum([
  "idea",
  "spec_draft",
  "spec_ready",
  "in_dev",
  "qa",
  "ready",
  "live",
]);

export const releasePhaseSchema = z.enum([
  "ux",
  "art",
  "animation",
  "dev",
  "qa",
]);

export const updateReleaseSchema = z
  .object({
    id: z.string().min(1),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    actualDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    status: releaseStatusSchema.optional(),
    phase: releasePhaseSchema.optional(),
    notes: z.string().max(5000).nullable().optional(),
    sprintNote: z.string().max(2000).nullable().optional(),
    blockers: z.array(z.string().max(200)).max(20).optional(),
    functionCosts: z.array(releaseFunctionCostInputSchema).max(7).optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: "At least one field to update is required",
  });

const slackSearchMatchSchema = z.object({
  ts: z.string().optional(),
  text: z.string().optional(),
  username: z.string().optional(),
  permalink: z.string().optional(),
  channel: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

export const slackImportSchema = z.object({
  matches: z.array(slackSearchMatchSchema).max(200).optional(),
  results: z.string().max(500_000).optional(),
  userId: z.string().max(50).optional(),
  teamName: z.string().max(100).optional(),
});

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: result.error.issues.map((i) => i.message).join("; "),
  };
}
