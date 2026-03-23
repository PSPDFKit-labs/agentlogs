import { installCodexHookIntegration } from "../../lib/codex-config";

const DEFAULT_HOOK_COMMAND =
  "bash -c 'if [ -n \"$AGENTLOGS_CLI_PATH\" ]; then exec $AGENTLOGS_CLI_PATH codex hook; else exec npx -y agentlogs@latest codex hook; fi'";

export async function codexInstallCommand(): Promise<void> {
  const result = installCodexHookIntegration(DEFAULT_HOOK_COMMAND);

  console.log("Installed AgentLogs Codex hooks.");
  console.log(`Config: ${result.paths.configPath}`);
  console.log(`Hooks: ${result.paths.hooksPath}`);

  if (!result.configUpdated && !result.hooksUpdated) {
    console.log("No changes were needed.");
  } else {
    if (result.configUpdated) {
      console.log("Enabled Codex hooks via [features].codex_hooks = true.");
    }
    if (result.hooksUpdated) {
      console.log("Wrote AgentLogs SessionStart and Stop hook entries.");
      console.log("Hooks prefer AGENTLOGS_CLI_PATH when set and otherwise fall back to agentlogs@latest.");
    }
  }
}
