/**
 * NEW4-4D-8A — PDP signed Workshop media referrer: local checks.
 * DOM-only components are rendered with react-dom/server; WebGL-adjacent files are checked
 * statically. Baseline comparisons read the committed tree (`git show`, read-only).
 * No GCS / Supabase / network calls, no customer data.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageSurfaceVisual, IncludedSilhouette } from '../src/components/pdp/factualVisuals';
import { PdpStoryStatic } from '../src/components/pdp/story/PdpStoryStatic';
import { PdpStoryMobile } from '../src/components/pdp/story/PdpStoryMobile';
import { getFullImageUrl } from '../src/lib/utils';
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../src/lib/publicPaymentFreeze';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = '5fae256';
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const read = (rel: string) => lf(fs.readFileSync(path.join(root, rel), 'utf8'));
const readBaseline = (rel: string) =>
  lf(execFileSync('git', ['show', `${BASELINE}:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const sha = (rel: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').toUpperCase();

const results: { group: string; name: string; pass: boolean }[] = [];
let group = '';

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ group, name, pass: condition });
  const suffix = !condition && detail ? ` - ${detail}` : '';
  process.stdout.write(`${condition ? 'PASS' : 'FAIL'}: [${group}] ${name}${suffix}\n`);
}

function section(label: string): void {
  group = label;
  process.stdout.write(`\n== ${label} ==\n`);
}

const SIGNED =
  'https://storage.asia-northeast3.rep.googleapis.com/metalora-workshop-apne3/previews/u/x.jpg' +
  '?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=synthetic';
const CATALOG = 'https://example.supabase.co/storage/v1/object/public/products/a.jpg';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const imgTags = (markup: string) => markup.match(/<img\b[^>]*>/g) ?? [];
const imgTagsFor = (markup: string, src: string) =>
  imgTags(markup).filter((tag) => tag.includes(`src="${src.replace(/&/g, '&amp;')}"`));
const allNoReferrer = (tags: string[]) => tags.length > 0 && tags.every((t) => t.includes('referrerPolicy="no-referrer"') || t.includes('referrerpolicy="no-referrer"'));
const noneHavePolicy = (tags: string[]) => tags.length > 0 && tags.every((t) => !/referrerpolicy/i.test(t));

/** JSX `<img ...>` elements in source whose `src` is the given expression. */
function sourceImgs(src: string, srcExpr: string): string[] {
  const out: string[] = [];
  const re = /<img\b[\s\S]*?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) if (m[0].includes(`src={${srcExpr}}`)) out.push(m[0]);
  return out;
}
const hasPolicyProp = (tag: string) => tag.includes('referrerPolicy={imageReferrerPolicy}');

const FILES = {
  pdp: 'src/components/ProductDetail.tsx',
  stage: 'src/components/pdp/ProductTheatreStage.tsx',
  room: 'src/components/pdp/ProductTheatreRoomPreview.tsx',
  truth: 'src/components/pdp/ProductTruthSection.tsx',
  mount: 'src/components/pdp/ProductMountIncluded.tsx',
  visuals: 'src/components/pdp/factualVisuals.tsx',
  section: 'src/components/pdp/story/PdpStorySection.tsx',
  staticStory: 'src/components/pdp/story/PdpStoryStatic.tsx',
  mobile: 'src/components/pdp/story/PdpStoryMobile.tsx',
} as const;
const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)])) as Record<
  keyof typeof FILES,
  string
>;

function main(): void {
  section('0 signed src reaches PDP surfaces');
  assert('getFullImageUrl passes a signed https src through unchanged', getFullImageUrl(SIGNED) === SIGNED);
  assert(
    'ProductDetail feeds the resolved Workshop src into product.image / front_image',
    /image: workshopPreviewSrc,/.test(src.pdp) && /front_image: workshopPreviewSrc,/.test(src.pdp),
  );
  assert(
    'ProductDetail policy is no-referrer only for a Workshop preview ref',
    /const workshopImageReferrerPolicy = workshopPreviewRef \? \('no-referrer' as const\) : undefined;/.test(src.pdp),
  );
  for (const [component, pattern] of [
    ['ProductTheatreStage', /<ProductTheatreStage[\s\S]*?imageReferrerPolicy=\{workshopImageReferrerPolicy\}[\s\S]*?\/>/],
    ['PdpStorySection', /<PdpStorySection[\s\S]*?imageReferrerPolicy=\{workshopImageReferrerPolicy\}[\s\S]*?\/>/],
    ['ProductTruthSection', /<ProductTruthSection imageSrc=\{factualImageSrc\} imageReferrerPolicy=\{workshopImageReferrerPolicy\} \/>/],
    ['ProductMountIncluded', /<ProductMountIncluded imageSrc=\{factualImageSrc\} imageReferrerPolicy=\{workshopImageReferrerPolicy\} \/>/],
    ['ProductTheatreRoomPreview', /<ProductTheatreRoomPreview[\s\S]*?imageReferrerPolicy=\{workshopImageReferrerPolicy\}[\s\S]*?\/>/],
  ] as const) {
    assert(`ProductDetail passes the policy to ${component}`, pattern.test(src.pdp));
  }

  section('A ProductTheatreStage');
  const stageImgs = sourceImgs(src.stage, 'displayUrl');
  assert('2D theatre <img src={displayUrl}> exists once', stageImgs.length === 1);
  assert('2D theatre <img> carries the policy prop', stageImgs.every(hasPolicyProp));
  assert('prop destructured and typed narrowly', /imageReferrerPolicy\?: 'no-referrer';/.test(src.stage) && /\n  imageReferrerPolicy,\n\}: ProductTheatreStageProps/.test(src.stage));
  assert('no other <img> in the stage', (src.stage.match(/<img\b/g) ?? []).length === 1);
  assert(
    'loading / error / layout attributes preserved',
    ['fetchPriority="high"', 'decoding="async"', 'onError={() => setImageFailed(true)}', 'object-cover'].every((s) =>
      stageImgs[0]?.includes(s),
    ),
  );

  section('B ProductTheatreRoomPreview');
  const roomArt = sourceImgs(src.room, 'artworkUrl');
  assert('artwork <img src={artworkUrl}> exists once', roomArt.length === 1);
  assert('artwork <img> carries the policy prop', roomArt.every(hasPolicyProp));
  assert('prop destructured and typed narrowly', /imageReferrerPolicy\?: 'no-referrer';/.test(src.room) && /\n  imageReferrerPolicy,\n\}: ProductTheatreRoomPreviewProps/.test(src.room));
  const roomPhoto = sourceImgs(src.room, 'photo.url');
  assert('room photo <img> (local user photo object URL) left unchanged', roomPhoto.length === 1 && !/referrerPolicy/.test(roomPhoto[0]));
  assert('artworkUrl not logged', !/console\.[a-z]+\([^)]*artworkUrl/.test(src.room));

  section('C ProductTruthSection / factualVisuals');
  const surfaceSigned = html(React.createElement(ImageSurfaceVisual, { src: SIGNED, imageReferrerPolicy: 'no-referrer' }));
  assert('ImageSurfaceVisual signed <img> is no-referrer', allNoReferrer(imgTagsFor(surfaceSigned, SIGNED)));
  const includedSigned = html(
    React.createElement(IncludedSilhouette, { kind: 'artwork', imageSrc: SIGNED, imageReferrerPolicy: 'no-referrer' }),
  );
  assert('IncludedSilhouette (ProductMountIncluded) signed <img> is no-referrer', allNoReferrer(imgTagsFor(includedSigned, SIGNED)));
  assert('ProductTruthSection forwards the prop to ImageSurfaceVisual', /<ImageSurfaceVisual src=\{imageSrc\} imageReferrerPolicy=\{imageReferrerPolicy\} \/>/.test(src.truth));
  assert(
    'ProductMountIncluded forwards the prop to IncludedSilhouette',
    /<IncludedBlock imageSrc=\{imageSrc\} imageReferrerPolicy=\{imageReferrerPolicy\} \/>/.test(src.mount) &&
      /<IncludedSilhouette[\s\S]*?imageReferrerPolicy=\{imageReferrerPolicy\}[\s\S]*?\/>/.test(src.mount),
  );
  assert(
    'MountSchematicVisual is not mounted anywhere (cannot receive signed media)',
    !execFileSync('git', ['grep', '-l', 'MountSchematicVisual', '--', 'src'], { cwd: root, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .some((f) => f !== FILES.visuals),
  );

  section('D PdpStoryStatic');
  const staticSigned = html(
    React.createElement(PdpStoryStatic, { frontTextureUrl: SIGNED, orientation: 'portrait', imageReferrerPolicy: 'no-referrer' }),
  );
  const staticSignedTags = imgTagsFor(staticSigned, SIGNED);
  assert('both signed <img> (surface + mounted) rendered', staticSignedTags.length === 2);
  assert('all signed <img> are no-referrer', allNoReferrer(staticSignedTags));
  assert('lazy loading preserved', staticSignedTags.every((t) => t.includes('loading="lazy"')));
  assert(
    'PdpStorySection forwards the prop to PdpStoryStatic',
    /<PdpStoryStatic[\s\S]*?imageReferrerPolicy=\{imageReferrerPolicy\}[\s\S]*?\/>/.test(src.section),
  );

  section('E PdpStoryMobile');
  const mobileSigned = html(
    React.createElement(PdpStoryMobile, { frontTextureUrl: SIGNED, orientation: 'portrait', imageReferrerPolicy: 'no-referrer' }),
  );
  const mobileSignedTags = imgTagsFor(mobileSigned, SIGNED);
  assert('signed front <img> rendered', mobileSignedTags.length === 1);
  assert('signed <img> is no-referrer', allNoReferrer(mobileSignedTags));
  assert(
    'PdpStorySection forwards the prop to PdpStoryMobile',
    /<PdpStoryMobile[\s\S]*?imageReferrerPolicy=\{imageReferrerPolicy\}[\s\S]*?\/>/.test(src.section),
  );
  assert(
    'PdpStorySurface (WebGL, A4) call unchanged',
    /<PdpStorySurface\s+frontTextureUrl=\{frontTextureUrl\}\s+orientation=\{orientation\}\s+progress=\{progress\}/.test(src.section) &&
      !/<PdpStorySurface[\s\S]*?imageReferrerPolicy[\s\S]*?\/>/.test(src.section),
  );

  section('F no signed URL logging');
  for (const [key, rel] of Object.entries(FILES)) {
    const count = (s: string) => (s.match(/console\.[a-z]+\(/g) ?? []).length;
    assert(`${rel}: no new console calls`, count(src[key as keyof typeof FILES]) === count(readBaseline(rel)));
  }

  section('G no signed URL persistence / emission');
  const persistPattern = /localStorage|sessionStorage|indexedDB|track\(|gtag\(|navigate\(|history\.(push|replace)State|\.upsert\(|\.insert\(|\.update\(/g;
  for (const [key, rel] of Object.entries(FILES)) {
    const count = (s: string) => (s.match(persistPattern) ?? []).length;
    assert(`${rel}: no new storage / analytics / navigation / DB writes`, count(src[key as keyof typeof FILES]) === count(readBaseline(rel)));
  }
  assert('no signed-param or expiry metadata propagated as props', !Object.values(src).some((s) => /X-Goog-|expiresAt=\{/.test(s)));

  section('H resolver / storage logic unchanged');
  for (const rel of [
    'src/lib/workshopMedia.ts',
    'src/lib/workshopMediaCore.ts',
    'src/lib/utils.ts',
    'src/lib/customComposition/durableHandoff.ts',
  ]) {
    assert(`${rel} identical to ${BASELINE}`, read(rel) === readBaseline(rel));
  }
  // Server-side storage gained the NEW4-4D-9 legacy bridge (verified by verify-new4-4d-9); it must stay additive.
  const exportsOf = (s: string) => s.split('\n').filter((l) => /^export /.test(l)).map((l) => l.trim());
  const storageNow = read('src/lib/workshopStorage.ts');
  assert(
    'src/lib/workshopStorage.ts keeps every baseline export (additive only)',
    exportsOf(readBaseline('src/lib/workshopStorage.ts')).every((l) => storageNow.includes(l)),
  );
  // NEW4-4D-9A moved the hook body into pdp/workshopPreviewSource.ts and routes strict legacy refs
  // through the resolver too; the forward contract is "resolver only, never the raw ref".
  const hookOf = (s: string) => s.slice(s.indexOf('const workshopPreviewDeps'), s.indexOf('function PdpStatusScreen'));
  const previewSource = read('src/components/pdp/workshopPreviewSource.ts');
  assert(
    'ProductDetail Workshop preview is resolver-only (no raw ref as src)',
    /resolveWorkshopMediaSrc\(ref, \{ mode: 'customer' \}\)/.test(hookOf(src.pdp)) && !/src: ref\b/.test(hookOf(src.pdp) + previewSource),
  );

  section('I catalog behavior unchanged');
  const surfaceCatalog = html(React.createElement(ImageSurfaceVisual, { src: CATALOG }));
  assert('ImageSurfaceVisual catalog <img> has no referrerpolicy', noneHavePolicy(imgTagsFor(surfaceCatalog, CATALOG)));
  const includedCatalog = html(React.createElement(IncludedSilhouette, { kind: 'artwork', imageSrc: CATALOG }));
  assert('IncludedSilhouette catalog <img> has no referrerpolicy', noneHavePolicy(imgTagsFor(includedCatalog, CATALOG)));
  const staticCatalog = html(React.createElement(PdpStoryStatic, { frontTextureUrl: CATALOG, orientation: 'portrait' }));
  assert('PdpStoryStatic catalog <img> has no referrerpolicy', noneHavePolicy(imgTagsFor(staticCatalog, CATALOG)));
  const mobileCatalog = html(React.createElement(PdpStoryMobile, { frontTextureUrl: CATALOG, orientation: 'portrait' }));
  assert('PdpStoryMobile catalog <img> has no referrerpolicy', noneHavePolicy(imgTagsFor(mobileCatalog, CATALOG)));
  assert(
    'catalog markup identical apart from the attribute',
    staticSigned.replace(/ referrerPolicy="no-referrer"/gi, '').split(SIGNED.replace(/&/g, '&amp;')).join(CATALOG) === staticCatalog,
  );
  assert('policy is undefined (attribute omitted) when there is no Workshop preview ref', /workshopPreviewRef \? \('no-referrer' as const\) : undefined/.test(src.pdp));
  assert(
    'factualImageSrc derivation unchanged',
    /const factualImageSrc =\s+getFullImageUrl\(\s+selectedOrientation === 'landscape' && product\.landscape_image\s+\? product\.landscape_image\s+: product\.front_image \|\| product\.image,\s+\) \|\| null;/.test(src.pdp),
  );
  /** Preview-hook region and its imports are NEW4-4D-9A scope, compared by the D-9A verifier. */
  const stripPreviewHook = (s: string) => {
    const start = s.search(/type WorkshopPreviewState =|const workshopPreviewDeps/);
    const end = s.indexOf('function PdpStatusScreen');
    const cut = start >= 0 && end > start ? s.slice(0, start) + s.slice(end) : s;
    return cut
      .replace(/import \{[^}]*\} from '\.\.\/lib\/workshopMedia';/g, '')
      .replace(/import \{[^}]*\} from '\.\/pdp\/workshopPreviewSource';/g, '');
  };
  const stripPolicy = (s: string) =>
    stripPreviewHook(s)
      .replace(/\/\*\* Private Workshop media \(temporary signed src\)\. Catalog omits this\. \*\//g, '')
      .replace(/const workshopImageReferrerPolicy = workshopPreviewRef \? \('no-referrer' as const\) : undefined;/g, '')
      .replace(/imageReferrerPolicy=\{(workshopImageReferrerPolicy|imageReferrerPolicy)\}/g, '')
      .replace(/referrerPolicy=\{imageReferrerPolicy\}/g, '')
      .replace(/imageReferrerPolicy\?: 'no-referrer';?/g, '')
      .replace(/imageReferrerPolicy,/g, '')
      .replace(/,\s*imageReferrerPolicy(?=\s*\})/g, '')
      .replace(/[\s,;]+/g, '');
  for (const [key, rel] of Object.entries(FILES)) {
    const current = src[key as keyof typeof FILES];
    const baseline = readBaseline(rel);
    const before = (baseline.match(/<img\b/g) ?? []).length;
    assert(`${rel}: <img> count unchanged (${before})`, before === (current.match(/<img\b/g) ?? []).length);
    assert(`${rel}: only the referrer-policy prop changed`, stripPolicy(current) === stripPolicy(baseline));
  }

  section('J protected WIP untouched');
  const PROTECTED: Record<string, string> = {
    'src/components/InquiryModal.tsx': '05C2C01B7B312CB1B8CE7626B161D1031A74FB1A04243F16C4AC637887B68CFC',
    'src/components/OrdersModal.tsx': '6E75C6694582234211CDD1A0B91336D8F0D556406271FA3653BD49F93710B024',
    'src/components/ProfileEditModal.tsx': '48C34800559913E2CE3111FCD6608682C000E7A2C59A5B481E06201536F9B168',
    'src/components/ProfileOverlay.tsx': '12726DD97F4F42AF9285AA7D9E8AA155D363A822E3D33AA83F0D65E78E3D261C',
    'src/pages/ProfileComplete.tsx': '02B5FC09E53FAA92BB07D9C867DB97BC71395AC7BD632169AE7B526A0A56EF08',
  };
  for (const [rel, hash] of Object.entries(PROTECTED)) assert(`${rel} byte-identical`, sha(rel) === hash);

  section('K payment freeze');
  assert('PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true);
  assert('publicPaymentFreeze.ts identical to baseline', read('src/lib/publicPaymentFreeze.ts') === readBaseline('src/lib/publicPaymentFreeze.ts'));

  section('L A4 boundary');
  for (const rel of [
    'src/components/artwork3d/MetaloraArtwork3D.tsx',
    'src/components/pdp/PdpSpatialCanvas.tsx',
    'src/components/pdp/story/PdpStorySurface.tsx',
  ]) {
    assert(`${rel} identical to baseline`, read(rel) === readBaseline(rel));
  }

  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\nNEW4-4D-8A: ${results.length - failed.length}/${results.length} PASS\n`);
  if (failed.length) process.exit(1);
}

main();
