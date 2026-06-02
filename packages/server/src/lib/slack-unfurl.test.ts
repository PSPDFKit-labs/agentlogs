import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { parseAgentLogsTranscriptId, verifySlackSignature } from "./slack-unfurl";

describe("verifySlackSignature", () => {
  test("accepts a valid Slack signature", () => {
    const secret = "test-secret";
    const timestamp = "1710000000";
    const body = JSON.stringify({ type: "event_callback" });
    const signature = signSlackBody(secret, timestamp, body);

    const headers = new Headers({
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    });

    expect(verifySlackSignature(headers, body, secret, 1710000000 * 1000)).toBe(true);
  });

  test("rejects invalid signatures", () => {
    const headers = new Headers({
      "x-slack-request-timestamp": "1710000000",
      "x-slack-signature": "v0=bad",
    });

    expect(verifySlackSignature(headers, "{}", "test-secret", 1710000000 * 1000)).toBe(false);
  });

  test("rejects stale timestamps", () => {
    const secret = "test-secret";
    const timestamp = "1710000000";
    const body = "{}";
    const signature = signSlackBody(secret, timestamp, body);

    const headers = new Headers({
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    });

    expect(verifySlackSignature(headers, body, secret, 1710000601 * 1000)).toBe(false);
  });
});

describe("parseAgentLogsTranscriptId", () => {
  test("parses public and app transcript URLs on the configured origin", () => {
    expect(
      parseAgentLogsTranscriptId("https://nutrient-agentlogs.dev/s/abc123", "https://nutrient-agentlogs.dev"),
    ).toBe("abc123");
    expect(
      parseAgentLogsTranscriptId(
        "https://nutrient-agentlogs.dev/app/logs/def456?view=full",
        "https://nutrient-agentlogs.dev",
      ),
    ).toBe("def456");
  });

  test("rejects other origins and paths", () => {
    expect(parseAgentLogsTranscriptId("https://evil.example/s/abc123", "https://nutrient-agentlogs.dev")).toBeNull();
    expect(
      parseAgentLogsTranscriptId("https://nutrient-agentlogs.dev/app/team", "https://nutrient-agentlogs.dev"),
    ).toBeNull();
  });
});

function signSlackBody(secret: string, timestamp: string, body: string) {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}
