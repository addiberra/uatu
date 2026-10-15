/** Trusted bundled asset tags only: authenticated data remains API-gated.
 * Keep desktop markup/controller untouched except for the explicit phone gate. */
import { isBundleAssetPath } from "../../server/navigation";

export function mobileHubAssets(html: string): string {
  const tags = html.match(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>|<link\b[^>]*\brel="stylesheet"[^>]*>/g) ?? [];
  if (!tags.some(tag => tag.startsWith("<script"))) throw new Error("Mobile Hub bundle unavailable");
  // Only this build's root-relative static asset namespace may be referenced.
  // Reconstruct tags instead of forwarding event handlers/arbitrary attributes
  // from the credential-free self-fetch, including with operator-managed TLS.
  return tags.map(tag => {
    const script = tag.startsWith("<script"), path = tag.match(script ? /\bsrc="([^"]+)"/ : /\bhref="([^"]+)"/)?.[1];
    if (!path || !isBundleAssetPath(path) || script && path.endsWith(".css") || !script && path.endsWith(".js")) throw new Error("Invalid mobile Hub bundle asset");
    return script ? `<script type="module" src="${path}"></script>` : `<link rel="stylesheet" href="${path}">`;
  }).join("\n");
}

/** Configuration-owned bind address, never a request Host/forwarded value. */
export function mobileBundleUrl(host: string, port: number, tls: boolean): string {
  const address = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  return `${tls ? "https" : "http"}://${address.includes(":") && !address.startsWith("[") ? `[${address}]` : address}:${port}/__uatu/mobile-hub`;
}

export function withMobileHubBootstrap(html: string, assets: string): string {
  return html.replace("</head>", `<script>(()=>{let mode;try{mode=localStorage.getItem("uatu:presentation:v1:%2F:uatu:ui-mode")}catch{}const touch=mode==="touch"||(mode!=="desktop"&&typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches);if(touch){document.documentElement.dataset.uiMode="touch";document.documentElement.dataset.mobileHub="true"}})()</script><style>html[data-mobile-hub="true"] body>main{display:none!important}</style>${assets}</head>`);
}
