import {Composition, Still} from "remotion";
import {BuildWeekDemo} from "./BuildWeekDemo";
import {BuildWeekDemoV2} from "./BuildWeekDemoV2";
import {Thumbnail} from "./Thumbnail";
import {ThumbnailV2} from "./ThumbnailV2";
import {COMPOSITION_FRAMES, FPS, HEIGHT, WIDTH} from "./timeline";
import {V2_COMPOSITION_FRAMES, V2_FPS, V2_HEIGHT, V2_WIDTH} from "./timeline-v2";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="CodexMerchBuildWeek"
        component={BuildWeekDemo}
        durationInFrames={COMPOSITION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Still
        id="CodexMerchThumbnail"
        component={Thumbnail}
        width={1280}
        height={720}
      />
      <Composition
        id="CodexMerchBuildWeekV2"
        component={BuildWeekDemoV2}
        durationInFrames={V2_COMPOSITION_FRAMES}
        fps={V2_FPS}
        width={V2_WIDTH}
        height={V2_HEIGHT}
      />
      <Still
        id="CodexMerchThumbnailV2"
        component={ThumbnailV2}
        width={1280}
        height={720}
      />
    </>
  );
};
