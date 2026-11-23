/**
 * Production candidate contract for Workshop V7.
 * The development tree keeps scripts/verify-workshop-v7-entry.ts,
 * which still reads the Concept fixture. This test does not.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const forbidden = [
  'workshopConcept',
  'workshopVisual',
  'studioPreview',
  'adminProductionPreview',
  'fixture-still',
  'example-still',
];

let failed = 0;
const assert = (name: string, ok: boolean) => {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}`);
    return;
  }
  console.log(`PASS ${name}`);
};

const studio = read('src/components/Workshop/WorkshopStudio.tsx');
const page = read('src/components/Workshop/WorkshopPage.tsx');
const app = read('src/App.tsx');
const auth = read('src/context/AuthContext.tsx');
const home = read('src/preview/HomeHero.tsx');
const scenes = read('src/preview/heroScenes.ts');
const vite = read('vite.config.ts');

for (const token of forbidden) {
  assert(`release source excludes ${token}`, !studio.includes(token) && !page.includes(token) && !app.includes(token));
}

assert('customer route is /workshop', app.includes('path="/workshop"'));
assert('route loads the production page', app.includes("import('./components/Workshop/WorkshopPage')"));
assert('production page mounts WorkshopStudio', page.includes("from './WorkshopStudio'") && page.includes('<WorkshopStudio'));
assert('anonymous workshop asks for the existing login gate', page.includes('requestCustomAccess()') && page.includes('맞춤 제작을 시작하려면 로그인해 주세요.'));
assert('authenticated page is the only studio mount', page.includes('if (isLoading || !allowed)') && page.includes('return <WorkshopStudio'));
assert('home custom action uses the existing auth request', scenes.includes("label: '커스텀 제작하기'") && home.includes("if (to === 'custom')") && home.includes('requestCustomAccess()'));
assert('authenticated custom entry navigates to /workshop', auth.includes('setWorkshopEntryNonce((value) => value + 1)') && app.includes("navigate('/workshop')"));
assert('pending file resume keeps the legacy overlay', read('src/components/Workshop/WorkshopPendingResume.tsx').includes('openLegacyWorkshop()'));
assert('studio submits through the shared cart handoff', studio.includes('submitCustomArtworkToCart('));
assert('studio uses the workshop-only spatial props', studio.includes('faithfulFrontPrint') && studio.includes('holdInspectDemand') && studio.includes('snapBaseScale'));
assert('build guard rejects local preview strings', vite.includes("code.includes('workshopConcept')") && vite.includes("code.includes('studioPreview')"));

if (failed) {
  console.error(`WORKSHOP_V7_RELEASE=FAIL ${failed}`);
  process.exit(1);
}
console.log('WORKSHOP_V7_RELEASE=PASS');
