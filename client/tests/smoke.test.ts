import { describe, it, expect } from "vitest";
import { CATEGORIES, CATEGORY_LABELS } from "@/types/constants";

describe("shared constants", () => {
  it("every category has a label", () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});
