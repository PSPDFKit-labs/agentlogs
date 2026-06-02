import { createDrizzle } from "@/db";
import { getTranscriptForSlackUnfurl } from "@/db/queries";
import type { UnifiedTranscriptMessage } from "@agentlogs/shared/claudecode";
import { unifiedTranscriptSchema } from "@agentlogs/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { env } from "../../../lib/env";
import { logger } from "../../../lib/logger";
import {
  buildSlackUnfurlBlocks,
  isSlackEventEndpointConfigured,
  isSlackUnfurlConfigured,
  parseAgentLogsUnfurlTarget,
  sendSlackUnfurl,
  type SlackEventsPayload,
  type SlackLinkSharedEvent,
  verifySlackSignature,
} from "../../../lib/slack-unfurl";

export const Route = createFileRoute("/api/slack/events" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSlackEventEndpointConfigured()) {
          logger.warn("Slack events endpoint called but signing configuration is missing");
          return json({ error: "Slack events are not configured" }, { status: 404 });
        }

        const rawBody = await request.text();
        if (!verifySlackSignature(request.headers, rawBody, env.SLACK_SIGNING_SECRET)) {
          logger.warn("Slack events request rejected: invalid signature");
          return json({ error: "Invalid signature" }, { status: 401 });
        }

        let payload: SlackEventsPayload;
        try {
          payload = JSON.parse(rawBody) as SlackEventsPayload;
        } catch {
          logger.warn("Slack events request rejected: invalid JSON");
          return json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (payload.api_app_id && payload.api_app_id !== env.SLACK_APP_ID) {
          logger.warn("Slack events request rejected: wrong app", {
            apiAppId: payload.api_app_id,
          });
          return json({ error: "Wrong Slack app" }, { status: 403 });
        }

        if (payload.type === "url_verification") {
          return json({ challenge: payload.challenge ?? "" });
        }

        const event = payload.type === "event_callback" ? payload.event : undefined;
        if (!isSlackLinkSharedEvent(event)) {
          return json({ ok: true });
        }

        if (!isSlackUnfurlConfigured()) {
          logger.warn("Slack link_shared event received before unfurl configuration is complete", {
            hasAgentLogsTeamId: Boolean(env.SLACK_AGENTLOGS_TEAM_ID),
            hasBotToken: Boolean(env.SLACK_BOT_TOKEN),
          });
          return json({ ok: true });
        }

        await handleLinkSharedEvent(event);
        return json({ ok: true });
      },
    },
  },
});

function isSlackLinkSharedEvent(event: unknown): event is SlackLinkSharedEvent {
  if (!event || typeof event !== "object") {
    return false;
  }

  const candidate = event as Partial<SlackLinkSharedEvent>;

  return (
    candidate.type === "link_shared" &&
    typeof candidate.channel === "string" &&
    typeof candidate.message_ts === "string" &&
    (candidate.links === undefined || Array.isArray(candidate.links))
  );
}

async function handleLinkSharedEvent(event: SlackLinkSharedEvent) {
  const links = event.links ?? [];
  if (links.length === 0) {
    return;
  }

  const db = createDrizzle(env.DB);

  for (const link of links) {
    if (!link.url) {
      continue;
    }

    const target = parseAgentLogsUnfurlTarget(link.url);
    if (!target) {
      continue;
    }

    const { transcriptId } = target;
    const transcript = await getTranscriptForSlackUnfurl(db, transcriptId, env.SLACK_AGENTLOGS_TEAM_ID);
    if (!transcript) {
      logger.info("Slack unfurl skipped: transcript not visible to configured team", {
        transcriptId,
      });
      continue;
    }

    const permalink = target.messageIndex !== null ? await getPermalinkPreview(transcript, target.messageIndex) : null;

    const result = await sendSlackUnfurl({
      token: env.SLACK_BOT_TOKEN,
      channel: event.channel,
      messageTs: event.message_ts,
      url: link.url,
      blocks: buildSlackUnfurlBlocks(transcript, link.url, permalink),
    });

    if (!result.ok) {
      logger.warn("Slack unfurl request failed", {
        transcriptId,
        status: result.status,
        error: result.error,
      });
    }
  }
}

async function getPermalinkPreview(
  transcript: Awaited<ReturnType<typeof getTranscriptForSlackUnfurl>>,
  messageIndex: number,
) {
  if (!transcript) {
    return null;
  }

  const r2Key = transcript.repoName
    ? `${transcript.repoName}/${transcript.transcriptId}.json`
    : `private/${transcript.userId}/${transcript.transcriptId}.json`;

  const r2Object = await env.BUCKET.get(r2Key);
  if (!r2Object) {
    logger.warn("Slack unfurl permalink skipped: transcript content not found", {
      transcriptId: transcript.id,
    });
    return null;
  }

  const unifiedTranscript = unifiedTranscriptSchema.parse(JSON.parse(await r2Object.text()));
  const message = unifiedTranscript.messages[messageIndex];

  if (!message) {
    return null;
  }

  return {
    message: getMessagePreviewText(message),
    response: getNextAgentResponseText(unifiedTranscript.messages, messageIndex),
  };
}

function getNextAgentResponseText(messages: UnifiedTranscriptMessage[], messageIndex: number) {
  let response: string | null = null;

  for (let index = messageIndex + 1; index < messages.length; index++) {
    const message = messages[index];
    if (message.type === "user" || message.type === "command") {
      break;
    }

    if (message.type === "agent") {
      response = message.text;
    }
  }

  return response;
}

function getMessagePreviewText(message: UnifiedTranscriptMessage) {
  switch (message.type) {
    case "user":
    case "agent":
      return message.text;
    default:
      return null;
  }
}
