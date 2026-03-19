import type { UIAdapterModule } from "../types";
import { ForgeLabLocalConfigFields } from "./config-fields";

// Parse ForgeLab stdout lines into transcript entries
function parseForgeLabStdoutLine(line: string, ts: string): import("@paperclipai/adapter-utils").TranscriptEntry[] {
  const entries: import("@paperclipai/adapter-utils").TranscriptEntry[] = [];

  if (!line.trim()) return entries;

  // Parse [forgelab] prefix logs
  if (line.startsWith("[forgelab]")) {
    entries.push({
      kind: "system",
      ts,
      text: line,
    });
    return entries;
  }

  // Parse [forgelab:error] logs
  if (line.startsWith("[forgelab:error]")) {
    entries.push({
      kind: "stderr",
      ts,
      text: line.replace("[forgelab:error] ", ""),
    });
    return entries;
  }

  // Parse ## Response sections
  if (line.startsWith("## Response")) {
    entries.push({
      kind: "system",
      ts,
      text: line,
    });
    return entries;
  }

  // Default: stdout
  entries.push({
    kind: "stdout",
    ts,
    text: line,
  });

  return entries;
}

// Build adapter config from form values
function buildForgeLabLocalConfig(values: import("@paperclipai/adapter-utils").CreateConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    workspacePath: values.cwd,
    timeoutSec: values.maxTurnsPerRun,
  };

  // Parse agent name from args if present
  if (values.args) {
    const argsMatch = values.args.match(/--agent\s+(\S+)/);
    if (argsMatch) {
      config.agentName = argsMatch[1];
    }
  }

  // Add API key if provided
  if (values.envBindings?.GEMINI_API_KEY) {
    config.geminiApiKey = values.envBindings.GEMINI_API_KEY;
  }

  // Add log level
  if (values.envVars) {
    const logLevelMatch = values.envVars.match(/FORGELAB_LOG_LEVEL=(\w+)/);
    if (logLevelMatch) {
      config.logLevel = logLevelMatch[1];
    }
  }

  return config;
}

export const forgelabLocalUIAdapter: UIAdapterModule = {
  type: "forgelab_local",
  label: "ForgeLab Local",
  parseStdoutLine: parseForgeLabStdoutLine,
  ConfigFields: ForgeLabLocalConfigFields,
  buildAdapterConfig: buildForgeLabLocalConfig,
};
