/**
 * Codex Hook Command
 *
 * Handles SessionStart, PreToolUse, PostToolUse, and Stop events from Codex hooks.
 * Reads JSON from stdin, uploads transcripts, tracks commits, and writes a JSON response.
 */

import { performUploadToAllEnvs, type MultiEnvUploadResult } from "../../lib/perform-upload";
import {
  containsGitCommit,
  getOrCreateTranscriptId,
  hookLogger as logger,
  parseBranchFromOutput,
  parseCommitShaFromOutput,
  parseCommitTitleFromOutput,
  readStdinWithPreview,
  trackCommit,
  type CommitTrackingPayload,
} from "../../lib/hooks-shared";

export interface CodexHookInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: "SessionStart" | "PreToolUse" | "PostToolUse" | "Stop" | string;
  model?: string;
  permission_mode?: string;
  source?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string | null;
  turn_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
  tool_response?: unknown;
  [key: string]: unknown;
}

export type CodexHookOutput = Record<string, never>;

type CodexUploadFn = (params: Parameters<typeof performUploadToAllEnvs>[0]) => Promise<MultiEnvUploadResult>;
type CodexTrackCommitFn = (payload: CommitTrackingPayload) => Promise<void>;
type CodexTranscriptIdFn = (sessionId: string) => Promise<string>;

interface CodexHookDeps {
  uploadFn?: CodexUploadFn;
  trackCommitFn?: CodexTrackCommitFn;
  getTranscriptIdFn?: CodexTranscriptIdFn;
}

const EMPTY_RESPONSE: CodexHookOutput = {};

export async function processCodexHookInput(
  hookInput: CodexHookInput,
  deps: CodexHookDeps = {},
): Promise<CodexHookOutput> {
  const eventName = hookInput.hook_event_name;
  const sessionId = getSessionId(hookInput);
  const uploadFn = deps.uploadFn ?? performUploadToAllEnvs;
  const trackCommitFn = deps.trackCommitFn ?? trackCommit;
  const getTranscriptIdFn = deps.getTranscriptIdFn ?? getOrCreateTranscriptId;

  if (eventName === "PreToolUse") {
    await handlePreToolUse(hookInput, uploadFn);
    return EMPTY_RESPONSE;
  }

  if (eventName === "PostToolUse") {
    await handlePostToolUse(hookInput, trackCommitFn, getTranscriptIdFn);
    return EMPTY_RESPONSE;
  }

  if (eventName === "Stop") {
    const transcriptPath = typeof hookInput.transcript_path === "string" ? hookInput.transcript_path : undefined;
    if (!transcriptPath) {
      logger.warn("Codex Stop: missing transcript_path", { sessionId: sessionId.substring(0, 8) });
      return EMPTY_RESPONSE;
    }

    try {
      const result = await uploadFn({
        transcriptPath,
        sessionId: hookInput.session_id,
        cwdOverride: typeof hookInput.cwd === "string" ? hookInput.cwd : undefined,
        source: "codex",
      });

      logUploadResults("Stop", sessionId, result);
    } catch (error) {
      logger.error("Codex Stop: upload error", {
        sessionId: sessionId.substring(0, 8),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return EMPTY_RESPONSE;
  }

  if (eventName === "SessionStart") {
    return EMPTY_RESPONSE;
  }

  logger.debug("Codex hook: skipping unsupported event", {
    eventName,
    sessionId: sessionId.substring(0, 8),
  });

  return EMPTY_RESPONSE;
}

function getSessionId(hookInput: CodexHookInput): string {
  return typeof hookInput.session_id === "string" ? hookInput.session_id : "unknown";
}

function getCommand(hookInput: CodexHookInput): string | undefined {
  return typeof hookInput.tool_input?.command === "string" ? hookInput.tool_input.command : undefined;
}

function isBashTool(hookInput: CodexHookInput): boolean {
  if (typeof hookInput.tool_name === "string") {
    return hookInput.tool_name.toLowerCase() === "bash";
  }

  return typeof hookInput.tool_input?.command === "string";
}

function extractToolOutputText(value: unknown, depth = 0): string | undefined {
  if (value == null || depth > 3) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(value) as unknown;
        const nested = extractToolOutputText(parsed, depth + 1);
        return nested ?? value;
      } catch {
        return value;
      }
    }
    return value;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["output", "stdout", "content", "message", "stderr"]) {
    const nested = extractToolOutputText(record[key], depth + 1);
    if (nested) {
      return nested;
    }
  }

  return JSON.stringify(record);
}

async function handlePreToolUse(hookInput: CodexHookInput, uploadFn: CodexUploadFn): Promise<void> {
  const sessionId = getSessionId(hookInput);
  const command = getCommand(hookInput);

  if (!isBashTool(hookInput) || !command || !containsGitCommit(command)) {
    return;
  }

  const transcriptPath = typeof hookInput.transcript_path === "string" ? hookInput.transcript_path : undefined;
  if (!transcriptPath) {
    logger.warn("Codex PreToolUse: missing transcript_path", { sessionId: sessionId.substring(0, 8) });
    return;
  }

  try {
    const result = await uploadFn({
      transcriptPath,
      sessionId: hookInput.session_id,
      cwdOverride: typeof hookInput.cwd === "string" ? hookInput.cwd : undefined,
      source: "codex",
    });

    logUploadResults("PreToolUse", sessionId, result);
  } catch (error) {
    logger.error("Codex PreToolUse: upload error", {
      sessionId: sessionId.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handlePostToolUse(
  hookInput: CodexHookInput,
  trackCommitFn: CodexTrackCommitFn,
  getTranscriptIdFn: CodexTranscriptIdFn,
): Promise<void> {
  const sessionId = getSessionId(hookInput);
  const command = getCommand(hookInput);

  if (!isBashTool(hookInput) || !command || !containsGitCommit(command)) {
    return;
  }

  if (typeof hookInput.session_id !== "string") {
    logger.warn("Codex PostToolUse: missing session_id");
    return;
  }

  const repoPath = typeof hookInput.cwd === "string" ? hookInput.cwd : undefined;
  if (!repoPath) {
    logger.warn("Codex PostToolUse: missing cwd", { sessionId: sessionId.substring(0, 8) });
    return;
  }

  const output = extractToolOutputText(hookInput.tool_response);
  if (!output) {
    logger.debug("Codex PostToolUse: missing tool output", { sessionId: sessionId.substring(0, 8) });
    return;
  }

  const commitSha = parseCommitShaFromOutput(output);
  if (!commitSha) {
    logger.debug("Codex PostToolUse: no commit SHA found", { sessionId: sessionId.substring(0, 8) });
    return;
  }

  const transcriptId = await getTranscriptIdFn(hookInput.session_id);
  const commitTitle = parseCommitTitleFromOutput(output);
  const branch = parseBranchFromOutput(output);

  await trackCommitFn({
    transcriptId,
    repoPath,
    timestamp: new Date().toISOString(),
    commitSha,
    commitTitle,
    branch,
  });

  logger.info("Codex PostToolUse: tracked commit", {
    sessionId: sessionId.substring(0, 8),
    transcriptId,
    commitSha: commitSha.substring(0, 8),
  });
}

export async function hookCommand(): Promise<void> {
  const startTime = Date.now();
  let eventName: string | undefined;
  let sessionId: string | undefined;

  try {
    const { full } = await readStdinWithPreview();

    logger.info(`Codex hook invoked (stdin: ${full.length} bytes)`);

    if (!full.trim()) {
      logger.warn("Codex hook received empty stdin - ignoring");
      writeResponse(EMPTY_RESPONSE);
      process.exit(0);
    }

    let hookInput: CodexHookInput;
    try {
      hookInput = JSON.parse(full) as CodexHookInput;
    } catch (error) {
      logger.error("Codex hook failed to parse stdin JSON", {
        error: error instanceof Error ? error.message : String(error),
      });
      writeResponse(EMPTY_RESPONSE);
      process.exit(1);
    }

    eventName = typeof hookInput.hook_event_name === "string" ? hookInput.hook_event_name : undefined;
    sessionId = typeof hookInput.session_id === "string" ? hookInput.session_id : undefined;

    logger.info(`Codex hook: ${eventName ?? "unknown"} (session: ${(sessionId ?? "unknown").substring(0, 8)}...)`);

    const response = await processCodexHookInput(hookInput);
    writeResponse(response);

    const duration = Date.now() - startTime;
    logger.info(`Codex hook completed: ${eventName ?? "unknown"} (${duration}ms)`, {
      sessionId: sessionId?.substring(0, 8),
    });
    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Codex hook failed: ${eventName ?? "unknown"} (${duration}ms)`, {
      sessionId: sessionId?.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    writeResponse(EMPTY_RESPONSE);
    process.exit(1);
  }
}

function writeResponse(response: CodexHookOutput): void {
  process.stdout.write(JSON.stringify(response));
}

function logUploadResults(eventName: string, sessionId: string, result: MultiEnvUploadResult): void {
  if (result.results.length === 0) {
    if (!result.anySuccess) {
      logger.info(`Codex ${eventName}: upload skipped (repo not allowed or no auth)`, {
        sessionId: sessionId.substring(0, 8),
      });
    }
    return;
  }

  for (const envResult of result.results) {
    if (envResult.success) {
      logger.info(`Codex ${eventName}: uploaded to ${envResult.envName} (${result.eventCount} events)`, {
        transcriptId: envResult.transcriptId,
        sessionId: sessionId.substring(0, 8),
      });
    } else {
      logger.error(`Codex ${eventName}: upload to ${envResult.envName} failed`, {
        sessionId: sessionId.substring(0, 8),
        error: envResult.error,
      });
    }
  }
}
