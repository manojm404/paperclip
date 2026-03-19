import type { AdapterConfigFieldsProps } from "../types";
import {
  DraftInput,
  Field,
  ToggleField,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function ForgeLabLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field
        label="ForgeLab workspace path"
        hint="Absolute path to your ForgeLab workspace directory (e.g. /Users/you/projects/forgelab/workspace)"
      >
        <DraftInput
          value={
            isCreate
              ? values?.cwd ?? ""
              : eff(
                  "adapterConfig",
                  "workspacePath",
                  String(config.workspacePath ?? ""),
                )
          }
          onCommit={(v) =>
            isCreate
              ? set!({ cwd: v })
              : mark("adapterConfig", "workspacePath", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="/absolute/path/to/forgelab/workspace"
        />
      </Field>

      <Field
        label="Agent name"
        hint="Specific agent within ForgeLab (e.g. software-architect, content-creator)"
      >
        <DraftInput
          value={
            isCreate
              ? values?.args?.replace("--agent ", "") ?? ""
              : eff(
                  "adapterConfig",
                  "agentName",
                  String(config.agentName ?? ""),
                )
          }
          onCommit={(v) =>
            isCreate
              ? set!({ args: v ? `--agent ${v}` : "" })
              : mark("adapterConfig", "agentName", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="software-architect"
        />
      </Field>

      <Field
        label="Gemini API Key"
        hint="Your Gemini API key (optional if set in .env or environment)"
      >
        <DraftInput
          value={
            isCreate
              ? (values?.envBindings as any)?.GEMINI_API_KEY ?? ""
              : eff(
                  "adapterConfig",
                  "geminiApiKey",
                  String(config.geminiApiKey ?? ""),
                )
          }
          onCommit={(v) =>
            isCreate
              ? set!({ envBindings: { ...(values?.envBindings as any || {}), GEMINI_API_KEY: v } })
              : mark("adapterConfig", "geminiApiKey", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="AIzaSy..."
          type="password"
        />
      </Field>

      <Field
        label="Timeout (seconds)"
        hint="Maximum execution time before timeout"
      >
        <DraftInput
          value={
            isCreate
              ? "300"
              : eff(
                  "adapterConfig",
                  "timeoutSec",
                  String(config.timeoutSec ?? 300),
                )
          }
          onCommit={(v) => {
            const num = parseInt(v, 10);
            if (!isCreate) {
              mark("adapterConfig", "timeoutSec", num || 300);
            }
          }}
          immediate
          className={inputClass}
          placeholder="300"
          type="number"
        />
      </Field>

      <Field
        label="Log Level"
        hint="Verbosity of ForgeLab logs"
      >
        <select
          value={
            isCreate
              ? "info"
              : eff("adapterConfig", "logLevel", String(config.logLevel ?? "info"))
          }
          onChange={(e) =>
            !isCreate && mark("adapterConfig", "logLevel", e.target.value)
          }
          className={inputClass}
        >
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </Field>

      <ToggleField
        label="Preserve Memory"
        hint="Keep ForgeLab memory files between runs"
        checked={
          isCreate
            ? true
            : eff("adapterConfig", "preserveMemory", config.preserveMemory !== false)
        }
        onChange={(enabled: boolean) =>
          !isCreate && mark("adapterConfig", "preserveMemory", enabled)
        }
      />
    </>
  );
}
