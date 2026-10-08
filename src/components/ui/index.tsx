import Link from "next/link";
import { AlertCircle, ArrowRight, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { MODULE_ICONS, MODULE_STYLES, type ModuleId } from "@/lib/modules";

// Shared UI primitives for the "Ink & signal orange" look (docs/specs/visual-redesign.md §4).
// No hooks here so server components can render these too.

const TRANSITION =
  "transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-soft";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/* ------------------------------------------------------------------ */
/* Module chip                                                         */
/* ------------------------------------------------------------------ */

export function ModuleChip({
  module,
  icon,
  size = "sm",
  variant = "solid",
  className,
}: {
  module: ModuleId;
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  variant?: "solid" | "soft";
  className?: string;
}) {
  const Icon = icon ?? MODULE_ICONS[module];
  const styles = MODULE_STYLES[module];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center",
        size === "sm" && "h-7 w-7 rounded-lg",
        size === "md" && "h-9 w-9 rounded-xl",
        size === "lg" && "h-10 w-10 rounded-xl",
        variant === "solid" ? styles.solid : cn(styles.soft, styles.text),
        className
      )}
    >
      <Icon
        className={cn(
          size === "sm" && "h-4 w-4",
          size === "md" && "h-[18px] w-[18px]",
          size === "lg" && "h-5 w-5"
        )}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  action,
  module,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  module?: ModuleId;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {module && <ModuleChip module={module} icon={icon} size="lg" />}
        <div className="min-w-0">
          <h1 className="text-balance font-display text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-[28px] sm:leading-[34px]">
            {title}
          </h1>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  interactive,
  tone = "default",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  tone?: "default" | "muted";
}) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-card border border-border bg-card p-4 shadow-card sm:p-5",
        TRANSITION,
        "duration-[180ms]",
        tone === "muted" && "bg-surface-2/60 shadow-none",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-border-strong hover:shadow-raised",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-accent hover:bg-accent-soft",
        TRANSITION,
        FOCUS_RING,
        className
      )}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  );
}

export function CardHeader({
  title,
  icon,
  module,
  action,
  className,
}: {
  title: React.ReactNode;
  icon?: LucideIcon;
  module?: ModuleId;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {module && <ModuleChip module={module} icon={icon} size="sm" />}
        <h2 className="truncate font-display text-base font-semibold leading-[22px] text-foreground">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section title (eyebrow + count + right slot)                        */
/* ------------------------------------------------------------------ */

export function SectionTitle({
  children,
  count,
  action,
  as: Tag = "h2",
  className,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  as?: "h2" | "h3" | "p";
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <Tag className="flex items-center gap-2 font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-muted">
        {children}
        {count !== undefined && (
          <span className="rounded-full bg-surface-3 px-1.5 py-px tabular-nums text-foreground">
            {count}
          </span>
        )}
      </Tag>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "caution"
  | "danger"
  | "info"
  | "pop"
  | "android"
  | "ios";

const BADGE_SOFT: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  caution: "bg-caution-soft text-caution",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  pop: "bg-pop-soft text-pop-ink",
  android: "bg-android-soft text-android-ink",
  ios: "bg-ios-soft text-ios-ink",
};

const BADGE_SOLID: Record<BadgeTone, string> = {
  neutral: "bg-foreground text-on-fill",
  accent: "bg-accent text-on-fill",
  success: "bg-success text-on-fill",
  caution: "bg-caution text-on-fill",
  danger: "bg-danger text-on-fill",
  info: "bg-info text-on-fill",
  pop: "bg-pop text-on-signal",
  android: "bg-android text-on-fill",
  ios: "bg-ios text-on-fill",
};

export function badgeClasses({
  tone,
  solid,
}: { tone?: BadgeTone; solid?: boolean } = {}): string {
  return cn(
    "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 text-[11px] font-semibold leading-4",
    tone && (solid ? BADGE_SOLID[tone] : BADGE_SOFT[tone])
  );
}

export function Badge({
  children,
  className,
  tone,
  solid,
  dot,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: BadgeTone;
  solid?: boolean;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span title={title} className={cn(badgeClasses({ tone, solid }), className)}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  accent,
  tone,
  icon: Icon,
  module,
  href,
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  /** Alias for tone="attention". */
  accent?: boolean;
  tone?: "default" | "attention";
  icon?: LucideIcon;
  module?: ModuleId;
  href?: string;
  className?: string;
}) {
  const attention = tone === "attention" || accent;
  const styles = module ? MODULE_STYLES[module] : null;
  const isZero = value === 0 || value === "0";

  const tile = (
    <Card
      interactive={Boolean(href)}
      className={cn(
        "relative h-full overflow-hidden p-4 sm:p-4",
        attention && "border-signal/40",
        !href && className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-muted">
          {attention && (
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-signal" />
          )}
          <span className="truncate">{label}</span>
        </p>
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
              styles ? cn(styles.soft, styles.text) : "bg-surface-2 text-muted"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-2 font-display text-[30px] font-bold leading-none tabular-nums text-foreground sm:text-[34px]",
          isZero && "text-muted",
          attention && !isZero && "text-accent"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </Card>
  );

  if (!href) return tile;
  return (
    <Link href={href} className={cn("block rounded-card", FOCUS_RING, className)}>
      {tile}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  compact,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-10",
        className
      )}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className={cn(
            "grid place-items-center rounded-2xl bg-surface-2 text-muted ring-1 ring-inset ring-border",
            compact ? "h-9 w-9" : "h-12 w-12"
          )}
        >
          <Icon className={compact ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]"} />
        </span>
      )}
      <p className={cn("text-sm font-semibold text-foreground", Icon && "mt-3")}>{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alert / ErrorBanner                                                 */
/* ------------------------------------------------------------------ */

export type AlertTone = "danger" | "caution" | "info" | "success" | "pop";

const ALERT_TONES: Record<AlertTone, string> = {
  danger: "border-danger/25 bg-danger-soft text-danger",
  caution: "border-caution/25 bg-caution-soft text-caution",
  info: "border-info/25 bg-info-soft text-info",
  success: "border-success/25 bg-success-soft text-success",
  pop: "border-pop/30 bg-pop-soft text-pop-ink",
};

export function Alert({
  tone = "info",
  children,
  icon: Icon = AlertCircle,
  action,
  onDismiss,
  role,
  className,
}: {
  tone?: AlertTone;
  children: React.ReactNode;
  icon?: LucideIcon | null;
  action?: React.ReactNode;
  onDismiss?: () => void;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-control border px-4 py-2.5 text-sm",
        ALERT_TONES[tone],
        className
      )}
    >
      {Icon && <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            buttonClasses({ variant: "ghost", size: "sm" }),
            "-my-1 h-7 shrink-0 px-2 text-current hover:bg-current/10 hover:text-current"
          )}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

/** Non-blocking error message; keeps the page (and any unsaved drafts) mounted. */
export function ErrorBanner({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <Alert tone="danger" role="alert" onDismiss={onDismiss} className={cn("mb-4", className)}>
      {message}
    </Alert>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

export function buttonClasses({
  variant = "primary",
  size = "md",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return cn(
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-semibold active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-50",
    TRANSITION,
    FOCUS_RING,
    size === "sm" && "h-8 px-3 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5",
    size === "md" && "h-10 px-4 text-sm [&_svg]:h-4 [&_svg]:w-4",
    size === "icon" && "h-8 w-8 p-0 text-sm [&_svg]:h-4 [&_svg]:w-4",
    variant === "primary" &&
      "bg-accent text-on-fill shadow-card hover:bg-accent-hover",
    variant === "secondary" &&
      "border border-border-strong bg-card text-foreground shadow-card hover:border-input/60 hover:bg-surface-2",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-foreground",
    variant === "danger" && "bg-danger-soft text-danger hover:bg-danger hover:text-on-fill"
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit";
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button {...rest} type={type} className={cn(buttonClasses({ variant, size }), className)}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

export function fieldClasses({
  size = "md",
  kind = "input",
}: { size?: "sm" | "md"; kind?: "input" | "select" | "textarea" } = {}): string {
  return cn(
    "w-full rounded-control border border-input bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-subtle",
    "hover:border-foreground/40 focus:border-signal focus:ring-4 focus:ring-signal/15",
    "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15",
    "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted",
    kind === "textarea"
      ? "min-h-[4.5rem] resize-y py-2"
      : size === "sm"
        ? "h-8 px-2.5 text-xs"
        : "h-10",
    kind === "select" && "cursor-pointer pr-8"
  );
}

type FieldSize = { size?: "sm" | "md" };

export function Input({
  size,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> &
  FieldSize & { ref?: React.Ref<HTMLInputElement> }) {
  return <input {...rest} className={cn(fieldClasses({ size }), className)} />;
}

export function Select({
  size,
  className,
  children,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & FieldSize) {
  return (
    <select {...rest} className={cn(fieldClasses({ size, kind: "select" }), className)}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(fieldClasses({ kind: "textarea" }), className)} />;
}

export function Label({
  children,
  hint,
  className,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: React.ReactNode }) {
  return (
    <label {...rest} className={cn("mb-1.5 block text-xs font-semibold text-foreground", className)}>
      {children}
      {hint && <span className="ml-1 text-[11px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function FieldError({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("mt-1.5 text-xs font-medium text-danger", className)}>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs / segmented filter                                             */
/* ------------------------------------------------------------------ */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { id: T; label: React.ReactNode; count?: number }[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("no-scrollbar max-w-full overflow-x-auto", className)}>
      <div
        role="group"
        aria-label={ariaLabel}
        className="inline-flex gap-1 rounded-control bg-surface-2 p-1 ring-1 ring-inset ring-border"
      >
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(item.id)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-semibold",
                TRANSITION,
                FOCUS_RING,
                active ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground"
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 text-[11px] tabular-nums",
                    active ? "bg-accent-soft text-accent" : "bg-surface-3 text-foreground"
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control (single choice, radiogroup)                       */
/* ------------------------------------------------------------------ */

export type SegmentedItem<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  describedBy?: string;
};

const SEGMENT_TONES = {
  surface: {
    track: "bg-surface-2 ring-1 ring-inset ring-border",
    idle: "text-muted hover:text-foreground",
    selected: "bg-card text-foreground shadow-card",
    focus: FOCUS_RING,
  },
  // Sidebar stays dark in both themes, so white/black opacities are allowed here (visual-redesign §2.4)
  sidebar: {
    track: "bg-black/20 ring-1 ring-inset ring-white/10",
    idle: "text-sidebar-muted hover:bg-white/[0.06] hover:text-white",
    selected: "bg-white/[0.14] text-white shadow-card ring-1 ring-inset ring-white/10",
    focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
  },
} as const;

/**
 * Radio-style segmented control (docs/specs/dark-mode.md §12). `value` null = nothing
 * selected yet (pre-hydration). Roving tabindex; arrows/Home/End move and select.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  items,
  tone = "surface",
  size = "md",
  fullWidth,
  iconOnly,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: T | null;
  onChange: (value: T) => void;
  items: SegmentedItem<T>[];
  tone?: "surface" | "sidebar";
  size?: "sm" | "md";
  fullWidth?: boolean;
  /** Square icon segments; `label` becomes the aria-label and title tooltip. */
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label": string;
}) {
  const styles = SEGMENT_TONES[tone];
  const selectedIndex = items.findIndex((item) => item.id === value);
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  function select(index: number, focusGroup?: HTMLElement | null) {
    const item = items[index];
    if (!item) return;
    if (item.id !== value) onChange(item.id);
    focusGroup?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(next, event.currentTarget.parentElement);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn(
        "rounded-control",
        size === "sm" ? "gap-0.5 p-0.5" : "gap-1 p-1",
        fullWidth ? "flex w-full" : "inline-flex",
        styles.track,
        className
      )}
    >
      {items.map((item, index) => {
        const checked = index === selectedIndex;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-describedby={item.describedBy}
            aria-label={iconOnly ? item.label : undefined}
            title={iconOnly ? item.label : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-lg text-xs disabled:cursor-not-allowed disabled:opacity-50",
              iconOnly
                ? "w-8"
                : size === "sm"
                  ? "gap-1 px-1 font-medium"
                  : "gap-1.5 px-3 font-semibold",
              fullWidth ? "min-w-0 flex-1" : "shrink-0",
              styles.focus,
              // Transition only on unselected so the pill snaps in (no fade on first select)
              checked ? styles.selected : cn(TRANSITION, styles.idle, "disabled:hover:bg-transparent")
            )}
          >
            {Icon && (
              <Icon aria-hidden="true" className={cn("shrink-0", iconOnly ? "h-4 w-4" : "h-3.5 w-3.5")} />
            )}
            {!iconOnly && item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table styles                                                        */
/* ------------------------------------------------------------------ */

export const tableClasses = {
  wrapper: "overflow-x-auto rounded-card border border-border bg-card shadow-card scroll-fade-x",
  headRow:
    "bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted",
  cell: "px-3 py-2.5",
  row: "border-t border-border transition-colors hover:bg-surface-2/60",
  selectedRow: "bg-accent-soft shadow-[inset_3px_0_0_var(--signal)] hover:bg-accent-soft",
  successRow: "bg-success-soft/60 hover:bg-success-soft/80",
} as const;

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

/**
 * Presentational modal shell (centered on sm+, bottom sheet on phones).
 * Dialogs keep their own Escape/reset/submit logic. Pass `onSubmit` to wrap
 * body + footer in a <form>.
 */
export function Modal({
  open = true,
  onClose,
  title,
  titleId,
  icon,
  module,
  footer,
  children,
  onSubmit,
  className,
}: {
  open?: boolean;
  onClose: () => void;
  title: React.ReactNode;
  titleId?: string;
  icon?: LucideIcon;
  module?: ModuleId;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  className?: string;
}) {
  if (!open) return null;

  const body = (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 sm:px-6">{children}</div>
      {footer && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface-2/70 px-5 py-3.5 max-sm:[&>*]:flex-1 sm:px-6">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 animate-fade-in cursor-default bg-overlay backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : typeof title === "string" ? title : undefined}
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full max-w-lg animate-sheet-up flex-col overflow-hidden rounded-t-modal bg-card shadow-overlay sm:max-h-[90dvh] sm:animate-scale-in sm:rounded-modal",
          className
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-surface-3 sm:hidden" />
        <div className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-5 sm:px-6">
          {module && <ModuleChip module={module} icon={icon} size="md" />}
          <h2
            id={titleId}
            className="min-w-0 flex-1 self-center font-display text-lg font-semibold leading-6 text-foreground"
          >
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-surface-3", className)} />;
}

/** Page-level loading placeholder; keeps the old "Loading X..." text for screen readers. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Checkbox (task / todo complete)                                     */
/* ------------------------------------------------------------------ */

export function checkboxClasses({ done, round }: { done: boolean; round?: boolean }): string {
  return cn(
    "grid shrink-0 place-items-center border-2",
    TRANSITION,
    FOCUS_RING,
    round ? "h-[22px] w-[22px] rounded-full" : "h-5 w-5 rounded-md",
    done
      ? "border-success bg-success text-on-fill"
      : "border-input bg-card text-transparent hover:border-signal hover:bg-accent-soft"
  );
}
