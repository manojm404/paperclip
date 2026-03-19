import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterRuntimeServiceReport,
} from "@paperclipai/adapter-utils";
import { asString, asNumber } from "@paperclipai/adapter-utils/server-utils";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

type ForgeLabWakePayload = {
  runId: string;
  agentId: string;
  companyId: string;
  taskId: string | null;
  issueId: string | null;
  wakeReason: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function buildWakePayload(ctx: AdapterExecutionContext): ForgeLabWakePayload {
  return {
    runId: ctx.runId,
    agentId: ctx.agent.id,
    companyId: ctx.agent.companyId,
    taskId: ctx.runtime.taskKey ?? null,
    issueId: null,
    wakeReason: nonEmptyString(ctx.context.wakeReason) ?? "heartbeat",
  };
}

function buildPaperclipContext(ctx: AdapterExecutionContext): Record<string, unknown> {
  return {
    paperclip: {
      runId: ctx.runId,
      company: {
        id: ctx.agent.companyId,
      },
      agent: {
        id: ctx.agent.id,
        name: ctx.agent.name,
      },
      task: {
        key: ctx.runtime.taskKey,
      },
      budget: asRecord(ctx.context.budget) ?? {},
    },
  };
}

function findForgeLabCommand(workspacePath: string): string | null {
  // Check for common ForgeLab entry points
  const candidates = [
    join(workspacePath, "forge"),
    join(workspacePath, "forgelab"),
    join(workspacePath, "bin", "forge"),
    join(workspacePath, "scripts", "run.sh"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Check if it's a Node.js project with a CLI
  const packageJsonPath = join(workspacePath, "package.json");
  if (existsSync(packageJsonPath)) {
    return "node";
  }

  // Default to looking for Python entry point
  if (existsSync(join(workspacePath, "main.py")) || existsSync(join(workspacePath, "__main__.py"))) {
    return "python3";
  }

  return null;
}

function buildForgeLabArgs(
  workspacePath: string,
  config: Record<string, unknown>,
  wakePayload: ForgeLabWakePayload,
): string[] {
  const args: string[] = [];

  // Add workspace/agent path
  const agentName = asString(config.agentName, "");
  if (agentName) {
    args.push("--agent", agentName);
  }

  // Add wake reason/context
  if (wakePayload.wakeReason) {
    args.push("--wake-reason", wakePayload.wakeReason);
  }

  // Add task context
  if (wakePayload.taskId) {
    args.push("--task", wakePayload.taskId);
  }

  // Add custom args from config
  const customArgs = Array.isArray(config.args) ? config.args : [];
  args.push(...customArgs.map(String));

  return args;
}

function buildForgeLabEnv(
  ctx: AdapterExecutionContext,
  paperclipContext: Record<string, unknown>,
): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    FORGELAB_RUN_ID: ctx.runId,
    FORGELAB_AGENT_ID: ctx.agent.id,
    FORGELAB_COMPANY_ID: ctx.agent.companyId,
    FORGELAB_ADAPTER: "paperclip",
  };

  // Add Paperclip context as JSON env var
  env.FORGELAB_PAPERCLIP_CONTEXT = JSON.stringify(paperclipContext);

  // Add GEMINI_API_KEY from config (passed from Paperclip secrets)
  const geminiApiKey = asString(ctx.config.geminiApiKey, "");
  if (geminiApiKey) {
    env.GEMINI_API_KEY = geminiApiKey;
  }

  // Add custom env from config
  const customEnv = asRecord(ctx.config.env);
  if (customEnv) {
    for (const [key, value] of Object.entries(customEnv)) {
      if (typeof value === "string") {
        env[key] = value;
      }
    }
  }

  return env;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const workspacePath = asString(ctx.config.workspacePath, "").trim();
  
  if (!workspacePath) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "ForgeLab adapter missing workspacePath configuration",
      errorCode: "forgelab_workspace_path_missing",
    };
  }

  if (!existsSync(workspacePath)) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `ForgeLab workspace not found: ${workspacePath}`,
      errorCode: "forgelab_workspace_not_found",
    };
  }

  const timeoutSec = Math.max(0, Math.floor(asNumber(ctx.config.timeoutSec, 300)));
  const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : 0;

  const command = asString(ctx.config.command, "") || findForgeLabCommand(workspacePath);
  
  if (!command) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Could not find ForgeLab entry point in ${workspacePath}`,
      errorCode: "forgelab_entry_point_not_found",
    };
  }

  const wakePayload = buildWakePayload(ctx);
  const paperclipContext = buildPaperclipContext(ctx);
  const args = buildForgeLabArgs(workspacePath, ctx.config, wakePayload);
  const env = buildForgeLabEnv(ctx, paperclipContext);
  const workingDir = asString(ctx.config.workingDir, workspacePath);
  const logLevel = asString(ctx.config.logLevel, "info");

  env.FORGELAB_LOG_LEVEL = logLevel;

  await ctx.onLog("stdout", `[forgelab] workspace: ${workspacePath}\n`);
  await ctx.onLog("stdout", `[forgelab] command: ${command}\n`);
  await ctx.onLog("stdout", `[forgelab] args: ${args.join(" ")}\n`);
  await ctx.onLog("stdout", `[forgelab] runId: ${ctx.runId}\n`);
  await ctx.onLog("stdout", `[forgelab] agent: ${ctx.agent.id}\n`);

  return new Promise<AdapterExecutionResult>((resolve) => {
    let timedOut = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    let childProcess;
    
    try {
      childProcess = spawn(command, args, {
        cwd: workingDir,
        env,
        shell: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Failed to spawn ForgeLab process: ${message}`,
        errorCode: "forgelab_spawn_failed",
      });
      return;
    }

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        childProcess.kill("SIGTERM");
        setTimeout(() => {
          if (childProcess.exitCode === null) {
            childProcess.kill("SIGKILL");
          }
        }, 5000);
      }, timeoutMs);
    }

    childProcess.stdout?.on("data", async (data: Buffer) => {
      const text = data.toString("utf8");
      stdoutChunks.push(text);
      await ctx.onLog("stdout", text);
    });

    childProcess.stderr?.on("data", async (data: Buffer) => {
      const text = data.toString("utf8");
      stderrChunks.push(text);
      await ctx.onLog("stderr", text);
    });

    childProcess.on("close", (code, signal) => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }

      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");

      // Try to parse ForgeLab output for usage/cost info
      const usage = parseForgeLabUsage(stdout);
      const summary = extractSummary(stdout, stderr);
      const runtimeServices = parseRuntimeServices(stdout);

      resolve({
        exitCode: code ?? 1,
        signal: signal ?? null,
        timedOut,
        ...(timedOut ? { errorMessage: `ForgeLab execution timed out after ${timeoutSec}s` } : {}),
        ...(usage ? { usage } : {}),
        ...(summary ? { summary } : {}),
        ...(runtimeServices.length > 0 ? { runtimeServices } : {}),
        resultJson: {
          stdout,
          stderr,
          forgellab: {
            workspacePath,
            runId: ctx.runId,
            agentId: ctx.agent.id,
          },
        },
      });
    });

    childProcess.on("error", (err) => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }

      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `ForgeLab process error: ${err.message}`,
        errorCode: "forgelab_process_error",
        errorMeta: {
          code: err.name,
          message: err.message,
        },
      });
    });
  });
}

function parseForgeLabUsage(stdout: string): { inputTokens: number; outputTokens: number } | undefined {
  // Look for token usage patterns in ForgeLab output
  const tokenPatterns = [
    /tokens:\s*(\d+)\s*input,\s*(\d+)\s*output/i,
    /input_tokens[:\s]+(\d+).*output_tokens[:\s]+(\d+)/i,
    /prompt_tokens[:\s]+(\d+).*completion_tokens[:\s]+(\d+)/i,
  ];

  for (const pattern of tokenPatterns) {
    const match = stdout.match(pattern);
    if (match) {
      const inputTokens = parseInt(match[1], 10);
      const outputTokens = parseInt(match[2], 10);
      if (inputTokens > 0 || outputTokens > 0) {
        return { inputTokens, outputTokens };
      }
    }
  }

  return undefined;
}

function extractSummary(stdout: string, stderr: string): string | null {
  // Look for summary/completion markers in output
  const summaryPatterns = [
    /## Summary\s*\n([\s\S]*?)(?=\n##|\n---|$)/i,
    /SUMMARY:\s*([\s\S]*?)(?=\n\n|$)/i,
    /COMPLETED:\s*([\s\S]*?)(?=\n\n|$)/i,
    /## Response\s*\n([\s\S]*?)(?=\n##|\n---|$)/i,
  ];

  for (const pattern of summaryPatterns) {
    const match = stdout.match(pattern);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }

  // Fall back to last few lines of output
  const lines = stdout.split("\n").filter((line) => line.trim());
  if (lines.length > 0) {
    return lines.slice(-5).join("\n").trim() || null;
  }

  return null;
}

function parseRuntimeServices(stdout: string): AdapterRuntimeServiceReport[] {
  const services: AdapterRuntimeServiceReport[] = [];
  
  // Look for service start/stop markers in ForgeLab output
  const servicePattern = /SERVICE\s+(STARTED|STOPPED|RUNNING):\s+(\S+)(?:\s+port[:\s]+(\d+))?(?:\s+url[:\s]+(\S+))?/gi;
  let match;

  while ((match = servicePattern.exec(stdout)) !== null) {
    const [, status, name, port, url] = match;
    services.push({
      serviceName: name,
      status: status.toLowerCase() as "starting" | "running" | "stopped" | "failed",
      lifecycle: "ephemeral",
      scopeType: "run",
      ...(port ? { port: parseInt(port, 10) } : {}),
      ...(url ? { url } : {}),
    });
  }

  return services;
}
