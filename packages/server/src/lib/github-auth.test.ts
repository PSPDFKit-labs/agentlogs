import { describe, expect, test } from "bun:test";

function parseAllowedGithubOrgs(value: string): string[] {
  return value
    .split(",")
    .map((org) => org.trim().toLowerCase())
    .filter(Boolean);
}

describe("ALLOWED_GITHUB_ORGS parsing", () => {
  test("parses comma-separated orgs", () => {
    expect(parseAllowedGithubOrgs("Acme, platform-team , , OSS ")).toEqual(["acme", "platform-team", "oss"]);
  });

  test("returns empty array when unset", () => {
    expect(parseAllowedGithubOrgs("")).toEqual([]);
  });
});
