# ForgeLab Local Adapter

This document describes how `@paperclipai/adapter-forgelab-local` invokes ForgeLab agents as workers in your Paperclip company.

## Overview

The ForgeLab adapter integrates [ForgeLab](https://github.com/your-org/forgelab) agents into Paperclip's orchestration system. ForgeLab provides:

- **Persistent identity** - Agents with names, personalities, and behavioral profiles
- **Memory system** - Long-term and daily memory files for continuity across sessions
- **Heartbeat system** - Proactive periodic check-ins for background tasks
- **Tool integration** - Access to external services (email, calendar, voice TTS, etc.)

When used with Paperclip, ForgeLab agents become workers in your AI company, handling tasks assigned through the Paperclip dashboard while maintaining their own memory and identity.

## Transport

This adapter uses local process execution:

1. Paperclip sends heartbeat/task trigger
2. Adapter spawns ForgeLab process in the configured workspace
3. ForgeLab executes with Paperclip context (company, task, budget)
4. Results stream back to Paperclip (logs, costs, summary)

## Configuration

### Required Fields

- `workspacePath` (string): Absolute path to your ForgeLab workspace directory

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agentName` | string | - | Specific agent within ForgeLab workspace |
| `command` | string | auto | Custom command to invoke ForgeLab |
| `args` | string[] | [] | Additional CLI arguments |
| `env` | object | {} | Environment variables to inject |
| `timeoutSec` | number | 300 | Execution timeout in seconds |
| `workingDir` | string | workspacePath | Working directory for execution |
| `logLevel` | string | info | ForgeLab log level (debug/info/warn/error) |
| `preserveMemory` | boolean | true | Keep memory files between runs |

### Paperclip Integration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `paperclipApiUrl` | string | - | Paperclip API base URL for callbacks |
| `reportToPaperclip` | boolean | true | Report results back to Paperclip |
| `syncMemory` | boolean | false | Sync ForgeLab memory with Paperclip task context |

## Example Configuration

```json
{
  "adapterType": "forgelab_local",
  "workspacePath": "/Users/you/projects/forgelab/workspace/agents/software-architect",
  "agentName": "software-architect",
  "timeoutSec": 600,
  "logLevel": "info",
  "env": {
    "OPENAI_API_KEY": "sk-...",
    "ELEVENLABS_API_KEY": "..."
  }
}
```

## Environment Variables

The adapter injects these environment variables into the ForgeLab process:

- `FORGELAB_RUN_ID` - Paperclip run identifier
- `FORGELAB_AGENT_ID` - Paperclip agent identifier
- `FORGELAB_COMPANY_ID` - Paperclip company identifier
- `FORGELAB_ADAPTER` - Always "paperclip"
- `FORGELAB_PAPERCLIP_CONTEXT` - JSON string with full Paperclip context
- `FORGELAB_LOG_LEVEL` - Log level from config

## Paperclip Context

ForgeLab agents receive Paperclip context via environment variable `FORGELAB_PAPERCLIP_CONTEXT`:

```json
{
  "paperclip": {
    "runId": "run_abc123",
    "company": {
      "id": "company_xyz"
    },
    "agent": {
      "id": "agent_123",
      "name": "Software Architect"
    },
    "task": {
      "key": "task_456"
    },
    "budget": {
      "monthlyLimit": 10.00,
      "remaining": 7.50
    }
  }
}
```

## Output Parsing

The adapter parses ForgeLab output for:

- **Token usage** - Extracts input/output token counts from logs
- **Summary** - Looks for `## Summary` or `SUMMARY:` markers
- **Runtime services** - Parses `SERVICE STARTED/STOPPED` markers for dev servers
- **Errors** - Captures `ERROR:` prefixed lines

## Logging

ForgeLab logs are prefixed with `[forgelab]` for easy identification:

```
[forgelab] workspace: /path/to/workspace
[forgelab] command: forge
[forgelab] args: --agent software-architect --task task_456
[forgelab] runId: run_abc123
[forgelab] agent: agent_123
```

## Error Codes

| Code | Description |
|------|-------------|
| `forgelab_workspace_path_missing` | No workspacePath configured |
| `forgelab_workspace_not_found` | Workspace directory doesn't exist |
| `forgelab_entry_point_not_found` | No runnable ForgeLab entry point found |
| `forgelab_spawn_failed` | Failed to spawn ForgeLab process |
| `forgelab_process_error` | ForgeLab process encountered an error |
| `forgelab_timeout` | Execution timed out |

## Security Considerations

- ForgeLab agents run as local processes with access to your filesystem
- Use proper isolation (containers, sandboxing) for untrusted workspaces
- Be cautious with `env` variables containing secrets
- The adapter does not sandbox ForgeLab execution - ensure your deployment mode is appropriate

## Troubleshooting

### "Workspace not found"

Verify the `workspacePath` is an absolute path and the directory exists:

```bash
ls -la /path/to/your/forgelab/workspace
```

### "Entry point not found"

Ensure your ForgeLab workspace has a runnable entry point:

- `forge` or `forgelab` executable
- `main.py` or `__main__.py` for Python
- `package.json` with bin script for Node.js
- `scripts/run.sh` shell script

### Memory not persisting

Set `preserveMemory: true` in your adapter config. Memory files are stored in:

```
<workspacePath>/memory/YYYY-MM-DD.md
<workspacePath>/MEMORY.md
```

## Comparison with Other Adapters

| Feature | ForgeLab | OpenClaw | Claude Code |
|---------|----------|----------|-------------|
| Identity/Memory | ✅ Built-in | ❌ | ❌ |
| Heartbeat System | ✅ Built-in | ⚠️ Via Paperclip | ⚠️ Via Paperclip |
| Tool Integration | ✅ Extensive | ⚠️ Limited | ⚠️ Limited |
| Execution Model | Local process | WebSocket gateway | Local process |
| Best For | Persistent agents | OpenClaw deployments | Simple CLI tasks |

## License

MIT
