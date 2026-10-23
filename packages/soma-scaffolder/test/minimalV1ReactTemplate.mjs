import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal soma-app-template tree for v1 scaffold tests (provenance + kit vendoring).
 * @param {string} dir
 * @param {{ viteBuild?: boolean }} [options]
 */
export function writeMinimalV1ReactTemplateTree(dir, { viteBuild = false } = {}) {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "soma-app-template",
        private: true,
        type: "module",
        ...(viteBuild
          ? {
              scripts: { build: "vite build" },
              dependencies: {
                react: "^18.3.1",
                "react-dom": "^18.3.1",
                "@supabase/supabase-js": "^2.49.1",
              },
              devDependencies: {
                vite: "^6.0.0",
                "@vitejs/plugin-react": "^4.3.4",
                typescript: "^5.7.0",
              },
            }
          : {}),
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(dir, "index.html"),
    '<!doctype html><html><head><title>T</title></head><body><div id="root"></div></body></html>\n',
  );

  mkdirSync(join(dir, "src", "lib"), { recursive: true });
  mkdirSync(join(dir, "netlify", "functions", "lib"), { recursive: true });

  const appConfig = `export const APP_ID = 'template';\nexport const APP_NAME = 'Template';\n`;
  writeFileSync(join(dir, "src", "lib", "appConfig.ts"), appConfig);
  writeFileSync(join(dir, "netlify", "functions", "lib", "appConfig.ts"), appConfig);
  writeFileSync(
    join(dir, "src", "lib", "hostPair.ts"),
    `export const hostPair = {
  human: { name: '(unassigned — name your human host here)' },
  ai: { name: 'Guide', avatar: '🤖' },
};\n`,
  );
  writeFileSync(join(dir, "src", "lib", "supabase.ts"), "export const supabase = {} as any;\n");
  writeFileSync(
    join(dir, "src", "lib", "lastLocation.ts"),
    "export async function fetchLastLocation() { return null; }\n",
  );
  writeFileSync(
    join(dir, "netlify", "functions", "lib", "supabaseAdmin.ts"),
    "export function adminEnv() { throw new Error('no env'); }\n",
  );

  writeFileSync(
    join(dir, "src", "main.tsx"),
    `import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
`,
  );
  writeFileSync(join(dir, "src", "App.tsx"), "export default function App() { return null; }\n");

  if (viteBuild) {
    writeFileSync(
      join(dir, "vite.config.ts"),
      `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
`,
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          files: [],
          references: [{ path: "./tsconfig.app.json" }],
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(
      join(dir, "tsconfig.app.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            strict: true,
            noEmit: true,
            paths: { "@/*": ["./src/*"] },
          },
          include: ["src"],
        },
        null,
        2,
      ) + "\n",
    );
  }
}
