import { describe, expect, it } from "vitest";
import { NAV_ITEMS, findActiveNav, isPathUnder } from "@/lib/navigation";

describe("navigation", () => {
  it("has the 2027 Planning group right after Planning", () => {
    const ids = NAV_ITEMS.map((i) => i.id);
    expect(ids.indexOf("lrp2027")).toBe(ids.indexOf("planning") + 1);
    const group = NAV_ITEMS.find((i) => i.id === "lrp2027")!;
    expect(group.children?.map((c) => [c.label, c.href])).toEqual([
      ["Capacity Plan", "/lrp-2027/capacity"],
      ["Swag Costing", "/lrp-2027/swag-costing"],
    ]);
  });

  it("labels the planning module Release Calendar at /release-calendar", () => {
    const item = NAV_ITEMS.find((i) => i.id === "planning")!;
    expect(item.label).toBe("Release Calendar");
    expect(item.href).toBe("/release-calendar");
  });

  it("matches routes by segment, so /lrp-2027 never lights up Release Calendar", () => {
    expect(isPathUnder("/lrp-2027/capacity", "/release-calendar")).toBe(false);
    expect(isPathUnder("/release-calendar", "/release-calendar")).toBe(true);
    expect(isPathUnder("/release-calendar-x", "/release-calendar")).toBe(false);
    expect(findActiveNav("/lrp-2027/swag-costing")?.child?.label).toBe("Swag Costing");
    expect(findActiveNav("/release-calendar")?.item.id).toBe("planning");
    expect(findActiveNav("/")?.item.id).toBe("home");
  });
});
