import type {CSSProperties, ReactNode} from "react";
import {Audio} from "@remotion/media";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {wipe} from "@remotion/transitions/wipe";
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
import captionsData from "./captions-v2.json";
import {COLORS, FONT_MONO, FONT_SANS} from "./brand";
import {
  V2_FPS,
  V2_SCENE_FRAMES,
  V2_TRANSITION_FRAMES,
} from "./timeline-v2";

type CaptionCue = {startMs: number; endMs: number; text: string};
type Tone = "paper" | "ink" | "signal" | "blue";

const captions = captionsData as CaptionCue[];
const capture = (name: string) => staticFile(`capture/v2/${name}.jpg`);
const full: CSSProperties = {width: "100%", height: "100%"};

const toneColor = (tone: Tone) => {
  if (tone === "ink") return COLORS.ink;
  if (tone === "signal") return COLORS.signal;
  if (tone === "blue") return COLORS.blue;
  return COLORS.paper;
};

const SignalGrid = ({tone = "paper"}: {tone?: Tone}) => {
  const frame = useCurrentFrame();
  const background = toneColor(tone);
  const dark = tone === "ink" || tone === "blue";
  const x = (frame * 1.4) % 56;
  return (
    <AbsoluteFill
      style={{
        background,
        backgroundImage: dark
          ? "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)"
          : "linear-gradient(rgba(8,8,8,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(8,8,8,0.06) 1px, transparent 1px)",
        backgroundPosition: `${x}px 0`,
        backgroundSize: "56px 56px",
      }}
    />
  );
};

const GlobalLabels = () => (
  <>
    <div
      style={{
        position: "absolute",
        zIndex: 90,
        left: 28,
        top: 24,
        background: COLORS.ink,
        color: COLORS.white,
        fontFamily: FONT_MONO,
        fontSize: 17,
        fontWeight: 800,
        letterSpacing: 0.5,
        padding: "9px 12px",
      }}
    >
      AI VOICE / OPENAI GPT-AUDIO-1.5
    </div>
    <div
      style={{
        position: "absolute",
        zIndex: 90,
        right: 28,
        top: 24,
        border: `2px solid ${COLORS.ink}`,
        background: COLORS.signal,
        color: COLORS.ink,
        fontFamily: FONT_MONO,
        fontSize: 17,
        fontWeight: 900,
        letterSpacing: 0.5,
        padding: "8px 12px",
      }}
    >
      OPEN SOURCE / BUILD WEEK PREVIEW
    </div>
  </>
);

const Eyebrow = ({children, inverse = false}: {children: ReactNode; inverse?: boolean}) => (
  <div
    style={{
      color: inverse ? COLORS.signal : COLORS.blue,
      fontFamily: FONT_MONO,
      fontSize: 22,
      fontWeight: 900,
      letterSpacing: 1.1,
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

const AnimatedTitle = ({
  children,
  color = COLORS.ink,
  fontSize = 100,
  maxWidth,
}: {
  children: ReactNode;
  color?: string;
  fontSize?: number;
  maxWidth?: number;
}) => {
  const frame = useCurrentFrame();
  const reveal = spring({
    fps: V2_FPS,
    frame,
    config: {damping: 200},
    durationInFrames: 30,
  });
  return (
    <div
      style={{
        color,
        fontFamily: FONT_MONO,
        fontSize,
        fontWeight: 900,
        letterSpacing: -5,
        lineHeight: 0.88,
        maxWidth,
        opacity: reveal,
        textTransform: "uppercase",
        transform: `translateY(${interpolate(reveal, [0, 1], [42, 0])}px)`,
      }}
    >
      {children}
    </div>
  );
};

const SignalTape = ({labels}: {labels: string[]}) => {
  const frame = useCurrentFrame();
  const offset = -((frame * 3.2) % 430);
  const repeated = labels.flatMap((label) =>
    ["a", "b", "c"].map((round) => ({key: `${label}-${round}`, label})),
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 68,
        overflow: "hidden",
        borderTop: `3px solid ${COLORS.ink}`,
        background: COLORS.signal,
        color: COLORS.ink,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 54,
          width: "max-content",
          transform: `translateX(${offset}px)`,
          fontFamily: FONT_MONO,
          fontSize: 23,
          fontWeight: 900,
          lineHeight: "65px",
          whiteSpace: "nowrap",
        }}
      >
        {repeated.map((item) => (
          <span key={item.key}>→ {item.label}</span>
        ))}
      </div>
    </div>
  );
};

const IntroScene = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(frame, [0, V2_SCENE_FRAMES.intro], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{background: COLORS.paper}}>
      <SignalGrid />
      <div style={{position: "absolute", left: 78, top: 144, width: 1310}}>
        <Eyebrow>OpenAI Build Week / open fashion infrastructure</Eyebrow>
        <div style={{height: 26}} />
        <AnimatedTitle fontSize={150} maxWidth={1280}>
          Signal in.
          <br />
          Merch out.
        </AnimatedTitle>
        <div
          style={{
            marginTop: 38,
            maxWidth: 1000,
            fontFamily: FONT_SANS,
            fontSize: 37,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          An open-source, hackable trend signal → real merch pipeline.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 72,
          top: 158,
          width: 420,
          height: 710,
          border: `3px solid ${COLORS.ink}`,
          background: COLORS.ink,
          boxShadow: `18px 18px 0 ${COLORS.signal}`,
          overflow: "hidden",
          transform: `rotate(${interpolate(pulse, [0, 1], [3.5, 1.2])}deg)`,
        }}
      >
        <Img
          src={staticFile("images/solward-catalog.png")}
          style={{...full, objectFit: "cover"}}
        />
      </div>
      <SignalTape labels={["OPEN SOURCE", "TRUSTED SIGNAL", "REAL PANELS", "GATED RELEASE"]} />
    </AbsoluteFill>
  );
};

const FlowNode = ({
  index,
  label,
  detail,
  accent = false,
}: {
  index: string;
  label: string;
  detail: string;
  accent?: boolean;
}) => {
  const frame = useCurrentFrame();
  const order = Number(index) - 1;
  const reveal = spring({
    fps: V2_FPS,
    frame: frame - order * 10,
    config: {damping: 200},
    durationInFrames: 30,
  });
  return (
    <div
      style={{
        position: "relative",
        border: `3px solid ${COLORS.ink}`,
        background: accent ? COLORS.signal : COLORS.white,
        minHeight: 330,
        padding: "24px 22px",
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 34}px)`,
      }}
    >
      <div style={{fontFamily: FONT_MONO, fontSize: 20, fontWeight: 900, color: COLORS.blue}}>
        {index} / CONTRACT
      </div>
      <div
        style={{
          marginTop: 86,
          fontFamily: FONT_MONO,
          fontSize: 42,
          fontWeight: 900,
          letterSpacing: -2,
          lineHeight: 0.96,
        }}
      >
        {label}
      </div>
      <div style={{marginTop: 20, fontFamily: FONT_SANS, fontSize: 22, lineHeight: 1.25}}>{detail}</div>
    </div>
  );
};

const PositioningScene = () => (
  <AbsoluteFill style={{background: COLORS.paper, padding: "112px 70px 86px"}}>
    <SignalGrid />
    <div style={{position: "relative", zIndex: 2}}>
      <Eyebrow>The missing middle / signal-to-product</Eyebrow>
      <div style={{display: "flex", alignItems: "end", justifyContent: "space-between", marginTop: 14}}>
        <AnimatedTitle fontSize={89} maxWidth={1280}>
          Make the loop visible.
        </AnimatedTitle>
        <div style={{fontFamily: FONT_MONO, fontSize: 21, fontWeight: 800, paddingBottom: 10}}>
          NOT AN OPAQUE GENERATOR
        </div>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 54}}>
        <FlowNode index="01" label="SIGNAL" detail="Owner brief or authorized evidence." />
        <FlowNode index="02" label="DIRECT" detail="Three ranked, panel-aware worlds." />
        <FlowNode index="03" label="BUILD" detail="Six real production placements." accent />
        <FlowNode index="04" label="PROVE" detail="Critique, rights, dimensions, hashes." />
        <FlowNode index="05" label="RELEASE" detail="Safe Preview or explicit authority." />
      </div>
      <div
        style={{
          marginTop: 24,
          borderLeft: `10px solid ${COLORS.signal}`,
          background: COLORS.ink,
          color: COLORS.white,
          fontFamily: FONT_MONO,
          fontSize: 25,
          fontWeight: 800,
          padding: "18px 22px",
        }}
      >
        TRUSTED PREMISE → REPLACEABLE CONTRACTS → TESTABLE GARMENT
      </div>
    </div>
  </AbsoluteFill>
);

const BrowserFrame = ({children, title}: {children: ReactNode; title: string}) => (
  <div
    style={{
      position: "absolute",
      inset: "96px 42px 82px",
      border: `3px solid ${COLORS.ink}`,
      background: COLORS.ink,
      boxShadow: `16px 16px 0 rgba(8,8,8,0.22)`,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 17px",
        background: COLORS.ink,
        color: COLORS.white,
        fontFamily: FONT_MONO,
        fontSize: 19,
        fontWeight: 900,
      }}
    >
      <span>{title}</span>
      <span style={{color: COLORS.signal}}>REAL LOCAL APP / SAFE PREVIEW DATA</span>
    </div>
    <div style={{position: "relative", height: "calc(100% - 52px)", overflow: "hidden"}}>{children}</div>
  </div>
);

const CaptureSlide = ({
  file,
  from,
  duration,
  position = "center top",
}: {
  file: string;
  from: number;
  duration: number;
  position?: string;
}) => (
  <Sequence from={from} durationInFrames={duration} premountFor={V2_FPS}>
    <CaptureSlideBody file={file} duration={duration} position={position} />
  </Sequence>
);

const CaptureSlideBody = ({file, duration, position}: {file: string; duration: number; position: string}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, duration - 14, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, duration], [1.015, 1.045], {extrapolateRight: "clamp"});
  return (
    <Img
      src={capture(file)}
      style={{
        ...full,
        objectFit: "cover",
        objectPosition: position,
        opacity,
        transform: `scale(${scale})`,
      }}
    />
  );
};

const Callout = ({
  from,
  to,
  children,
  align = "left",
  top = 140,
}: {
  from: number;
  to: number;
  children: ReactNode;
  align?: "left" | "right";
  top?: number;
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const opacity = interpolate(frame, [from, from + 12, to - 12, to], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 40,
        [align]: 56,
        top,
        width: 515,
        border: `3px solid ${COLORS.ink}`,
        background: COLORS.signal,
        boxShadow: `10px 10px 0 ${COLORS.blue}`,
        color: COLORS.ink,
        fontFamily: FONT_MONO,
        fontSize: 25,
        fontWeight: 900,
        lineHeight: 1.15,
        opacity,
        padding: "17px 20px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
};

const ProductScene = () => (
  <AbsoluteFill style={{background: "#d6d6d2"}}>
    <BrowserFrame title="OUTPUT FIRST / CATALOG → SOLWARD INDEX">
      <CaptureSlide file="01-catalog" from={0} duration={180} />
      <CaptureSlide file="02-product" from={160} duration={190} position="center center" />
      <CaptureSlide file="03-product-back" from={330} duration={165} position="center center" />
      <CaptureSlide file="05-product-panels" from={475} duration={205} position="center center" />
      <CaptureSlide file="06-rights" from={660} duration={210} position="center center" />
    </BrowserFrame>
    <Callout from={85} to={245}>Not a generated image. A cataloged product system.</Callout>
    <Callout from={285} to={510} align="right" top={160}>Four customer views. Six provider-sized placements.</Callout>
    <Callout from={555} to={820} top={690}>Hashes and rights stay public. Checkout stays disabled.</Callout>
  </AbsoluteFill>
);

const PipelineScene = () => (
  <AbsoluteFill style={{background: "#d6d6d2"}}>
    <BrowserFrame title="SIMPLIFIED WALKTHROUGH / FIVE MOVES → THREE AUTHORITIES">
      <CaptureSlide file="07-how-top" from={0} duration={355} />
      <CaptureSlide file="08-five-stages" from={335} duration={430} />
      <CaptureSlide file="09-authority" from={745} duration={425} />
    </BrowserFrame>
    <Callout from={90} to={330} top={150}>One sentence enters. Six panels, a catalog entry, and proof come out.</Callout>
    <Callout from={400} to={720} align="right" top={165}>Signal. Direct. Build. Prove. Release.</Callout>
    <Callout from={810} to={1125} top={690}>GPT proposes. Code proves. A human releases.</Callout>
  </AbsoluteFill>
);

const SeamCard = ({index, title, note}: {index: string; title: string; note: string}) => {
  const frame = useCurrentFrame();
  const reveal = spring({
    fps: V2_FPS,
    frame: frame - Number(index) * 8,
    config: {damping: 200},
    durationInFrames: 28,
  });
  return (
    <div
      style={{
        border: `3px solid ${COLORS.ink}`,
        background: COLORS.white,
        padding: "22px 24px",
        opacity: reveal,
        transform: `translateX(${(1 - reveal) * -32}px)`,
      }}
    >
      <div style={{fontFamily: FONT_MONO, fontSize: 18, fontWeight: 900, color: COLORS.blue}}>{index} / SEAM</div>
      <div style={{marginTop: 32, fontFamily: FONT_MONO, fontSize: 33, fontWeight: 900, lineHeight: 0.98}}>{title}</div>
      <div style={{marginTop: 16, fontFamily: FONT_SANS, fontSize: 20, lineHeight: 1.28}}>{note}</div>
    </div>
  );
};

const OpenScene = () => (
  <AbsoluteFill style={{background: COLORS.paper, padding: "108px 62px 76px"}}>
    <SignalGrid />
    <div style={{position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "0.92fr 1.08fr", gap: 34}}>
      <div>
        <Eyebrow>Open by design / repository as product</Eyebrow>
        <div style={{marginTop: 20}}>
          <AnimatedTitle fontSize={82} maxWidth={780}>
            Fork the pipeline,
            <br />not the promise.
          </AnimatedTitle>
        </div>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 42}}>
          <SeamCard index="01" title="SOURCE" note="Community feed, sell-through data, or a trend desk." />
          <SeamCard index="02" title="JUDGMENT" note="Visible prompts plus strict, replaceable schemas." />
          <SeamCard index="03" title="PRODUCT" note="Another garment, technique, or composition grammar." />
          <SeamCard index="04" title="OUTCOME" note="Preview, provider adapter, or commerce stack." />
        </div>
      </div>
      <div
        style={{
          marginTop: 24,
          height: 810,
          border: `3px solid ${COLORS.ink}`,
          background: COLORS.white,
          boxShadow: `16px 16px 0 ${COLORS.signal}`,
          overflow: "hidden",
        }}
      >
        <Img src={capture("10-hackable-seams")} style={{...full, objectFit: "cover", objectPosition: "center top"}} />
      </div>
    </div>
  </AbsoluteFill>
);

const CommercialScene = () => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [0, 50], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const marketColumns = [
    ["SPEED", "ZARA · SHEIN", "Shorter signal-to-sample loops for high-velocity product teams."],
    ["SPECIFICITY", "MICRO-CAPSULES", "Sharper community, geography, and customer-segment product tests."],
    ["R&D", "RICHEMONT · LVMH", "Replaceable sources, models, formats, and approval policies."],
  ];
  return (
    <AbsoluteFill style={{background: COLORS.signal, color: COLORS.ink, padding: "112px 74px 64px"}}>
      <SignalGrid tone="signal" />
      <div style={{position: "relative", zIndex: 2}}>
        <Eyebrow>Commercial thesis / market examples only</Eyebrow>
        <div style={{display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 70, marginTop: 20}}>
          <AnimatedTitle fontSize={96} maxWidth={1120}>
            A small proof for a large fashion problem.
          </AnimatedTitle>
          <div style={{fontFamily: FONT_SANS, fontSize: 31, fontWeight: 700, lineHeight: 1.28, paddingTop: 10}}>
            Make the signal-to-product loop visible, modular, and testable at garment level.
          </div>
        </div>
        <div style={{width: `${line * 100}%`, height: 4, background: COLORS.ink, marginTop: 40}} />
        <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: 0}}>
          {marketColumns.map(([type, names, note], index) => {
            const reveal = spring({frame: frame - index * 9, fps: V2_FPS, config: {damping: 200}, durationInFrames: 30});
            return (
              <div
                key={type}
                style={{
                  minHeight: 330,
                  borderRight: index === 2 ? undefined : `3px solid ${COLORS.ink}`,
                  padding: "28px 28px 18px",
                  opacity: reveal,
                }}
              >
                <div style={{fontFamily: FONT_MONO, fontSize: 19, fontWeight: 900}}>{type}</div>
                <div style={{marginTop: 76, fontFamily: FONT_MONO, fontSize: 42, fontWeight: 900, lineHeight: 0.95}}>{names}</div>
                <div style={{marginTop: 20, fontFamily: FONT_SANS, fontSize: 23, fontWeight: 650, lineHeight: 1.26}}>{note}</div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            border: `3px solid ${COLORS.ink}`,
            background: COLORS.paper,
            fontFamily: FONT_MONO,
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1.25,
            padding: "14px 18px",
          }}
        >
          NO AFFILIATION, ENDORSEMENT, CUSTOMER RELATIONSHIP, OR USE OF PROPRIETARY DATA IS CLAIMED.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Metric = ({value, label}: {value: string; label: string}) => (
  <div style={{border: `2px solid ${COLORS.white}`, minHeight: 210, padding: "24px 26px"}}>
    <div style={{fontFamily: FONT_MONO, fontSize: 69, fontWeight: 900, color: COLORS.signal, letterSpacing: -4}}>{value}</div>
    <div style={{marginTop: 32, fontFamily: FONT_MONO, fontSize: 21, fontWeight: 900}}>{label}</div>
  </div>
);

const ProofScene = () => (
  <AbsoluteFill style={{background: COLORS.ink, color: COLORS.white, padding: "110px 68px 68px"}}>
    <SignalGrid tone="ink" />
    <div style={{position: "relative", zIndex: 2}}>
      <Eyebrow inverse>Repository evidence / authority stays separated</Eyebrow>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "end", marginTop: 16}}>
        <AnimatedTitle color={COLORS.white} fontSize={84}>Inspect the system.</AnimatedTitle>
        <div style={{fontFamily: FONT_MONO, fontSize: 22, fontWeight: 900, paddingBottom: 10}}>PREVIEW / FAIL-CLOSED</div>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 38}}>
        <Metric value="11" label="CATALOG PRODUCTS" />
        <Metric value="147" label="PASSING TESTS" />
        <Metric value="12" label="BROWSER CHECKS" />
        <Metric value="6" label="PRODUCTION PANELS" />
      </div>
      <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 18}}>
        {[
          ["TASTE", "GPT PROPOSES"],
          ["GUARANTEES", "CODE PROVES"],
          ["AUTHORITY", "A HUMAN RELEASES"],
        ].map(([label, title], index) => (
          <div key={label} style={{background: index === 2 ? COLORS.signal : COLORS.white, color: COLORS.ink, padding: "19px 22px"}}>
            <div style={{fontFamily: FONT_MONO, fontSize: 16, fontWeight: 900, color: COLORS.blue}}>{label}</div>
            <div style={{marginTop: 22, fontFamily: FONT_MONO, fontSize: 31, fontWeight: 900}}>{title}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop: 18, fontFamily: FONT_MONO, fontSize: 19, fontWeight: 800, color: COLORS.signal}}>
        NO PAYMENT · NO PROVIDER SYNC · NO PUBLICATION · NO FULFILLMENT ACTION SHOWN
      </div>
    </div>
  </AbsoluteFill>
);

const OutroScene = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, V2_SCENE_FRAMES.outro], [1.08, 1.01], {extrapolateRight: "clamp"});
  return (
    <AbsoluteFill style={{background: COLORS.ink, color: COLORS.white}}>
      <Img src={staticFile("images/solward-catalog.png")} style={{...full, objectFit: "cover", opacity: 0.34, transform: `scale(${scale})`}} />
      <AbsoluteFill style={{background: "linear-gradient(90deg, rgba(8,8,8,0.99) 0%, rgba(8,8,8,0.92) 58%, rgba(8,8,8,0.28) 100%)"}} />
      <div style={{position: "absolute", left: 82, top: 174, width: 1260}}>
        <Eyebrow inverse>Codex Merch / signal → product</Eyebrow>
        <div style={{marginTop: 22}}>
          <AnimatedTitle color={COLORS.white} fontSize={112}>
            Fork the pipeline.
            <br />Inspect the garments.
          </AnimatedTitle>
        </div>
        <div style={{marginTop: 40, fontFamily: FONT_SANS, fontSize: 34, fontWeight: 700}}>
          A small open-source proof for a large fashion problem.
        </div>
        <div style={{display: "flex", gap: 14, marginTop: 34}}>
          {[
            "GITHUB.COM/SELF-TECH-LABS/CODEX-MERCH",
            "PUBLIC PREVIEW / CHECKOUT DISABLED",
          ].map((label, index) => (
            <div
              key={label}
              style={{
                background: index === 0 ? COLORS.signal : COLORS.blue,
                color: index === 0 ? COLORS.ink : COLORS.white,
                fontFamily: FONT_MONO,
                fontSize: 20,
                fontWeight: 900,
                padding: "14px 17px",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CaptionLayer = () => (
  <AbsoluteFill style={{pointerEvents: "none", zIndex: 95}}>
    {captions.map((cue) => {
      const from = Math.round((cue.startMs / 1000) * V2_FPS);
      const duration = Math.max(1, Math.round(((cue.endMs - cue.startMs) / 1000) * V2_FPS));
      return (
        <Sequence key={`${cue.startMs}-${cue.text}`} from={from} durationInFrames={duration} premountFor={V2_FPS}>
          <div style={{position: "absolute", left: 190, right: 190, bottom: 24, display: "flex", justifyContent: "center"}}>
            <div
              style={{
                maxWidth: 1510,
                border: `2px solid ${COLORS.signal}`,
                background: "rgba(8,8,8,0.92)",
                color: COLORS.white,
                fontFamily: FONT_SANS,
                fontSize: 29,
                fontWeight: 700,
                lineHeight: 1.22,
                padding: "11px 17px",
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

const Premounted = ({duration, children}: {duration: number; children: ReactNode}) => (
  <Sequence from={0} durationInFrames={duration} premountFor={V2_FPS}>{children}</Sequence>
);

export const BuildWeekDemoV2 = () => {
  const {durationInFrames} = useVideoConfig();
  const transition = linearTiming({durationInFrames: V2_TRANSITION_FRAMES});
  return (
    <AbsoluteFill style={{background: COLORS.paper, fontFamily: FONT_SANS}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.intro}>
          <Premounted duration={V2_SCENE_FRAMES.intro}><IntroScene /></Premounted>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({direction: "from-right"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.positioning}>
          <Premounted duration={V2_SCENE_FRAMES.positioning}><PositioningScene /></Premounted>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-bottom"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.product}>
          <Premounted duration={V2_SCENE_FRAMES.product}><ProductScene /></Premounted>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.pipeline}>
          <Premounted duration={V2_SCENE_FRAMES.pipeline}><PipelineScene /></Premounted>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({direction: "from-left"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.open}>
          <Premounted duration={V2_SCENE_FRAMES.open}><OpenScene /></Premounted>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-right"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.commercial}>
          <Premounted duration={V2_SCENE_FRAMES.commercial}><CommercialScene /></Premounted>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.proof}>
          <Premounted duration={V2_SCENE_FRAMES.proof}><ProofScene /></Premounted>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({direction: "from-right"})} timing={transition} />
        <TransitionSeries.Sequence durationInFrames={V2_SCENE_FRAMES.outro}>
          <Premounted duration={V2_SCENE_FRAMES.outro}><OutroScene /></Premounted>
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={V2_FPS}>
        <Audio src={staticFile("audio/v2/narration.wav")} volume={1} />
      </Sequence>
      <GlobalLabels />
      <CaptionLayer />
    </AbsoluteFill>
  );
};
