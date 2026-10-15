import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CloneProcessFactory } from "../../src/hub/clone-process";

/** Explicit process double. Real Hub admission, jobs, SSE, input, cancellation,
 * filesystem cleanup and onboarding run above it; no Git/network/PTY is spawned. */
export const mobileCloneProcess: CloneProcessFactory = {
  start(options) {
    let finish!: (code: number) => void, terminal = false;
    const exited = new Promise<number>(resolve => { finish = resolve; });
    const setup = (async () => {
      await mkdir(options.target); await writeFile(path.join(options.target, "README.md"), "# Disposable clone-process double\n");
      if (!terminal) options.onOutput("Fixture clone: enter a disposable response to finish.\n");
    })().catch(() => { terminal = true; finish(1); });
    return { pid: 0, exited,
      writeLine() { if (terminal) return false; terminal = true; void setup.then(() => { options.onOutput("Fixture clone complete.\n"); finish(0); }); return true; },
      async terminate() { terminal = true; await setup; finish(1); },
    };
  },
};
