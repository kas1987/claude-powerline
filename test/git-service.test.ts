import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../src/segments/git";

// Mock exec so tests don't run real git commands
jest.mock("node:child_process", () => ({
  exec: jest.fn(),
}));

const mockExec: jest.Mock = jest.requireMock("node:child_process").exec;

function makeExec(responses: Record<string, string>) {
  return (cmd: string, _opts: any, callback: any) => {
    for (const [pattern, output] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        if (typeof callback === "function") callback(null, { stdout: output, stderr: "" });
        return;
      }
    }
    if (typeof callback === "function") callback(null, { stdout: "", stderr: "" });
  };
}

function makeExecError(patterns: string[]) {
  return (cmd: string, _opts: any, callback: any) => {
    for (const pattern of patterns) {
      if (cmd.includes(pattern)) {
        if (typeof callback === "function") callback(new Error("git error"), null);
        return;
      }
    }
    if (typeof callback === "function") callback(null, { stdout: "", stderr: "" });
  };
}

describe("GitService", () => {
  let tempDir: string;
  let gitService: GitService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "git-service-test-"));
    gitService = new GitService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getGitInfo - not a git repo", () => {
    it("returns null when no .git dir and rev-parse fails", async () => {
      mockExec.mockImplementation(makeExecError(["rev-parse"]));

      const result = await gitService.getGitInfo(tempDir);
      expect(result).toBeNull();
    });
  });

  describe("getGitInfo - basic branch and status", () => {
    beforeEach(() => {
      mkdirSync(join(tempDir, ".git"), { recursive: true });
    });

    it("returns clean status on a branch with no changes", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count @{u}..HEAD": "0\n",
          "git rev-list --count HEAD..@{u}": "0\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir);
      expect(result).not.toBeNull();
      expect(result!.branch).toBe("main");
      expect(result!.status).toBe("clean");
      expect(result!.ahead).toBe(0);
      expect(result!.behind).toBe(0);
    });

    it("returns dirty status when there are unstaged changes", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n M src/index.ts\n",
          "git rev-list --count @{u}..HEAD": "0\n",
          "git rev-list --count HEAD..@{u}": "0\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir);
      expect(result!.status).toBe("dirty");
    });

    it("returns dirty status for untracked files", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n?? new-file.ts\n",
          "git rev-list --count @{u}..HEAD": "0\n",
          "git rev-list --count HEAD..@{u}": "0\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir);
      expect(result!.status).toBe("dirty");
    });

    it("returns conflicts status when conflict markers present", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\nUU src/index.ts\n",
          "git rev-list --count @{u}..HEAD": "0\n",
          "git rev-list --count HEAD..@{u}": "0\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir);
      expect(result!.status).toBe("conflicts");
    });

    it("tracks staged and unstaged counts with showWorkingTree", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\nM  staged.ts\n M unstaged.ts\n?? untracked.ts\n",
          "git rev-list --count @{u}..HEAD": "0\n",
          "git rev-list --count HEAD..@{u}": "0\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showWorkingTree: true });
      expect(result!.staged).toBe(1);
      expect(result!.unstaged).toBe(1);
      expect(result!.untracked).toBe(1);
    });

    it("reports ahead/behind counts correctly", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## feature...origin/feature [ahead 3, behind 1]\n",
          "git rev-list --count @{u}..HEAD": "3\n",
          "git rev-list --count HEAD..@{u}": "1\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir);
      expect(result!.ahead).toBe(3);
      expect(result!.behind).toBe(1);
    });

    it("returns 0 ahead/behind when rev-list command fails", async () => {
      mockExec.mockImplementation(
        makeExec({ "git status --porcelain -b": "## main\n" }),
      );
      // rev-list commands not in the map → returns ""
      const result = await gitService.getGitInfo(tempDir);
      expect(result!.ahead).toBe(0);
      expect(result!.behind).toBe(0);
    });
  });

  describe("getGitInfo - optional fields", () => {
    beforeEach(() => {
      mkdirSync(join(tempDir, ".git"), { recursive: true });
    });

    it("returns SHA when showSha=true", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git rev-parse --short=7 HEAD": "abc1234\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showSha: true });
      expect(result!.sha).toBe("abc1234");
    });

    it("returns null SHA when git command fails", async () => {
      mockExec.mockImplementation((cmd: string, _o: any, cb: any) => {
        if (cmd.includes("rev-parse --short=7")) {
          cb(new Error("not a git repo"), null);
        } else {
          cb(null, { stdout: cmd.includes("status") ? "## main\n" : "0\n", stderr: "" });
        }
      });

      const result = await gitService.getGitInfo(tempDir, { showSha: true });
      expect(result!.sha).toBeUndefined();
    });

    it("returns stash count when showStashCount=true", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git stash list": "stash@{0}: WIP\nstash@{1}: WIP\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showStashCount: true });
      expect(result!.stashCount).toBe(2);
    });

    it("returns 0 stash count when stash list is empty", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git stash list": "",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showStashCount: true });
      expect(result!.stashCount).toBe(0);
    });

    it("returns upstream when showUpstream=true", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git rev-parse --abbrev-ref @{u}": "origin/main\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showUpstream: true });
      expect(result!.upstream).toBe("origin/main");
    });

    it("extracts repo name from GitHub SSH remote URL", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git config --get remote.origin.url": "git@github.com:user/my-project.git\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showRepoName: true });
      expect(result!.repoName).toBe("my-project");
    });

    it("extracts repo name from HTTPS remote URL", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git config --get remote.origin.url": "https://github.com/user/another-repo.git\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showRepoName: true });
      expect(result!.repoName).toBe("another-repo");
    });

    it("falls back to directory name when remote URL is unavailable", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git config --get remote.origin.url": "",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showRepoName: true });
      // Falls back to path.basename(tempDir)
      expect(result!.repoName).toBeTruthy();
    });

    it("returns tag when showTag=true", async () => {
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
          "git describe --tags --abbrev=0": "v1.2.3\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showTag: true });
      expect(result!.tag).toBe("v1.2.3");
    });
  });

  describe("getGitInfo - ongoing operations", () => {
    beforeEach(() => {
      mkdirSync(join(tempDir, ".git"), { recursive: true });
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
        }),
      );
    });

    it("detects MERGE operation", async () => {
      writeFileSync(join(tempDir, ".git", "MERGE_HEAD"), "abc123");
      const result = await gitService.getGitInfo(tempDir, { showOperation: true });
      expect(result!.operation).toBe("MERGE");
    });

    it("detects CHERRY-PICK operation", async () => {
      writeFileSync(join(tempDir, ".git", "CHERRY_PICK_HEAD"), "abc123");
      const result = await gitService.getGitInfo(tempDir, { showOperation: true });
      expect(result!.operation).toBe("CHERRY-PICK");
    });

    it("detects REVERT operation", async () => {
      writeFileSync(join(tempDir, ".git", "REVERT_HEAD"), "abc123");
      const result = await gitService.getGitInfo(tempDir, { showOperation: true });
      expect(result!.operation).toBe("REVERT");
    });

    it("detects REBASE operation via rebase-merge dir", async () => {
      mkdirSync(join(tempDir, ".git", "rebase-merge"), { recursive: true });
      const result = await gitService.getGitInfo(tempDir, { showOperation: true });
      expect(result!.operation).toBe("REBASE");
    });

    it("returns undefined operation when no operation is active", async () => {
      const result = await gitService.getGitInfo(tempDir, { showOperation: true });
      expect(result!.operation).toBeUndefined();
    });
  });

  describe("getGitInfo - worktree handling", () => {
    it("sets isWorktree=true when .git is a file", async () => {
      writeFileSync(join(tempDir, ".git"), "gitdir: /main/.git/worktrees/foo");
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## feature-branch\n",
          "git rev-list --count": "0\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showRepoName: true });
      expect(result!.isWorktree).toBe(true);
    });

    it("sets isWorktree=false when .git is a directory", async () => {
      mkdirSync(join(tempDir, ".git"), { recursive: true });
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## main\n",
          "git rev-list --count": "0\n",
        }),
      );

      const result = await gitService.getGitInfo(tempDir, { showRepoName: true });
      expect(result!.isWorktree).toBe(false);
    });
  });

  describe("getGitInfo - detached HEAD", () => {
    it("returns detached for HEAD (no branch) status", async () => {
      mkdirSync(join(tempDir, ".git"), { recursive: true });
      mockExec.mockImplementation(
        makeExec({
          "git status --porcelain -b": "## HEAD (no branch)\n",
          "git rev-list --count": "0\n",
          "git branch --show-current": "",
          "git symbolic-ref --short HEAD": "",
        }),
      );

      const result = await gitService.getGitInfo(tempDir);
      expect(result!.branch).toBe("detached");
    });
  });
});
