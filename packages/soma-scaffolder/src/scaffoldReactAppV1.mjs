import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCleanTemplateProvenance,
  copyTrackedTemplateTree,
} from "./templateProvenance.mjs";
import { assertCleanPlatformPackages } from "./assertCleanPlatformPackages.mjs";
import { copyManifestSources } from "./copyManifestSources.mjs";
import { writeKitLock } from "./writeKitLock.mjs";
import {
  resolveAppTemplateDir,
  readSomaPlatformCommit,
  vendorPackageSrc,
} from "./scaffoldReactApp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOMA_PLATFORM_ROOT = join(__dirname, "..", "..", "..");

export const VENDORED_TICKETS_DIR = "vendor/soma/tickets";
export const VENDORED_METER_DIR = "vendor/soma/meter";
export const VENDORED_SIGNIN_DIR = "vendor/soma/signin";
export const VENDORED_FEEDBACK_DIR = "vendor/soma/feedback";
export const FEEDBACK_WIDGET_DIR = "public/vendor/soma-feedback";
export const TICKETS_ADAPTER = "src/lib/tickets.ts";
export const METER_ADAPTER = "netlify/functions/lib/meter.ts";
export const TICKETS_SCHEMA = `${VENDORED_TICKETS_DIR}/sql/schema.sql`;
export const METER_SCHEMA = `${VENDORED_METER_DIR}/sql/schema.sql`;

function writeFile(outDir, rel, content) {
  const full = join(outDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return rel;
}

function patchTsconfigForVendor(outDir) {
  for (const rel of ["tsconfig.json", "tsconfig.app.json", "tsconfig.functions.json"]) {
    const full = join(outDir, rel);
    if (!existsSync(full)) continue;
    let src = readFileSync(full, "utf8");
    if (src.includes("@vendor/*")) continue;
    if (src.includes('"paths"')) {
      src = src.replace(
        /"paths"\s*:\s*\{/,
        '"paths": {\n      "@vendor/*": ["./vendor/*"],',
      );
    } else if (src.includes('"compilerOptions"')) {
      src = src.replace(
        /"compilerOptions"\s*:\s*\{/,
        '"compilerOptions": {\n    "paths": { "@vendor/*": ["./vendor/*"] },',
      );
    } else {
      continue;
    }
    writeFileSync(full, src);
  }
}

function writeVendorTypeShims(outDir) {
  writeFile(
    outDir,
    "src/soma-vendor.d.ts",
    `declare module "@vendor/soma/tickets/index.js";
declare module "@vendor/soma/meter/index.js";
declare module "@vendor/soma/signin/somaAuthConfig.js";
declare module "@vendor/soma/signin/somaKnownDevice.js";
declare module "@vendor/soma/signin/react/AuthProvider";
declare module "@vendor/soma/signin/react/SomaAuth";
`,
  );
  writeFile(
    outDir,
    "netlify/functions/soma-vendor.d.ts",
    `declare module "@vendor/soma/meter/index.js";
`,
  );
}

function patchViteForVendor(outDir) {
  const rel = "vite.config.ts";
  const full = join(outDir, rel);
  if (!existsSync(full)) return;
  let src = readFileSync(full, "utf8");
  if (src.includes("'@vendor'") || src.includes('"@vendor"')) return;
  if (src.includes("alias:")) {
    src = src.replace(
      /(alias:\s*\{)/,
      "$1\n      '@vendor': fileURLToPath(new URL('./vendor', import.meta.url)),",
    );
  } else {
    src = src.replace(
      /export default defineConfig\(\{/,
      "export default defineConfig({\n  resolve: {\n    alias: {\n      '@vendor': fileURLToPath(new URL('./vendor', import.meta.url)),\n    },\n  },",
    );
  }
  writeFileSync(full, src);
}

function wireSignInAuthV1(outDir) {
  writeFile(
    outDir,
    "src/lib/somaAuthConfig.ts",
    `// @soma/signin — config adapter (vendored kit; see ${VENDORED_SIGNIN_DIR}/VENDORED.md).
import { createSomaAuthConfig } from '@vendor/soma/signin/somaAuthConfig.js';

export const SOMA_AUTH_CONFIG = createSomaAuthConfig({
  url: import.meta.env.VITE_SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co',
  anonKey:
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'sb_publishable_vi2qDWjozUJ5mi9dwirkLA_rj6UaqLf',
});

export const HAS_OWN_SUPABASE_PROJECT = Boolean(import.meta.env.VITE_SUPABASE_URL);
`,
  );

  writeFile(
    outDir,
    "src/features/auth/AuthProvider.tsx",
    `import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { HAS_OWN_SUPABASE_PROJECT } from '@/lib/somaAuthConfig';
import { fetchLastLocation } from '@/lib/lastLocation';
import { APP_ID } from '@/lib/appConfig';
import {
  AuthProvider as SomaSignInAuthProvider,
  useAuth as useSomaSignInAuth,
} from '@vendor/soma/signin/react/AuthProvider';
import { createSomaKnownDevice } from '@vendor/soma/signin/somaKnownDevice.js';

const knownDevice = createSomaKnownDevice({ storageKey: \`\${APP_ID}.soma.known.device\` });

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  hasOwnProject: boolean;
  resumePath: string | null;
  signOut: () => Promise<void>;
}

const ResumeContext = createContext<{ resumePath: string | null }>({ resumePath: null });
const AuthContext = createContext<AuthContextValue | null>(null);

function AuthResumeBridge({ children }: { children: ReactNode }) {
  const { resumePath } = useContext(ResumeContext);
  const kit = useSomaSignInAuth();
  const value: AuthContextValue = {
    user: kit.user,
    session: kit.session,
    loading: kit.loading,
    hasOwnProject: HAS_OWN_SUPABASE_PROJECT,
    resumePath,
    signOut: kit.signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [resumePath, setResumePath] = useState<string | null>(null);

  return (
    <ResumeContext.Provider value={{ resumePath }}>
      <SomaSignInAuthProvider
        supabase={supabase}
        knownDevice={knownDevice}
        onAuthEvent={async (event: string) => {
          if (event === 'SIGNED_IN') {
            const loc = await fetchLastLocation();
            setResumePath(loc?.path ?? null);
          }
        }}
      >
        <AuthResumeBridge>{children}</AuthResumeBridge>
      </SomaSignInAuthProvider>
    </ResumeContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be called inside <AuthProvider>');
  return ctx;
}
`,
  );

  writeFile(
    outDir,
    "src/features/auth/SignIn.tsx",
    `import SomaAuth from '@vendor/soma/signin/react/SomaAuth';
import '@vendor/soma/signin/react/soma-signin.css';
import { supabase } from '@/lib/supabase';
import { SOMA_AUTH_CONFIG } from '@/lib/somaAuthConfig';
import { APP_NAME } from '@/lib/appConfig';

export default function SignIn() {
  return (
    <SomaAuth
      supabase={supabase}
      config={SOMA_AUTH_CONFIG}
      loginPath="/sign-in"
      appName={APP_NAME}
    />
  );
}
`,
  );
}

function wireTicketsAndMeterV1(outDir, { platformRoot = SOMA_PLATFORM_ROOT } = {}) {
  const commit = readSomaPlatformCommit(platformRoot);
  vendorPackageSrc(
    join(platformRoot, "packages", "soma-tickets"),
    join(outDir, VENDORED_TICKETS_DIR),
    "soma-tickets",
    commit,
  );
  vendorPackageSrc(
    join(platformRoot, "packages", "soma-meter"),
    join(outDir, VENDORED_METER_DIR),
    "soma-meter",
    commit,
  );
  vendorPackageSrc(
    join(platformRoot, "packages", "soma-signin"),
    join(outDir, VENDORED_SIGNIN_DIR),
    "soma-signin",
    commit,
  );

  writeFile(
    outDir,
    TICKETS_ADAPTER,
    `// @soma/tickets — vendored kit adapter.
import { createTickets } from '@vendor/soma/tickets/index.js';
import { APP_ID } from './appConfig';
import { supabase } from './supabase';

export const tickets = createTickets({ supabase, app: APP_ID });
`,
  );

  writeFile(
    outDir,
    METER_ADAPTER,
    `// @soma/meter — vendored kit adapter.
import { createMeter, createSupabaseRestStore } from '@vendor/soma/meter/index.js';
import { APP_ID } from './appConfig';
import { adminEnv } from './supabaseAdmin';

let store;
try {
  const { url, serviceKey } = adminEnv();
  store = createSupabaseRestStore({ url, serviceKey, fetch });
} catch (e) {
  console.error('[meter] no service key; metering fails open', e);
  store = null;
}

export const meter = createMeter({ store, app: APP_ID });
`,
  );
}

function rewriteAppConfig(outDir, rel, appId, appName) {
  const full = join(outDir, rel);
  if (!existsSync(full)) return;
  let src = readFileSync(full, "utf8");
  src = src.replace(/APP_ID = '[^']*'/, `APP_ID = '${appId}'`);
  src = src.replace(/APP_NAME = '[^']*'/, `APP_NAME = '${appName.replace(/'/g, "\\'")}'`);
  writeFileSync(full, src);
}

function rewriteHostPairV1(outDir, manifest) {
  const rel = "src/lib/hostPair.ts";
  const full = join(outDir, rel);
  if (!existsSync(full)) return;
  let src = readFileSync(full, "utf8");
  const human = manifest.hosts?.human;
  if (human?.name) {
    src = src.replace(
      /name: '\(unassigned — name your human host here\)'/,
      `name: '${human.name.replace(/'/g, "\\'")}'`,
    );
  }
  const ai = manifest.hosts?.ai;
  if (ai?.name) {
    src = src
      .replace(/name: 'Guide'/, `name: '${ai.name.replace(/'/g, "\\'")}'`)
      .replace(/avatar: '🤖'/, `avatar: '🤖'`);
  }
  writeFileSync(full, src);
}

function rewritePackageJson(outDir, manifest) {
  const full = join(outDir, "package.json");
  if (!existsSync(full)) return;
  const pkg = JSON.parse(readFileSync(full, "utf8"));
  pkg.name = manifest.app.id;
  pkg.description =
    manifest.app.description ||
    `${manifest.app.name} — a SOMA app scaffolded from soma-app-template.`;
  writeFileSync(full, JSON.stringify(pkg, null, 2) + "\n");
}

function rewriteIndexHtml(outDir, manifest) {
  const full = join(outDir, "index.html");
  if (!existsSync(full)) return;
  let html = readFileSync(full, "utf8");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${manifest.app.name}</title>`);
  writeFileSync(full, html);
}

/**
 * @param {object} manifest — soma.app/1 document
 */
export async function scaffoldReactAppV1(
  manifest,
  {
    outDir,
    manifestDir,
    appTemplateDir = resolveAppTemplateDir(),
    platformRoot = SOMA_PLATFORM_ROOT,
  } = {},
) {
  if (manifest?.schema_version !== "soma.app/1") {
    throw new Error("scaffoldReactAppV1 requires schema_version soma.app/1");
  }
  if (!existsSync(appTemplateDir)) {
    throw new Error(`scaffoldReactAppV1: source template not found at ${appTemplateDir}`);
  }
  if (!outDir) outDir = join(process.cwd(), `${manifest.app.id}-soma`);
  if (existsSync(outDir)) {
    throw new Error(`scaffoldReactAppV1: outDir already exists: ${outDir}`);
  }

  if (!manifestDir) {
    throw new Error("scaffoldReactAppV1: manifestDir is required (directory containing the spec file)");
  }

  assertCleanPlatformPackages(platformRoot);
  const template = assertCleanTemplateProvenance(appTemplateDir);

  mkdirSync(outDir, { recursive: true });
  copyTrackedTemplateTree(appTemplateDir, outDir);
  copyManifestSources(manifestDir, outDir, manifest);
  wireTicketsAndMeterV1(outDir, { platformRoot });
  wireSignInAuthV1(outDir);
  patchTsconfigForVendor(outDir);
  patchViteForVendor(outDir);
  writeVendorTypeShims(outDir);

  rewriteAppConfig(outDir, "src/lib/appConfig.ts", manifest.app.id, manifest.app.name);
  rewriteAppConfig(
    outDir,
    "netlify/functions/lib/appConfig.ts",
    manifest.app.id,
    manifest.app.name,
  );
  rewriteHostPairV1(outDir, manifest);
  rewritePackageJson(outDir, manifest);
  rewriteIndexHtml(outDir, manifest);

  writeFile(outDir, "soma-app.json", JSON.stringify(manifest, null, 2) + "\n");

  await writeKitLock({
    outDir,
    manifest,
    platformRoot,
    sourceCommit: readSomaPlatformCommit(platformRoot),
    template,
  });

  return { outDir, template };
}
