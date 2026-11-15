import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TestRunDto } from "../../../shared/types.js";
import type { PlatformDatabase } from "../../db/database.js";
import type { SandboxRunner } from "./runner.js";

const parseNodeTestCounts = (output: string, exitCode: number): { total: number; passed: number; failed: number } => {
  const passMatch = output.match(/# pass (\d+)/i);
  const failMatch = output.match(/# fail (\d+)/i);
  const testsMatch = output.match(/# tests (\d+)/i);
  if (testsMatch) {
    const total = Number.parseInt(testsMatch[1] ?? "0", 10);
    const passed = Number.parseInt(passMatch?.[1] ?? "0", 10);
    const failed = Number.parseInt(failMatch?.[1] ?? "0", 10);
    return { total, passed, failed };
  }
  const okLines = (output.match(/^ok \d+/gm) || []).length;
  const notOkLines = (output.match(/^not ok \d+/gm) || []).length;
  if (okLines + notOkLines > 0) {
    return { total: okLines + notOkLines, passed: okLines, failed: notOkLines };
  }
  return exitCode === 0 ? { total: 1, passed: 1, failed: 0 } : { total: 1, passed: 0, failed: 1 };
};

export class ProjectTestRunner {
  readonly #db: PlatformDatabase;
  readonly #sandbox: SandboxRunner;

  constructor(db: PlatformDatabase, sandbox: SandboxRunner) {
    this.#db = db;
    this.#sandbox = sandbox;
  }

  async runTests(projectId: string, workspacePath: string, runId: string | null = null): Promise<TestRunDto> {
    const hasTestsDir = existsSync(join(workspacePath, "tests"));
    const testFiles = hasTestsDir
      ? readdirSync(join(workspacePath, "tests")).filter((f) => f.endsWith(".test.mjs") || f.endsWith(".test.js"))
      : [];

    // 1. Always syntax-check src/server.mjs & public/app.js first
    const syntaxCheckCmd = [
      existsSync(join(workspacePath, "src/server.mjs")) ? "node --check src/server.mjs" : null,
      existsSync(join(workspacePath, "src/db.mjs")) ? "node --check src/db.mjs" : null,
      existsSync(join(workspacePath, "public/app.js")) ? "node --check public/app.js" : null,
    ]
      .filter(Boolean)
      .join(" && ");

    if (syntaxCheckCmd) {
      const syn = await this.#sandbox.execCommand(projectId, workspacePath, syntaxCheckCmd, 15_000);
      if (syn.exitCode !== 0) {
        const dto: TestRunDto = {
          id: `tr-${randomUUID().slice(0, 8)}`,
          projectId,
          runId,
          command: syntaxCheckCmd,
          status: "failed",
          total: 1,
          passed: 0,
          failed: 1,
          outputText: `${syn.stdout}\n${syn.stderr}`.trim(),
          durationMs: syn.durationMs,
          createdAt: new Date().toISOString(),
        };
        this.saveTestRun(dto);
        this.#sandbox.addProblem(projectId, "syntax-check", dto.outputText);
        return dto;
      }
    }

    const command =
      testFiles.length > 0
        ? `node --test ${testFiles.map((f) => `tests/${f}`).join(" ")}`
        : "node --test";

    const result = await this.#sandbox.execCommand(projectId, workspacePath, command, 30_000);
    const combinedOutput = `${result.stdout}\n${result.stderr}`.trim();
    const counts = parseNodeTestCounts(combinedOutput, result.exitCode);
    const status: TestRunDto["status"] = result.exitCode === 0 && counts.failed === 0 ? "passed" : "failed";

    const dto: TestRunDto = {
      id: `tr-${randomUUID().slice(0, 8)}`,
      projectId,
      runId,
      command,
      status,
      total: counts.total,
      passed: counts.passed,
      failed: counts.failed,
      outputText: combinedOutput,
      durationMs: result.durationMs,
      createdAt: new Date().toISOString(),
    };
    this.saveTestRun(dto);

    if (status === "failed") {
      this.#sandbox.addProblem(projectId, "test-suite", combinedOutput);
    }
    return dto;
  }

  saveTestRun(dto: TestRunDto): void {
    this.#db.run(
      `INSERT INTO test_runs (id, project_id, run_id, command, status, total, passed, failed, output_text, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.id,
        dto.projectId,
        dto.runId,
        dto.command,
        dto.status,
        dto.total,
        dto.passed,
        dto.failed,
        dto.outputText,
        dto.durationMs,
        dto.createdAt,
      ],
    );
  }

  listForProject(projectId: string): TestRunDto[] {
    const rows = this.#db.all<{
      id: string;
      project_id: string;
      run_id: string | null;
      command: string;
      status: "passed" | "failed" | "error";
      total: number;
      passed: number;
      failed: number;
      output_text: string;
      duration_ms: number;
      created_at: string;
    }>("SELECT * FROM test_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 25", [projectId]);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      runId: r.run_id,
      command: r.command,
      status: r.status,
      total: r.total,
      passed: r.passed,
      failed: r.failed,
      outputText: r.output_text,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    }));
  }
}
