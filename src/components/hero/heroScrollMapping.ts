import { clamp01 } from './curves';

/**
 * Section progress breakpoint — story completes here; cover phase runs after.
 * First ~80% of native scroll through the Hero tunnel drives ROOM→DESIRE.
 */
export const HERO_STORY_SECTION_END = 0.8;

/** Native scroll 0→1 through full Hero tunnel → Hero story 0→1 (clamped at 1) */
export function mapSectionToHeroStory(sectionProgress: number): number {
  const s = clamp01(sectionProgress);
  if (s <= HERO_STORY_SECTION_END) {
    return clamp01(s / HERO_STORY_SECTION_END);
  }
  return 1;
}

/** Native scroll → collection cover 0→1 (only after story section end) */
export function mapSectionToCollectionCover(sectionProgress: number): number {
  const s = clamp01(sectionProgress);
  if (s <= HERO_STORY_SECTION_END) return 0;
  return clamp01((s - HERO_STORY_SECTION_END) / (1 - HERO_STORY_SECTION_END));
}

export function writeHeroScrollProgress(
  target: {
    sectionProgress: number;
    heroStoryProgress: number;
    collectionCoverProgress: number;
    spatialProgress: number;
  },
  sectionProgress: number,
  storyOverride: number | null,
  coverOverride: number | null,
): void {
  const section = clamp01(sectionProgress);
  const heroStory = storyOverride !== null ? clamp01(storyOverride) : mapSectionToHeroStory(section);
  const cover =
    coverOverride !== null ? clamp01(coverOverride) : mapSectionToCollectionCover(section);

  target.sectionProgress = section;
  target.heroStoryProgress = heroStory;
  target.collectionCoverProgress = cover;
  target.spatialProgress = heroStory;
}
