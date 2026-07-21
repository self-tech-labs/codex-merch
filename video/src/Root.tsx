import {Composition, Still} from "remotion";
import {BuildWeekDemo} from "./BuildWeekDemo";
import {Thumbnail} from "./Thumbnail";
import {COMPOSITION_FRAMES, FPS, HEIGHT, WIDTH} from "./timeline";

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
    </>
  );
};
