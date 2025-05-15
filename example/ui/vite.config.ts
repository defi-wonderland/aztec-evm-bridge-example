import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import environmentPlugin from "vite-plugin-environment"
import { nodePolyfills } from "vite-plugin-node-polyfills"

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  // NOTE: remove it when building
  define: {
    "process.browser": "true",
    "process.version": '"v16.0.0"',
  },
  plugins: [
    nodePolyfills({
      protocolImports: true,
    }),
    react(),
    tailwindcss(),
    environmentPlugin(["NODE_DEBUG", "VAULT_ADDRESS", "AZTEC_GATEWAY_7683", "L2_GATEWAY"]),
  ],
})
