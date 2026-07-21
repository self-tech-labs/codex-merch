export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TRANSITION_FRAMES = 70;

export const SCENE_FRAMES = {
  intro: 300,
  product: 1020,
  architecture: 840,
  pipeline: 1500,
  evidence: 720,
  disclosure: 780,
  outro: 360,
} as const;

export const COMPOSITION_FRAMES =
  Object.values(SCENE_FRAMES).reduce((sum, frames) => sum + frames, 0) -
  TRANSITION_FRAMES * (Object.keys(SCENE_FRAMES).length - 1);

export const WALKTHROUGH_PIPELINE_START_FRAME = Math.round(26.1 * FPS);
export const WALKTHROUGH_END_FRAME = Math.round(76.6 * FPS);
