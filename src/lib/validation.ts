import { z } from "zod";
import {
  FIRST_HALF_OFF_START_DATE,
  SCRUM_STATUS_LABELS,
  isStatusAllowedOnDate,
} from "./scrum-attendance";
import {
  MAX_COMMENT_LENGTH,
  MAX_TITLE_LENGTH,
  isRealDayKey,
  validateRule,
  type RecurringRuleFields,
} from "./recurrence";

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "blocked"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const taskSourceSchema = z.enum(["manual", "slack", "mail", "planning", "outing"]);
export const mailStatusSchema = z.enum(["unread", "needs_reply", "drafted", "done"]);

/** ISO date-time (what the reminder picker sends) or yyyy-MM-dd; must be a real date. */
export const reminderAtSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    "Invalid reminder date-time"
  )
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid reminder date-time");

/** Only http(s) URLs may be stored — they are rendered as hrefs. */
export const httpUrlSchema = z
  .string()
  .max(2000)
  .refine((v) => {
    try {
      const { protocol } = new URL(v);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be an http(s) URL");

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
  reminderAt: reminderAtSchema.optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  owner: z.string().max(100).optional(),
});

export const updateTaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).nullable().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    source: taskSourceSchema.optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    reminderAt: reminderAtSchema.nullable().optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    owner: z.string().max(100).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: "At least one field to update is required",
  });

export const deleteTaskSchema = z.object({
  id: z.string().min(1),
});

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be yyyy-MM-dd");

/** Client-local today; the server never decides what "today" is. */
const recurringTodaySchema = dayKeySchema.refine(isRealDayKey, "Invalid date");

const recurringRuleShape = {
  title: z.string().min(1, "Title required").max(MAX_TITLE_LENGTH),
  comment: z.string().max(MAX_COMMENT_LENGTH),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  monthlyMode: z.enum(["weekday_of_month", "day_of_month"]),
  weekOfMonth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal("last")]),
  dayOfMonth: z.number().int("Day of month must be 1 to 31").min(1, "Day of month must be 1 to 31").max(31, "Day of month must be 1 to 31"),
  startDate: dayKeySchema,
  endDate: dayKeySchema,
};

/** Cross-field rules (weekdays, day of month, end >= start) shared with the form. */
function checkRecurringRule(
  data: Partial<RecurringRuleFields>,
  ctx: z.RefinementCtx
): void {
  const errors = validateRule({ ...data, startDate: data.startDate ?? "" });
  for (const message of Object.values(errors)) {
    if (message) ctx.addIssue({ code: "custom", message });
  }
}

export const createRecurringTaskSchema = z
  .object({
    ...recurringRuleShape,
    comment: recurringRuleShape.comment.optional(),
    weekdays: recurringRuleShape.weekdays.optional(),
    monthlyMode: recurringRuleShape.monthlyMode.optional(),
    weekOfMonth: recurringRuleShape.weekOfMonth.optional(),
    dayOfMonth: recurringRuleShape.dayOfMonth.optional(),
    endDate: recurringRuleShape.endDate.optional(),
    today: recurringTodaySchema,
  })
  .superRefine(checkRecurringRule);

/**
 * Edit, pause or resume. `null` clears an optional field. The merged rule is validated again
 * against the stored one, so only per-field shape is checked here.
 */
export const updateRecurringTaskSchema = z
  .object({
    id: z.string().min(1),
    today: recurringTodaySchema,
    title: recurringRuleShape.title.optional(),
    comment: recurringRuleShape.comment.nullable().optional(),
    cadence: recurringRuleShape.cadence.optional(),
    weekdays: recurringRuleShape.weekdays.optional(),
    monthlyMode: recurringRuleShape.monthlyMode.optional(),
    weekOfMonth: recurringRuleShape.weekOfMonth.optional(),
    dayOfMonth: recurringRuleShape.dayOfMonth.optional(),
    startDate: recurringRuleShape.startDate.optional(),
    endDate: recurringRuleShape.endDate.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).filter((k) => k !== "id" && k !== "today").length > 0, {
    message: "At least one field to update is required",
  });

export const deleteRecurringTaskSchema = z.object({
  id: z.string().min(1),
  today: recurringTodaySchema,
});

export const generateRecurringSchema = z.object({
  today: recurringTodaySchema,
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
  const seen = new Set<string>();
  value.entries.forEach((entry, index) => {
    const key = entry.member.trim().toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["entries", index, "member"],
        message: `Duplicate member "${entry.member.trim()}" in request`,
      });
    }
    seen.add(key);
  });
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

export const profileSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
});

const slackSearchMatchSchema = z.object({
  ts: z.string().optional(),
  text: z.string().optional(),
  username: z.string().optional(),
  permalink: z.union([z.literal(""), httpUrlSchema]).optional(),
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

/* 2027 Planning (docs/specs/planning-2027.md) */

const lrpNonNegativeSchema = z.number().finite().min(0, "Must be 0 or more.");

const capacityHeadcountPatchSchema = z
  .object({
    product: lrpNonNegativeSchema,
    design: lrpNonNegativeSchema,
    ux: lrpNonNegativeSchema,
    uiArt: lrpNonNegativeSchema,
    animUi: lrpNonNegativeSchema,
    dev: lrpNonNegativeSchema,
    qa: lrpNonNegativeSchema,
  })
  .partial()
  .strict();

const capacityMonthPatchSchema = z
  .object({
    index: z.number().int().min(0).max(11),
    workingDays: lrpNonNegativeSchema.optional(),
    holidays: lrpNonNegativeSchema.optional(),
    leaves: lrpNonNegativeSchema.optional(),
  })
  .strict();

export const updateCapacityPlanSchema = z
  .object({
    action: z.literal("capacity"),
    year: z.number().int().min(2000).max(2100).optional(),
    headcount: capacityHeadcountPatchSchema.optional(),
    month: capacityMonthPatchSchema.optional(),
    /** Draft Save (v2): every changed month in one patch. */
    months: z.array(capacityMonthPatchSchema).max(12).optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.year !== undefined || d.headcount !== undefined || d.month !== undefined || d.months !== undefined,
    { message: "At least one field to update is required" }
  );

export const swagTabSchema = z.enum(["lrp", "adhoc"]);

const swagCostPatchSchema = z
  .object({
    size: z.string().trim().max(40).nullable().optional(),
    days: lrpNonNegativeSchema.nullable().optional(),
  })
  .strict();

const swagCostsPatchSchema = z
  .object({
    spec: swagCostPatchSchema,
    ux: swagCostPatchSchema,
    art: swagCostPatchSchema,
    ta: swagCostPatchSchema,
    dev: swagCostPatchSchema,
    qa: swagCostPatchSchema,
  })
  .partial()
  .strict();

const swagFeatureNameSchema = z
  .string()
  .max(300)
  .refine((v) => v.trim().length > 0, "Feature name can't be empty.");

const swagRowFieldsSchema = {
  owner: z.string().max(100).nullable().optional(),
  onePager: z.string().max(5000).nullable().optional(),
  eoPercent: lrpNonNegativeSchema.nullable().optional(),
  priority: z.string().max(100).nullable().optional(),
  costs: swagCostsPatchSchema.optional(),
};

export const createSwagRowSchema = z
  .object({ tab: swagTabSchema, featureName: swagFeatureNameSchema, ...swagRowFieldsSchema })
  .strict();

export const updateSwagRowSchema = z
  .object({
    action: z.literal("row"),
    id: z.string().min(1),
    featureName: swagFeatureNameSchema.optional(),
    ...swagRowFieldsSchema,
  })
  .strict();

export const moveSwagRowSchema = z
  .object({
    action: z.literal("move"),
    id: z.string().min(1),
    tab: swagTabSchema,
    /** Position in the target tab (Undo); omitted = end of tab. */
    index: z.number().int().min(0).optional(),
  })
  .strict();

export const patchLrp2027Schema = z.discriminatedUnion("action", [
  updateCapacityPlanSchema,
  updateSwagRowSchema,
  moveSwagRowSchema,
]);

const swagCostSchema = z
  .object({
    size: z.string().trim().min(1).max(40).optional(),
    days: lrpNonNegativeSchema.optional(),
  })
  .strict();

/** A full row for the bulk save (blank fields are omitted, never 0 or ""). */
const swagRowUpsertSchema = z
  .object({
    id: z.string().min(1).max(100),
    tab: swagTabSchema,
    order: z.number().int().min(0),
    featureName: swagFeatureNameSchema,
    owner: z.string().min(1).max(100).optional(),
    onePager: z.string().min(1).max(5000).optional(),
    eoPercent: lrpNonNegativeSchema.optional(),
    priority: z.string().min(1).max(100).optional(),
    costs: z
      .object({
        spec: swagCostSchema,
        ux: swagCostSchema,
        art: swagCostSchema,
        ta: swagCostSchema,
        dev: swagCostSchema,
        qa: swagCostSchema,
      })
      .strict(),
  })
  .strict();

/** Swag Costing draft Save: all changes in one atomic request. */
export const bulkSaveSwagSchema = z
  .object({
    upserts: z.array(swagRowUpsertSchema).max(1000),
    deletes: z.array(z.string().min(1).max(100)).max(1000),
  })
  .strict()
  .refine((d) => new Set(d.upserts.map((r) => r.id)).size === d.upserts.length, {
    message: "Duplicate row ids",
  })
  .refine((d) => !d.upserts.some((r) => d.deletes.includes(r.id)), {
    message: "A row can't be saved and deleted at once",
  });

export const deleteSwagRowSchema = z.object({
  id: z.string().min(1),
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
