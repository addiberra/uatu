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
// Stand-in for the Hub's server, which holds the event loop open until
// shutdown stops it. Released on the first signal, so what keeps the process
// (and its lease) alive after a failed shutdown is the product's own hold.
const serverStandIn = setInterval(() => {}, 2 ** 31 - 1);
process.on("SIGTERM", () => {
  clearInterval(serverStandIn);
  handleSignal();
});
process.stdout.write("locked\n");
