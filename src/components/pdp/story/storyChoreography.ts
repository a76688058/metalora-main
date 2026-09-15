import {
  getStoryBeatRanges,
  STORY_ANATOMY_LAYER_ORDER,
  type PdpStoryBeatId,
  type StoryAnatomyLayerId,
  type SurfaceCameraPose,
} from './constants';
import { edgeVisualAt, type StoryOrientation } from './edgeChoreography';
import { magneticTailPose, magneticVisualAt, type MagneticVisual } from './magneticChoreography';
import { STORY_ANATOMY_IDLE, type StoryAnatomyView } from './magneticAnatomy';
import { surfaceVisualAt } from './surfaceChoreography';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type StoryVisual = {
  beat: PdpStoryBeatId;
  amount: number;
  pose: SurfaceCameraPose;
  stageOpacity: number;
  copyOpacity: number;
  grazingMix: number;
  edgeMix: number;
  rimMix: number;
  sweep: number;
  glint: number;
  edgeCopyOpacity: number;
  disclosureOpacity: number;
  anatomy: StoryAnatomyView;
  magneticCopyOpacity: number;
  stackCopyOpacity: number;
  explodeDisclosureOpacity: number;
  detachDisclosureOpacity: number;
  layerLabelOpacity: Record<StoryAnatomyLayerId, number>;
  layerLine: Record<StoryAnatomyLayerId, number>;
  layerPulse: Record<StoryAnatomyLayerId, number>;
};

const STORY_LAYER_LABEL_IDLE = STORY_ANATOMY_LAYER_ORDER.reduce(
  (acc, id) => {
    acc[id] = 0;
    return acc;
  },
  {} as Record<StoryAnatomyLayerId, number>,
);

function anatomyFromMagnetic(magnetic: MagneticVisual): StoryAnatomyView {
  return {
    panelOffset: magnetic.panelOffset,
    artMagnetDetach: magnetic.artMagnetDetach,
    wallOpacity: magnetic.wallOpacity,
    magnetOpacity: magnetic.magnetOpacity,
    wallSpread: magnetic.wallSpread,
    stickerSpread: magnetic.stickerSpread,
    wallMagnetSpread: magnetic.wallMagnetSpread,
    layerPulse: magnetic.layerPulse,
    layerHighlight: magnetic.layerHighlight,
  };
}

export function storyVisualAt(
  progress: number,
  orientation: StoryOrientation,
  tailLocal = 0,
): StoryVisual {
  const p = clamp01(progress);
  const ranges = getStoryBeatRanges();
  const surfaceEnd = ranges.surface.end;
  const edgeEnd = ranges.edge.end;

  if (p <= surfaceEnd || surfaceEnd >= 1) {
    const local = surfaceEnd <= 0 ? 0 : Math.min(1, p / surfaceEnd);
    const surface = surfaceVisualAt(local);
    return {
      beat: 'surface',
      amount: surface.amount,
      pose: surface.pose,
      stageOpacity: surface.stageOpacity,
      copyOpacity: surface.copyOpacity,
      grazingMix: surface.grazingMix,
      edgeMix: 0,
      rimMix: 0,
      sweep: 0,
      glint: 0,
      edgeCopyOpacity: 0,
      disclosureOpacity: 0,
      anatomy: STORY_ANATOMY_IDLE,
      magneticCopyOpacity: 0,
      stackCopyOpacity: 0,
      explodeDisclosureOpacity: 0,
      detachDisclosureOpacity: 0,
      layerLabelOpacity: STORY_LAYER_LABEL_IDLE,
      layerLine: STORY_LAYER_LABEL_IDLE,
      layerPulse: STORY_LAYER_LABEL_IDLE,
    };
  }

  if (p <= edgeEnd || edgeEnd >= 1) {
    const local = (p - surfaceEnd) / Math.max(0.0001, edgeEnd - surfaceEnd);
    const edge = edgeVisualAt(local, orientation);
    return {
      beat: 'edge',
      amount: 1,
      pose: edge.pose,
      stageOpacity: edge.stageOpacity,
      copyOpacity: 0,
      grazingMix: edge.grazingMix,
      edgeMix: edge.edgeMix,
      rimMix: edge.rimMix,
      sweep: edge.sweep,
      glint: edge.glint,
      edgeCopyOpacity: edge.edgeCopyOpacity,
      disclosureOpacity: edge.disclosureOpacity,
      anatomy: STORY_ANATOMY_IDLE,
      magneticCopyOpacity: 0,
      stackCopyOpacity: 0,
      explodeDisclosureOpacity: 0,
      detachDisclosureOpacity: 0,
      layerLabelOpacity: STORY_LAYER_LABEL_IDLE,
      layerLine: STORY_LAYER_LABEL_IDLE,
      layerPulse: STORY_LAYER_LABEL_IDLE,
    };
  }

  const local = (p - edgeEnd) / Math.max(0.0001, 1 - edgeEnd);
  const magnetic = magneticVisualAt(local, orientation);
  const tail = Math.min(1, Math.max(0, tailLocal));
  const pose =
    tail > 0.0001 ? magneticTailPose(tail, orientation, magnetic.envelopeCenterZ) : magnetic.pose;
  return {
    beat: 'magnetic',
    amount: 1,
    pose,
    stageOpacity: 1,
    copyOpacity: 0,
    grazingMix: 0.2,
    edgeMix: magnetic.edgeMix,
    rimMix: 0,
    sweep: 0,
    glint: 0,
    edgeCopyOpacity: 0,
    disclosureOpacity: 0,
    anatomy: anatomyFromMagnetic(magnetic),
    magneticCopyOpacity: tail > 0.0001 ? 0 : magnetic.magneticCopyOpacity,
    stackCopyOpacity: tail > 0.0001 ? 0 : magnetic.stackCopyOpacity,
    explodeDisclosureOpacity: tail > 0.0001 ? 0 : magnetic.explodeDisclosureOpacity,
    detachDisclosureOpacity: tail > 0.0001 ? 0 : magnetic.detachDisclosureOpacity,
    layerLabelOpacity: tail > 0.0001 ? STORY_LAYER_LABEL_IDLE : magnetic.layerLabelOpacity,
    layerLine: tail > 0.0001 ? STORY_LAYER_LABEL_IDLE : magnetic.layerLine,
    layerPulse: tail > 0.0001 ? STORY_LAYER_LABEL_IDLE : magnetic.layerPulse,
  };
}
