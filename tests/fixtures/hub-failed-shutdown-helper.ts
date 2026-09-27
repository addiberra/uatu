import { createHubSignalShutdown, shutdownHub } from "../../src/hub/main";
import { acquireHubStateLease, ensureCanonicalStateDir } from "../../src/hub/state-dir";

const stateRoot = Bun.argv.at(-1);
if (!stateRoot) throw new Error("state root is required");

const canonicalStateRoot = await ensureCanonicalStateDir(stateRoot);
const stateLease = await acquireHubStateLease(canonicalStateRoot);
const handleSignal = createHubSignalShutdown({
  shutdown: () => shutdownHub({
    stopServer() {},
    stateLease,
    cloneJobs: { async close() { throw new Error("fixture clone survived"); } },
    sessions: { async stopAll() {} },
  }),
  reportRetained: () => process.stdout.write("retained\n"),
});
process.on("SIGTERM", handleSignal);
// A real Hub that retains its lease is kept alive by the clones and sessions
// it could not reap. This fixture has none, so without a handle of its own it
// would exit once its event loop drained, dropping the lease it claims to
// retain; only the forced exit on the next signal may end it.
setInterval(() => {}, 1 << 30);
process.stdout.write("locked\n");
