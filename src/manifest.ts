import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "Layouter",
  description: "Temporarily move visible DOM elements for quick layout prototyping.",
  version: "0.1.0",
  action: {
    default_popup: "index.html",
    default_title: "Layouter"
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/main.ts"]
    }
  ],
  permissions: ["activeTab", "scripting"],
  background: {
    service_worker: "src/background.ts",
    type: "module"
  }
};

export default manifest;
