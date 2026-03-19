export const type = "forgelab_local";
export const label = "ForgeLab Local";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# forgelab_local agent configuration

Adapter: forgelab_local

Use when:
- You want Paperclip to invoke a ForgeLab agent as a worker in your company.
- You want ForgeLab's memory, identity, and heartbeat system integrated with Paperclip orchestration.
- You have a ForgeLab workspace with agent definitions (AGENTS.md, SOUL.md, etc.).

Don't use when:
- You only need simple CLI agent execution without ForgeLab's memory/identity features.
- Your ForgeLab workspace is not accessible from the Paperclip server.

Core fields:
- workspacePath (string, required): Absolute path to the ForgeLab workspace/agent directory
- agentName (string, optional): Specific agent name within ForgeLab (default: derived from workspace)
- command (string, optional): Custom command to invoke ForgeLab (default: auto-detected)
- args (string[], optional): Additional CLI arguments to pass to ForgeLab
- env (object, optional): Environment variables to inject into the ForgeLab process

Memory & Identity fields:
- preserveMemory (boolean, optional): Keep ForgeLab memory files between runs (default true)
- identityProfile (string, optional): Path to custom IDENTITY.md override
- soulProfile (string, optional): Path to custom SOUL.md override

Execution behavior fields:
- timeoutSec (number, optional): Adapter timeout in seconds (default 300)
- workingDir (string, optional): Working directory for ForgeLab execution (default: workspacePath)
- logLevel (string, optional): ForgeLab log level: debug, info, warn, error (default: info)

Paperclip integration fields:
- paperclipApiUrl (string, optional): Paperclip API base URL for callbacks
- reportToPaperclip (boolean, optional): Report execution results back to Paperclip (default true)
- syncMemory (boolean, optional): Sync ForgeLab memory with Paperclip task context (default false)

Standard outbound payload additions:
- paperclip (object): Standardized Paperclip context added to every ForgeLab invocation
- paperclip.company (object): Company information from Paperclip
- paperclip.task (object): Current task/goal being executed
- paperclip.budget (object): Budget constraints from Paperclip

Standard result metadata supported:
- meta.forgelab (object): ForgeLab-specific execution metadata
- meta.memory (object): Memory state summary (if syncMemory enabled)
- meta.identity (object): Agent identity snapshot
`;
