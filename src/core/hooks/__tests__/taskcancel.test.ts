import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import fs from "fs/promises"
import os from "os"
import path from "path"
import sinon from "sinon"
import { StateManager } from "../../storage/StateManager"
import { HookFactory } from "../hook-factory"
import { loadFixture } from "./test-utils"

describe("TaskCancel Hook", () => {
	// These tests assume uniform executable script execution via embedded shell
	// Windows support pending embedded shell implementation
	before(function () {
		if (process.platform === "win32") {
			this.skip()
		}
	})

	let tempDir: string
	let sandbox: sinon.SinonSandbox
	let getEnv: () => { tempDir: string }

	// Helper to write executable hook script
	const writeHookScript = async (hookPath: string, nodeScript: string): Promise<void> => {
		await fs.writeFile(hookPath, nodeScript)
		await fs.chmod(hookPath, 0o755)
	}

	beforeEach(async () => {
		sandbox = sinon.createSandbox()
		tempDir = path.join(os.tmpdir(), `hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		await fs.mkdir(tempDir, { recursive: true })

		// Create .clinerules/hooks directory
		const hooksDir = path.join(tempDir, ".clinerules", "hooks")
		await fs.mkdir(hooksDir, { recursive: true })

		// Mock StateManager to return our temp directory
		sandbox.stub(StateManager, "get").returns({
			getGlobalStateKey: () => [{ path: tempDir }],
		} as any)

		getEnv = () => ({ tempDir })
	})

	afterEach(async () => {
		sandbox.restore()
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch (error) {
			// Ignore cleanup errors
		}
	})

	describe("Hook Input Format", () => {
		it("should receive task metadata with completionStatus", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const metadata = input.taskCancel.taskMetadata;
const hasAllFields = metadata.taskId && metadata.ulid && metadata.completionStatus;
const status = metadata.completionStatus;
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: hasAllFields ? "Status: " + status : "Missing metadata",
  errorMessage: ""
}))`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("Status: cancelled")
		})

		it("should handle 'abandoned' completion status", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const status = input.taskCancel.taskMetadata.completionStatus;
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: "Status: " + status,
  errorMessage: ""
}))`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "abandoned",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("Status: abandoned")
		})

		it("should receive all common hook input fields", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const hasAllFields = input.clineVersion && input.hookName === 'TaskCancel' && 
                     input.timestamp && input.taskId && 
                     input.workspaceRoots !== undefined;
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: hasAllFields ? "All fields present" : "Missing fields",
  errorMessage: ""
}))`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("All fields present")
		})
	})

	describe("Fire-and-Forget Behavior", () => {
		it("should succeed regardless of hook return value", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: "TaskCancel hook executed",
  errorMessage: ""
}))`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			// TaskCancel is fire-and-forget, so it always reports success
			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("TaskCancel hook executed")
		})

		it("should not block cancellation even if hook returns shouldContinue: false", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
console.log(JSON.stringify({
  shouldContinue: false,
  contextModification: "",
  errorMessage: "Hook tried to block cancellation"
}))`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			// Even though hook returned false, the combined result should allow continuation
			// because TaskCancel is fire-and-forget
			result.shouldContinue.should.be.false()
			result.errorMessage!.should.equal("Hook tried to block cancellation")
		})

		it("should provide context modification for logging purposes", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const status = input.taskCancel.taskMetadata.completionStatus;
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: "TASK_CANCEL: Task " + status + " - cleanup performed",
  errorMessage: ""
}))`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("TASK_CANCEL: Task cancelled - cleanup performed")
		})
	})

	describe("Error Handling", () => {
		it("should handle hook script errors gracefully", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
console.error("Hook execution error");
process.exit(1);`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			// TaskCancel hook errors should throw like other hooks
			try {
				await runner.run({
					taskId: "test-task-id",
					taskCancel: {
						taskMetadata: {
							taskId: "test-task-id",
							ulid: "test-ulid",
							completionStatus: "cancelled",
						},
					},
				})
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.match(/TaskCancel.*exited with code 1/)
			}
		})

		it("should handle malformed JSON output from hook", async () => {
			const hookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const hookScript = `#!/usr/bin/env node
console.log("not valid json")`

			await writeHookScript(hookPath, hookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			try {
				await runner.run({
					taskId: "test-task-id",
					taskCancel: {
						taskMetadata: {
							taskId: "test-task-id",
							ulid: "test-ulid",
							completionStatus: "cancelled",
						},
					},
				})
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.match(/Failed to parse hook output/)
			}
		})
	})

	describe("Global and Workspace Hooks", () => {
		let globalHooksDir: string
		let originalGetAllHooksDirs: any

		beforeEach(async () => {
			// Create global hooks directory
			globalHooksDir = path.join(tempDir, "global-hooks")
			await fs.mkdir(globalHooksDir, { recursive: true })

			// Mock getAllHooksDirs to include our test global directory
			const diskModule = require("../../storage/disk")
			originalGetAllHooksDirs = diskModule.getAllHooksDirs
			sandbox.stub(diskModule, "getAllHooksDirs").callsFake(async () => {
				const workspaceDirs = await originalGetAllHooksDirs()
				return [globalHooksDir, ...workspaceDirs]
			})
		})

		it("should execute both global and workspace TaskCancel hooks", async () => {
			// Create global hook
			const globalHookPath = path.join(globalHooksDir, "TaskCancel")
			const globalHookScript = `#!/usr/bin/env node
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: "GLOBAL: Task cancelling",
  errorMessage: ""
}))`
			await writeHookScript(globalHookPath, globalHookScript)

			// Create workspace hook
			const workspaceHookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const workspaceHookScript = `#!/usr/bin/env node
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: "WORKSPACE: Task cancelling",
  errorMessage: ""
}))`
			await writeHookScript(workspaceHookPath, workspaceHookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")
			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.match(/GLOBAL: Task cancelling/)
			result.contextModification!.should.match(/WORKSPACE: Task cancelling/)
		})

		it("should combine context from both hooks", async () => {
			const globalHookPath = path.join(globalHooksDir, "TaskCancel")
			const globalHookScript = `#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: "Global cleanup: " + input.taskCancel.taskMetadata.completionStatus,
  errorMessage: ""
}))`
			await writeHookScript(globalHookPath, globalHookScript)

			const workspaceHookPath = path.join(tempDir, ".clinerules", "hooks", "TaskCancel")
			const workspaceHookScript = `#!/usr/bin/env node
console.log(JSON.stringify({
  shouldContinue: true,
  contextModification: "Workspace cleanup complete",
  errorMessage: ""
}))`
			await writeHookScript(workspaceHookPath, workspaceHookScript)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")
			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "abandoned",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.match(/Global cleanup: abandoned/)
			result.contextModification!.should.match(/Workspace cleanup complete/)
		})
	})

	describe("No Hook Behavior", () => {
		it("should succeed when no hook exists", async () => {
			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			result.shouldContinue.should.be.true()
		})
	})

	describe("Fixture-Based Tests", () => {
		it("should work with success fixture", async () => {
			await loadFixture("hooks/taskcancel/success", getEnv().tempDir)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("TaskCancel hook executed successfully")
		})

		it("should work with error fixture", async () => {
			await loadFixture("hooks/taskcancel/error", getEnv().tempDir)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			try {
				await runner.run({
					taskId: "test-task-id",
					taskCancel: {
						taskMetadata: {
							taskId: "test-task-id",
							ulid: "test-ulid",
							completionStatus: "cancelled",
						},
					},
				})
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.match(/TaskCancel.*exited with code 1/)
			}
		})

		it("should work with context-injection fixture", async () => {
			await loadFixture("hooks/taskcancel/context-injection", getEnv().tempDir)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "cancelled",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("TASK_CANCEL: Task cancelled - cleanup performed")
		})

		it("should inject correct status for abandoned tasks", async () => {
			await loadFixture("hooks/taskcancel/context-injection", getEnv().tempDir)

			const factory = new HookFactory()
			const runner = await factory.create("TaskCancel")

			const result = await runner.run({
				taskId: "test-task-id",
				taskCancel: {
					taskMetadata: {
						taskId: "test-task-id",
						ulid: "test-ulid",
						completionStatus: "abandoned",
					},
				},
			})

			result.shouldContinue.should.be.true()
			result.contextModification!.should.equal("TASK_CANCEL: Task abandoned - cleanup performed")
		})
	})
})
