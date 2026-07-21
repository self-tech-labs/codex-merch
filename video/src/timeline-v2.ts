export const V2_FPS = 30;
export const V2_WIDTH = 1920;
export const V2_HEIGHT = 1080;
export const V2_TRANSITION_FRAMES = 60;

export const V2_SCENE_FRAMES = {
  intro: 330,
  positioning: 570,
  product: 870,
  pipeline: 1170,
  open: 780,
  commercial: 780,
  proof: 660,
  outro: 390,
} as const;

export const V2_COMPOSITION_FRAMES =
  Object.values(V2_SCENE_FRAMES).reduce((sum, frames) => sum + frames, 0) -
  V2_TRANSITION_FRAMES * (Object.keys(V2_SCENE_FRAMES).length - 1);
