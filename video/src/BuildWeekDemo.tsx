import type {CSSProperties, ReactNode} from "react";
import {Audio, Video} from "@remotion/media";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {wipe} from "@remotion/transitions/wipe";
import captionsData from "./captions.json";
import {COLORS, FONT_MONO, FONT_SANS} from "./brand";
import {
  FPS,
  SCENE_FRAMES,
  TRANSITION_FRAMES,
  WALKTHROUGH_END_FRAME,
  WALKTHROUGH_PIPELINE_START_FRAME,
} from "./timeline";

type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
};

type CalloutProps = {
  from: number;
  to: number;
  children: ReactNode;
  align?: "left" | "right";
  top?: number;
};

const captions = captionsData as CaptionCue[];

const fill: CSSProperties = {
  width: "100%",
  height: "100%",
};

const BlueprintBackground = ({dark = false}: {dark?: boolean}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: dark ? COLORS.ink : COLORS.paper,
        backgroundImage: dark
          ? "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)"
          : "linear-gradient(rgba(8,8,8,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(8,8,8,0.055) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    />
  );
};

const GlobalLabels = () => {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 32,
          top: 26,
          zIndex: 80,
          padding: "8px 12px",
          background: COLORS.ink,
          color: COLORS.white,
          fontFamily: FONT_MONO,
          fontSize: 18,
          letterSpacing: 0.5,
        }}
      >
        AI-GENERATED VOICE / GPT-AUDIO-1.5
      </div>
      <div
        style={{
          position: "absolute",
          right: 32,
          top: 26,
          zIndex: 80,
          padding: "8px 12px",
          border: `2px solid ${COLORS.ink}`,
          background: COLORS.paper,
          color: COLORS.ink,
          fontFamily: FONT_MONO,
          fontSize: 18,
          letterSpacing: 0.5,
        }}
      >
        INDEPENDENT BUILD WEEK PROJECT
      </div>
    </>
  );
};

const Eyebrow = ({children, inverse = false}: {children: ReactNode; inverse?: boolean}) => (
  <div
    style={{
      color: inverse ? COLORS.white : COLORS.blue,
      fontFamily: FONT_MONO,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: 1.1,
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

const AnimatedTitle = ({
  children,
  fontSize = 104,
  color = COLORS.ink,
  maxWidth,
}: {
  children: ReactNode;
  fontSize?: number;
  color?: string;
  maxWidth?: number;
}) => {
  const frame = useCurrentFrame();
  const entrance = spring({
    fps: FPS,
    frame,
    config: {damping: 200},
    durationInFrames: 30,
  });
  const translateY = interpolate(entrance, [0, 1], [48, 0]);

  return (
    <div
      style={{
        color,
        fontFamily: FONT_MONO,
        fontSize,
        fontWeight: 800,
        letterSpacing: -4,
        lineHeight: 0.92,
        maxWidth,
        opacity: entrance,
        textTransform: "uppercase",
        transform: `translateY(${translateY}px)`,
      }}
    >
      {children}
    </div>
  );
};

const Callout = ({from, to, children, align = "left", top = 130}: CalloutProps) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [from, from + 12, to - 12, to],
    [0, 1, 1, 0],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );
  const shift = interpolate(opacity, [0, 1], [align === "left" ? -24 : 24, 0]);

  if (frame < from || frame > to) return null;

  return (
    <div
      style={{
        position: "absolute",
        [align]: 44,
        top,
        zIndex: 30,
        width: 500,
        border: `2px solid ${COLORS.ink}`,
        background: COLORS.paper,
        boxShadow: `10px 10px 0 ${COLORS.blue}`,
        color: COLORS.ink,
        fontFamily: FONT_MONO,
        fontSize: 25,
        fontWeight: 800,
        lineHeight: 1.2,
        opacity,
        padding: "18px 22px",
        textTransform: "uppercase",
        transform: `translateX(${shift}px)`,
      }}
    >
      {children}
    </div>
  );
};

const WindowFrame = ({children, title}: {children: ReactNode; title: string}) => (
  <div
    style={{
      position: "absolute",
      inset: "94px 42px 78px",
      overflow: "hidden",
      border: `3px solid ${COLORS.ink}`,
      background: COLORS.white,
      boxShadow: "18px 18px 0 rgba(8,8,8,0.2)",
    }}
  >
    <div
      style={{
        height: 54,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        color: COLORS.white,
        background: COLORS.blue,
        fontFamily: FONT_MONO,
        fontSize: 20,
        fontWeight: 800,
        letterSpacing: 0.5,
      }}
    >
      <span>{title}</span>
      <span>PUBLIC PREVIEW / CHECKOUT DISABLED</span>
    </div>
    <div style={{height: "calc(100% - 54px)", overflow: "hidden"}}>{children}</div>
  </div>
);

const IntroScene = () => {
  const frame = useCurrentFrame();
  const imageProgress = spring({
    frame: frame - 10,
    fps: FPS,
    config: {damping: 200},
    durationInFrames: 36,
  });

  return (
    <AbsoluteFill style={{background: COLORS.paper}}>
      <BlueprintBackground />
      <div style={{position: "absolute", left: 76, top: 134, width: 1080}}>
        <Eyebrow>OpenAI Build Week / Work & Productivity</Eyebrow>
        <div style={{height: 24}} />
        <AnimatedTitle fontSize={122} maxWidth={1040}>
          One premise.
          <br />
          One garment system.
        </AnimatedTitle>
        <div
          style={{
            marginTop: 34,
            maxWidth: 880,
            fontFamily: FONT_SANS,
            fontSize: 36,
            fontWeight: 650,
            lineHeight: 1.25,
          }}
        >
          Truthful provenance, bounded AI judgment, deterministic release gates.
        </div>
        <div style={{display: "flex", gap: 14, marginTop: 34}}>
          {["BUILT WITH CODEX", "GPT-5.6", "PREVIEW-ONLY"].map((label) => (
            <div
              key={label}
              style={{
                background: label === "GPT-5.6" ? COLORS.blue : COLORS.ink,
                color: COLORS.white,
                fontFamily: FONT_MONO,
                fontSize: 21,
                fontWeight: 800,
                padding: "12px 16px",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 72,
          top: 176,
          width: 570,
          height: 720,
          opacity: imageProgress,
          overflow: "hidden",
          border: `3px solid ${COLORS.ink}`,
          transform: `translateX(${interpolate(imageProgress, [0, 1], [70, 0])}px) rotate(2deg)`,
        }}
      >
        <Img
          src={staticFile("images/solward-catalog.png")}
          style={{...fill, objectFit: "cover"}}
        />
      </div>
    </AbsoluteFill>
  );
};

const ProductScene = () => (
  <AbsoluteFill style={{background: "#d9d9d9"}}>
    <WindowFrame title="LIVE WALKTHROUGH / CATALOG → SOLWARD INDEX">
      <Video
        src={staticFile("capture/walkthrough-trimmed.mp4")}
        muted
        trimBefore={0}
        trimAfter={WALKTHROUGH_PIPELINE_START_FRAME}
        playbackRate={0.78}
        style={{...fill, objectFit: "cover"}}
      />
    </WindowFrame>
    <Callout from={110} to={330} top={145}>
      Safe public data. Preview state is explicit.
    </Callout>
    <Callout from={380} to={610} align="right" top={170}>
      Four customer-facing views plus six provider-sized placements.
    </Callout>
    <Callout from={680} to={940} top={690}>
      Rights provenance recorded. Checkout stays disabled.
    </Callout>
  </AbsoluteFill>
);

const RoleColumn = ({
  label,
  color,
  items,
}: {
  label: string;
  color: string;
  items: string[];
}) => (
  <div style={{border: `3px solid ${COLORS.ink}`, background: COLORS.white}}>
    <div
      style={{
        background: color,
        color: COLORS.white,
        fontFamily: FONT_MONO,
        fontSize: 28,
        fontWeight: 800,
        padding: "18px 22px",
      }}
    >
      {label}
    </div>
    <div style={{padding: "14px 24px 20px"}}>
      {items.map((item, index) => (
        <div
          key={item}
          style={{
            display: "grid",
            gridTemplateColumns: "54px 1fr",
            alignItems: "center",
            minHeight: 72,
            borderBottom: index === items.length - 1 ? undefined : `1px solid ${COLORS.rule}`,
            fontFamily: FONT_SANS,
            fontSize: 25,
            fontWeight: 650,
          }}
        >
          <span style={{fontFamily: FONT_MONO, color: COLORS.muted}}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  </div>
);

const ArchitectureScene = () => {
  const frame = useCurrentFrame();
  const progress = spring({frame, fps: FPS, config: {damping: 200}, durationInFrames: 34});

  return (
    <AbsoluteFill style={{background: COLORS.paper, padding: "110px 70px 70px"}}>
      <BlueprintBackground />
      <div style={{position: "relative", zIndex: 2}}>
        <Eyebrow>Architecture / one shared guarded studio</Eyebrow>
        <div style={{display: "flex", alignItems: "end", justifyContent: "space-between", marginTop: 12}}>
          <AnimatedTitle fontSize={86}>Judgment is not authority.</AnimatedTitle>
          <div style={{fontFamily: FONT_MONO, fontSize: 22, paddingBottom: 12}}>
            TWO INPUTS → ONE CONTRACT
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 30,
            marginTop: 46,
            opacity: progress,
            transform: `translateY(${interpolate(progress, [0, 1], [42, 0])}px)`,
          }}
        >
          <RoleColumn
            label="GPT-5.6 / BOUNDED JUDGMENT"
            color={COLORS.blue}
            items={[
              "Trend or truthful no_trend",
              "Exactly three art directions",
              "Critique of actual rendered images",
            ]}
          />
          <RoleColumn
            label="DETERMINISTIC CODE / AUTHORITY"
            color={COLORS.ink}
            items={[
              "Provenance, schemas, rights, state",
              "Six-panel Sharp composition + hashes",
              "Dimensions, prepress, release gates",
            ]}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            marginTop: 30,
            border: `3px solid ${COLORS.ink}`,
            background: COLORS.ink,
            gap: 2,
          }}
        >
          {["FRONT", "BACK", "LEFT SLEEVE", "RIGHT SLEEVE", "PANEL LABEL", "INSIDE LABEL"].map((panel) => (
            <div
              key={panel}
              style={{
                background: COLORS.paper,
                color: COLORS.ink,
                fontFamily: FONT_MONO,
                fontSize: 19,
                fontWeight: 800,
                padding: "18px 10px",
                textAlign: "center",
              }}
            >
              {panel}
            </div>
          ))}
        </div>
        <div style={{marginTop: 16, fontFamily: FONT_MONO, fontSize: 20, color: COLORS.muted}}>
          5037 × 6600 PX AT 150 DPI / INSIDE LABEL 375 × 150 PX / STORE: FALSE
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PipelineScene = () => (
  <AbsoluteFill style={{background: "#d9d9d9"}}>
    <WindowFrame title="LIVE WALKTHROUGH / INTAKE → CONTRACTS → RELEASE BOUNDARY">
      <Video
        src={staticFile("capture/walkthrough-trimmed.mp4")}
        muted
        trimBefore={WALKTHROUGH_PIPELINE_START_FRAME}
        trimAfter={WALKTHROUGH_END_FRAME}
        playbackRate={1.02}
        style={{...fill, objectFit: "cover"}}
      />
    </WindowFrame>
    <Callout from={110} to={360} top={150}>
      Owner route: discovery skipped. Downstream gates retained.
    </Callout>
    <Callout from={430} to={720} align="right" top={160}>
      Weekly route: exactly 30 authorized posts or no_trend.
    </Callout>
    <Callout from={790} to={1080} top={700}>
      Prompts, schemas, dimensions, and thresholds stay inspectable.
    </Callout>
    <Callout from={1130} to={1420} align="right" top={690}>
      Preview lane only. No provider or payment mutation.
    </Callout>
  </AbsoluteFill>
);

const Metric = ({value, label, note}: {value: string; label: string; note: string}) => (
  <div
    style={{
      minHeight: 280,
      border: `3px solid ${COLORS.ink}`,
      background: COLORS.white,
      padding: "30px 34px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
    }}
  >
    <div style={{fontFamily: FONT_MONO, fontSize: 82, fontWeight: 900, letterSpacing: -5}}>{value}</div>
    <div>
      <div style={{fontFamily: FONT_MONO, fontSize: 26, fontWeight: 800}}>{label}</div>
      <div style={{fontFamily: FONT_SANS, fontSize: 21, color: COLORS.muted, marginTop: 8}}>{note}</div>
    </div>
  </div>
);

const EvidenceScene = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{background: COLORS.paper, padding: "112px 72px 64px"}}>
      <BlueprintBackground />
      <div style={{position: "relative", zIndex: 2}}>
        <Eyebrow>Evidence / judged Preview commit</Eyebrow>
        <div style={{marginTop: 14}}>
          <AnimatedTitle fontSize={88}>The proof is inspectable.</AnimatedTitle>
        </div>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 44}}>
          {[
            ["11", "PRODUCTS VALIDATED", "Catalog schema and production-state checks"],
            ["133/133", "JUDGED-BRANCH TESTS", "Functional suite at the submitted Preview commit"],
            ["12/12", "BROWSER CHECKS", "Desktop + mobile, local + public Preview"],
            ["87/100", "SOLWARD CRITIC", "Six placements; provider references remain empty"],
          ].map(([value, label, note], index) => {
            const reveal = spring({
              frame: frame - index * 8,
              fps: FPS,
              config: {damping: 200},
              durationInFrames: 28,
            });
            return (
              <div key={label} style={{opacity: reveal, transform: `translateY(${(1 - reveal) * 28}px)`}}>
                <Metric value={value} label={label} note={note} />
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 24,
            borderLeft: `8px solid ${COLORS.blue}`,
            padding: "14px 20px",
            fontFamily: FONT_MONO,
            fontSize: 20,
          }}
        >
          FUNCTIONAL CHECKS PASSED. OWNER-ONLY ELIGIBILITY, RIGHTS, VIDEO URL, FEEDBACK ID, AND FINAL SUBMISSION FIELDS REMAIN OWNER ACTIONS.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const DisclosureScene = () => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [0, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{background: COLORS.blue, color: COLORS.white, padding: "118px 82px 70px"}}>
      <BlueprintBackground dark />
      <div style={{position: "relative", zIndex: 2}}>
        <Eyebrow inverse>Explicit AI + production disclosure</Eyebrow>
        <div style={{marginTop: 18}}>
          <AnimatedTitle color={COLORS.white} fontSize={96} maxWidth={1500}>
            What AI did — and what it did not do.
          </AnimatedTitle>
        </div>
        <div
          style={{
            width: `${line * 100}%`,
            height: 5,
            background: COLORS.white,
            marginTop: 34,
          }}
        />
        <div
          style={{
            marginTop: 34,
            maxWidth: 1670,
            fontFamily: FONT_SANS,
            fontSize: 37,
            fontWeight: 650,
            lineHeight: 1.34,
          }}
        >
          GPT-5.6 produced structured trend and art-direction judgments and reviewed rendered images. Codex image generation assisted the concept board. Six print panels and exact text were composed deterministically. Narration was synthesized with OpenAI gpt-audio-1.5.
        </div>
        <div
          style={{
            marginTop: 42,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
          }}
        >
          {["STRIPE", "PRINTFUL", "NEON", "INNGEST"].map((service) => (
            <div
              key={service}
              style={{
                border: `2px solid ${COLORS.white}`,
                padding: "18px 16px",
                fontFamily: FONT_MONO,
                fontSize: 23,
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {service}
              <div style={{fontSize: 16, marginTop: 8, opacity: 0.78}}>PRODUCTION-ONLY / NOT DEMONSTRATED</div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 30,
            background: COLORS.white,
            color: COLORS.ink,
            padding: "20px 24px",
            fontFamily: FONT_MONO,
            fontSize: 24,
            fontWeight: 900,
          }}
        >
          NO PAYMENT, PROVIDER SYNC, PUBLICATION, OR FULFILLMENT ACTION IS SHOWN.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OutroScene = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, SCENE_FRAMES.outro], [1.06, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{background: COLORS.ink, color: COLORS.white}}>
      <Img
        src={staticFile("images/solward-catalog.png")}
        style={{...fill, objectFit: "cover", opacity: 0.24, transform: `scale(${scale})`}}
      />
      <AbsoluteFill style={{background: "linear-gradient(90deg, rgba(8,8,8,0.98) 0%, rgba(8,8,8,0.86) 58%, rgba(8,8,8,0.25) 100%)"}} />
      <div style={{position: "absolute", left: 84, top: 186, width: 1270}}>
        <Eyebrow inverse>Codex Meme Merch</Eyebrow>
        <div style={{height: 22}} />
        <AnimatedTitle color={COLORS.white} fontSize={106}>
          Inspect the system.
          <br />
          Believe the evidence.
        </AnimatedTitle>
        <div style={{marginTop: 40, fontFamily: FONT_MONO, fontSize: 27, lineHeight: 1.45}}>
          codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 26,
            background: COLORS.blue,
            padding: "16px 20px",
            fontFamily: FONT_MONO,
            fontSize: 23,
            fontWeight: 800,
          }}
        >
          PUBLIC PREVIEW / CHECKOUT DISABLED
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CaptionLayer = () => {
  return (
    <AbsoluteFill style={{pointerEvents: "none", zIndex: 90}}>
      {captions.map((cue) => {
        const from = Math.round((cue.startMs / 1000) * FPS);
        const duration = Math.max(1, Math.round(((cue.endMs - cue.startMs) / 1000) * FPS));
        return (
          <Sequence
            key={`${cue.startMs}-${cue.endMs}-${cue.text}`}
            from={from}
            durationInFrames={duration}
            premountFor={FPS}
          >
            <div
              style={{
                position: "absolute",
                left: 190,
                right: 190,
                bottom: 28,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  maxWidth: 1500,
                  border: `2px solid ${COLORS.white}`,
                  background: "rgba(8,8,8,0.9)",
                  color: COLORS.white,
                  fontFamily: FONT_SANS,
                  fontSize: 30,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  padding: "12px 18px",
                  textAlign: "center",
                }}
              >
                {cue.text}
              </div>
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const PremountedScene = ({duration, children}: {duration: number; children: ReactNode}) => (
  <Sequence from={0} durationInFrames={duration} premountFor={FPS}>
    {children}
  </Sequence>
);

export const BuildWeekDemo = () => {
  const {durationInFrames} = useVideoConfig();
  const transition = linearTiming({durationInFrames: TRANSITION_FRAMES});

  return (
    <AbsoluteFill style={{background: COLORS.paper, fontFamily: FONT_SANS}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES.intro}>
          <PremountedScene duration={SCENE_FRAMES.intro}>
            <IntroScene />
          </PremountedScene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({direction: "from-right"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES.product}>
          <PremountedScene duration={SCENE_FRAMES.product}>
            <ProductScene />
          </PremountedScene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-bottom"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES.architecture}>
          <PremountedScene duration={SCENE_FRAMES.architecture}>
            <ArchitectureScene />
          </PremountedScene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES.pipeline}>
          <PremountedScene duration={SCENE_FRAMES.pipeline}>
            <PipelineScene />
          </PremountedScene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({direction: "from-left"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES.evidence}>
          <PremountedScene duration={SCENE_FRAMES.evidence}>
            <EvidenceScene />
          </PremountedScene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-right"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES.disclosure}>
          <PremountedScene duration={SCENE_FRAMES.disclosure}>
            <DisclosureScene />
          </PremountedScene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES.outro}>
          <PremountedScene duration={SCENE_FRAMES.outro}>
            <OutroScene />
          </PremountedScene>
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Sequence from={0} durationInFrames={durationInFrames} premountFor={FPS}>
        <Audio src={staticFile("audio/narration.wav")} volume={1} />
      </Sequence>
      <GlobalLabels />
      <CaptionLayer />
    </AbsoluteFill>
  );
};
