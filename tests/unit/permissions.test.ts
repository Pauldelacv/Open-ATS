import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("roles", () => {
  it("lets admins do everything", () => {
    expect(can("admin", "settings:team")).toBe(true);
    expect(can("admin", "candidate:delete")).toBe(true);
  });
  it("lets recruiters manage jobs and candidates but not the organisation", () => {
    expect(can("recruiter", "job:manage")).toBe(true);
    expect(can("recruiter", "candidate:reject")).toBe(true);
    expect(can("recruiter", "settings:team")).toBe(false);
    expect(can("recruiter", "candidate:delete")).toBe(false);
  });
  it("limits members to notes and evaluations", () => {
    expect(can("member", "candidate:note")).toBe(true);
    expect(can("member", "candidate:evaluate")).toBe(true);
    expect(can("member", "pipeline:move")).toBe(false);
    expect(can("member", "candidate:email")).toBe(false);
    expect(can("member", "job:manage")).toBe(false);
  });
});
