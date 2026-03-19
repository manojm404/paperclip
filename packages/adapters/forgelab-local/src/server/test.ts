import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@paperclipai/adapter-utils";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { access, constants } from "node:fs/promises";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  let status: AdapterEnvironmentTestResult["status"] = "pass";

  const workspacePath = ctx.config.workspacePath as string | undefined;

  // Check 1: workspacePath configuration exists
  if (!workspacePath) {
    checks.push({
      code: "workspace_path_missing",
      level: "error",
      message: "Missing workspacePath configuration",
      hint: "Set workspacePath to your ForgeLab workspace directory",
    });
    status = "fail";
  } else {
    // Check 2: Workspace directory exists
    if (!existsSync(workspacePath)) {
      checks.push({
        code: "workspace_not_found",
        level: "error",
        message: `ForgeLab workspace not found: ${workspacePath}`,
        hint: "Verify the path is correct and the directory exists",
      });
      status = "fail";
    } else {
      checks.push({
        code: "workspace_exists",
        level: "info",
        message: `Workspace directory found: ${workspacePath}`,
      });

      // Check 3: Workspace is readable
      try {
        await access(workspacePath, constants.R_OK);
        checks.push({
          code: "workspace_readable",
          level: "info",
          message: "Workspace directory is readable",
        });
      } catch {
        checks.push({
          code: "workspace_not_readable",
          level: "error",
          message: `Workspace directory is not readable: ${workspacePath}`,
          hint: "Check file permissions",
        });
        status = "fail";
      }

      // Check 4: Look for ForgeLab identity files
      const identityFiles = ["AGENTS.md", "SOUL.md", "IDENTITY.md"];
      const foundIdentityFiles: string[] = [];
      const missingIdentityFiles: string[] = [];

      for (const file of identityFiles) {
        const fullPath = join(workspacePath, file);
        if (existsSync(fullPath)) {
          foundIdentityFiles.push(file);
        } else {
          missingIdentityFiles.push(file);
        }
      }

      if (foundIdentityFiles.length > 0) {
        checks.push({
          code: "identity_files_found",
          level: "info",
          message: `Found ForgeLab identity files: ${foundIdentityFiles.join(", ")}`,
        });
      }

      if (missingIdentityFiles.length > 0) {
        checks.push({
          code: "identity_files_missing",
          level: "warn",
          message: `Missing ForgeLab identity files: ${missingIdentityFiles.join(", ")}`,
          hint: "These files help define agent behavior. Consider creating them.",
        });
      }

      // Check 5: Look for entry point
      const entryPoints = [
        join(workspacePath, "forge"),
        join(workspacePath, "forgelab"),
        join(workspacePath, "main.py"),
        join(workspacePath, "package.json"),
        join(workspacePath, "scripts", "run.sh"),
      ];

      const foundEntryPoint = entryPoints.find((path) => existsSync(path));

      if (foundEntryPoint) {
        checks.push({
          code: "entry_point_found",
          level: "info",
          message: `Found ForgeLab entry point: ${foundEntryPoint}`,
        });
      } else {
        checks.push({
          code: "entry_point_not_found",
          level: "warn",
          message: "No ForgeLab entry point found",
          hint: "Ensure your workspace has a runnable entry point (forge, main.py, package.json, etc.)",
        });
      }
    }
  }

  // Check 6: Deployment mode considerations
  if (ctx.deployment?.exposure === "public") {
    checks.push({
      code: "public_deployment_warning",
      level: "warn",
      message: "ForgeLab adapter runs local processes - ensure proper isolation in public deployments",
      hint: "Consider using containerization or sandboxing for untrusted workspaces",
    });
  }

  return {
    adapterType: "forgelab_local",
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}
