import {AbsoluteFill, Img, staticFile} from "remotion";
import {COLORS, FONT_MONO, FONT_SANS} from "./brand";

export const Thumbnail = () => {
  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink}}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(8,8,8,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(8,8,8,0.055) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 56,
          background: COLORS.blue,
        }}
      />
      <div style={{position: "absolute", left: 92, top: 62, width: 720}}>
        <div style={{fontFamily: FONT_MONO, fontSize: 22, fontWeight: 800, color: COLORS.blue}}>
          OPENAI BUILD WEEK / WORK & PRODUCTIVITY
        </div>
        <div
          style={{
            marginTop: 28,
            fontFamily: FONT_MONO,
            fontSize: 82,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 0.91,
            textTransform: "uppercase",
          }}
        >
          One premise
          <br />
          becomes an
          <br />
          inspectable
          <br />
          garment system.
        </div>
        <div
          style={{
            marginTop: 28,
            fontFamily: FONT_SANS,
            fontSize: 27,
            fontWeight: 700,
          }}
        >
          Codex + GPT-5.6 · deterministic release gates
        </div>
        <div style={{display: "flex", gap: 10, marginTop: 28}}>
          {["PUBLIC PREVIEW", "CHECKOUT DISABLED"].map((label) => (
            <div
              key={label}
              style={{
                background: COLORS.ink,
                color: COLORS.white,
                fontFamily: FONT_MONO,
                fontSize: 17,
                fontWeight: 800,
                padding: "10px 12px",
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
          right: 44,
          top: 48,
          width: 430,
          height: 620,
          overflow: "hidden",
          border: `3px solid ${COLORS.ink}`,
          background: COLORS.white,
          boxShadow: `16px 16px 0 ${COLORS.blue}`,
          transform: "rotate(1.5deg)",
        }}
      >
        <div
          style={{
            height: 42,
            background: COLORS.blue,
            color: COLORS.white,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontFamily: FONT_MONO,
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          SOLWARD INDEX / PREVIEW
        </div>
        <Img
          src={staticFile("images/solward-catalog.png")}
          style={{width: "100%", height: "calc(100% - 42px)", objectFit: "cover"}}
        />
      </div>
    </AbsoluteFill>
  );
};
