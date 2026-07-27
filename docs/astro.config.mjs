import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// Opencode Remote Fleet — docs site (Astro Starlight).
// Source MD/MDX under src/content/docs is rendered into a modern, branded,
// dark/light docs site. Mermaid diagrams render client-side via <Mermaid/>.
export default defineConfig({
  site: "https://opencode.beneverk.com",
  integrations: [
    starlight({
      title: "Opencode Remote Fleet",
      description:
        "Aggregate and remote-control opencode sessions across all your machines from one place.",
      favicon: "/favicon.svg",
      social: [
        {
          label: "GitHub",
          href: "https://github.com/BeneVerk/OpenCode-Remote-Control",
          icon: "github",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        { label: "Architecture", items: [{ autogenerate: { directory: "architecture" } }] },
        { label: "Decision Records (ADRs)", items: [{ autogenerate: { directory: "adr" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
      ],
    }),
  ],
});
