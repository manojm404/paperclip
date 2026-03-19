import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function parseForgeLabLine(line: string, ts: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // Skip empty lines
  if (!line.trim()) {
    return entries;
  }

  // Parse ForgeLab log prefixes
  // Format: [forgelab] message or [forgelab:level] message

  const logMatch = line.match(/^\[forgelab(?::(\w+))?\]\s*(.*)$/);
  if (logMatch) {
    const [, level, message] = logMatch;
    const logLevel = level?.toLowerCase() ?? "info";

    if (logLevel === "error" || logLevel === "stderr") {
      entries.push({
        kind: "stderr",
        ts,
        text: message,
      });
    } else if (logLevel === "debug" && process.env.DEBUG !== "true") {
      // Skip debug logs unless DEBUG mode is enabled
      return entries;
    } else {
      entries.push({
        kind: "system",
        ts,
        text: line,
      });
    }
    return entries;
  }

  // Parse assistant response markers
  // Format: ## Response or ASSISTANT:
  if (line.startsWith("## Response") || line.startsWith("ASSISTANT:")) {
    entries.push({
      kind: "assistant",
      ts,
      text: line,
    });
    return entries;
  }

  // Parse thinking markers
  // Format: ## Thinking or THINKING:
  if (line.startsWith("## Thinking") || line.startsWith("THINKING:")) {
    entries.push({
      kind: "thinking",
      ts,
      text: line,
    });
    return entries;
  }

  // Parse tool call markers
  // Format: TOOL: name(args) or ## Tool: name
  const toolMatch = line.match(/^(?:TOOL:\s*(\w+)(?:\((.*)\))?|## Tool:\s*(\w+))$/);
  if (toolMatch) {
    const name = toolMatch[1] ?? toolMatch[3] ?? "unknown";
    const input = toolMatch[2] ?? "{}";
    entries.push({
      kind: "tool_call",
      ts,
      name,
      input: safeParse(input),
    });
    return entries;
  }

  // Parse tool result markers
  // Format: TOOL_RESULT: content or ## Tool Result: content
  const toolResultMatch = line.match(/^(?:TOOL_RESULT:\s*|## Tool Result:\s*)(.*)$/);
  if (toolResultMatch) {
    entries.push({
      kind: "tool_result",
      ts,
      toolUseId: "forgelab-tool",
      content: toolResultMatch[1],
      isError: false,
    });
    return entries;
  }

  // Parse error markers
  // Format: ERROR: message or ## Error: message
  const errorMatch = line.match(/^(?:ERROR:\s*|## Error:\s*)(.*)$/);
  if (errorMatch) {
    entries.push({
      kind: "system",
      ts,
      text: `❌ ${errorMatch[1]}`,
    });
    return entries;
  }

  // Parse summary markers
  // Format: ## Summary or SUMMARY:
  if (line.startsWith("## Summary") || line.startsWith("SUMMARY:")) {
    entries.push({
      kind: "system",
      ts,
      text: `📋 ${line}`,
    });
    return entries;
  }

  // Default: treat as stdout/system output
  entries.push({
    kind: "stdout",
    ts,
    text: line,
  });

  return entries;
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

export const formatStdoutEvent: CLIAdapterModule["formatStdoutEvent"] = (line, debug) => {
  const ts = new Date().toISOString();
  const entries = parseForgeLabLine(line, ts);

  for (const entry of entries) {
    if (entry.kind === "stderr" || entry.kind === "stdout") {
      // Already formatted
      process.stdout.write(`${entry.text}\n`);
    } else if (entry.kind === "system") {
      if (debug || !entry.text.startsWith("[forgelab:debug]")) {
        process.stdout.write(`\u001b[90m${entry.text}\u001b[0m\n`);
      }
    } else if (entry.kind === "assistant") {
      process.stdout.write(`\u001b[36m${entry.text}\u001b[0m\n`);
    } else if (entry.kind === "thinking") {
      process.stdout.write(`\u001b[90m${entry.text}\u001b[0m\n`);
    } else if (entry.kind === "tool_call") {
      process.stdout.write(`\u001b[33m🔧 ${entry.name}(${JSON.stringify(entry.input)})\u001b[0m\n`);
    } else if (entry.kind === "tool_result") {
      process.stdout.write(`\u001b[32m✅ ${entry.content}\u001b[0m\n`);
    }
  }
};
