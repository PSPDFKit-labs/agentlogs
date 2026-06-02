import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const SLACK_SIGNATURE_VERSION = "v0";
const MAX_REQUEST_AGE_SECONDS = 60 * 5;

export interface SlackLinkSharedEvent {
  type: "link_shared";
  channel: string;
  message_ts: string;
  team?: string;
  links?: Array<{
    url?: string;
    domain?: string;
  }>;
}

export type SlackEventsPayload =
  | {
      type: "url_verification";
      challenge?: string;
      team_id?: string;
      api_app_id?: string;
    }
  | {
      type: "event_callback";
      team_id?: string;
      api_app_id?: string;
      event?: SlackLinkSharedEvent | { type?: string };
    };

export function isSlackUnfurlConfigured() {
  return Boolean(env.SLACK_SIGNING_SECRET && env.SLACK_APP_ID && env.SLACK_BOT_TOKEN && env.SLACK_AGENTLOGS_TEAM_ID);
}

export function isSlackEventEndpointConfigured() {
  return Boolean(env.SLACK_SIGNING_SECRET && env.SLACK_APP_ID);
}

export function verifySlackSignature(headers: Headers, rawBody: string, signingSecret: string, now = Date.now()) {
  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");

  if (!timestamp || !signature || !signingSecret) {
    return false;
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const requestAgeSeconds = Math.abs(Math.floor(now / 1000) - timestampSeconds);
  if (requestAgeSeconds > MAX_REQUEST_AGE_SECONDS) {
    return false;
  }

  const baseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const expectedSignature = `${SLACK_SIGNATURE_VERSION}=${createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex")}`;

  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);

  if (expected.byteLength !== actual.byteLength) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

export interface AgentLogsUnfurlTarget {
  transcriptId: string;
  messageIndex: number | null;
}

export function parseAgentLogsUnfurlTarget(urlString: string, webUrl = env.WEB_URL): AgentLogsUnfurlTarget | null {
  let url: URL;
  let expectedOrigin: string;

  try {
    url = new URL(urlString);
    expectedOrigin = new URL(webUrl).origin;
  } catch {
    return null;
  }

  if (url.origin !== expectedOrigin) {
    return null;
  }

  let transcriptId: string | null = null;
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length === 2 && parts[0] === "s") {
    transcriptId = parts[1] || null;
  }

  if (parts.length === 3 && parts[0] === "app" && parts[1] === "logs") {
    transcriptId = parts[2] || null;
  }

  if (!transcriptId) {
    return null;
  }

  return {
    transcriptId,
    messageIndex: parseMessageHash(url.hash),
  };
}

export function parseAgentLogsTranscriptId(urlString: string, webUrl = env.WEB_URL) {
  return parseAgentLogsUnfurlTarget(urlString, webUrl)?.transcriptId ?? null;
}

function parseMessageHash(hash: string) {
  const match = hash.match(/^#msg-(\d+)$/);
  if (!match) {
    return null;
  }

  const messageNumber = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(messageNumber) || messageNumber < 1) {
    return null;
  }

  return messageNumber - 1;
}

export function buildSlackUnfurlBlocks(
  transcript: {
    id: string;
    summary: string | null;
    preview: string | null;
    source: string;
    repoName: string | null;
    userName: string | null;
    createdAt: Date;
  },
  url: string,
  permalink?: { message: string | null; response: string | null } | null,
) {
  const title = truncateText(transcript.summary || transcript.preview || "AgentLogs transcript", 150);
  const details = [transcript.userName ? `by ${transcript.userName}` : null, transcript.repoName].filter(Boolean);
  const lines = [
    `*<${escapeSlackLinkUrl(url)}|${escapeSlackText(title)}>*`,
    escapeSlackText(details.join(" · ") || "AgentLogs transcript"),
  ];

  if (permalink?.message) {
    lines.push(`*Message*\n${formatSlackQuote(permalink.message, 700)}`);
  }

  if (permalink?.response) {
    lines.push(`*Agent response*\n${formatSlackQuote(permalink.response, 900)}`);
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: lines.join("\n"),
      },
    },
  ];
}

export async function sendSlackUnfurl(input: {
  token: string;
  channel: string;
  messageTs: string;
  url: string;
  blocks: unknown[];
}) {
  const response = await fetch("https://slack.com/api/chat.unfurl", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: input.channel,
      ts: input.messageTs,
      unfurls: {
        [input.url]: {
          blocks: input.blocks,
        },
      },
    }),
  });

  const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  return {
    ok: response.ok && body?.ok === true,
    status: response.status,
    error: body?.error,
  };
}

function escapeSlackText(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeSlackLinkUrl(url: string) {
  return url.replaceAll("|", "%7C").replaceAll(">", "%3E");
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

function formatSlackQuote(text: string, maxLength: number) {
  const truncated = truncateText(text.trim(), maxLength);
  return truncated
    .split(/\r?\n/)
    .map((line) => `>${escapeSlackText(line)}`)
    .join("\n");
}
