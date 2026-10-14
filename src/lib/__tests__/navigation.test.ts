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

  it("matches routes by segment, so /lrp-2027 never lights up Planning", () => {
    expect(isPathUnder("/lrp-2027/capacity", "/planning")).toBe(false);
    expect(isPathUnder("/planning", "/planning")).toBe(true);
    expect(findActiveNav("/lrp-2027/swag-costing")?.child?.label).toBe("Swag Costing");
    expect(findActiveNav("/planning")?.item.id).toBe("planning");
    expect(findActiveNav("/")?.item.id).toBe("home");
  });
});
