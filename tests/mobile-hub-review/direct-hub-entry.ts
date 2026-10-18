// Exercise the production direct-entry timer/history owner with synthetic RPC.
import { mountLiveHub } from "../../src/hub/mobile/live-entry";
mountLiveHub(document.querySelector<HTMLElement>("#direct-hub")!);
