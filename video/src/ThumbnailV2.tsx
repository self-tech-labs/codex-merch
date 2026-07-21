import {AbsoluteFill, Img, staticFile} from "remotion";
import {COLORS, FONT_MONO, FONT_SANS} from "./brand";

export const ThumbnailV2 = () => (
  <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink}}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(8,8,8,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(8,8,8,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    />
    <div style={{position: "absolute", left: 0, top: 0, bottom: 0, width: 48, background: COLORS.signal}} />
    <div style={{position: "absolute", left: 82, top: 56, width: 770}}>
      <div style={{fontFamily: FONT_MONO, fontSize: 21, fontWeight: 900, color: COLORS.blue}}>
        OPENAI BUILD WEEK / OPEN FASHION INFRASTRUCTURE
      </div>
      <div
        style={{
          marginTop: 26,
          fontFamily: FONT_MONO,
          fontSize: 104,
          fontWeight: 900,
          letterSpacing: -6,
          lineHeight: 0.83,
          textTransform: "uppercase",
        }}
      >
        Signal in.
        <br />Merch out.
      </div>
      <div style={{marginTop: 30, fontFamily: FONT_SANS, fontSize: 29, fontWeight: 750, lineHeight: 1.2}}>
        An open-source, hackable trend signal → real merch pipeline.
      </div>
      <div style={{display: "flex", gap: 10, marginTop: 28}}>
        {["OPEN SOURCE", "6 REAL PANELS", "GATED RELEASE"].map((label, index) => (
          <div
            key={label}
            style={{
              background: index === 0 ? COLORS.signal : COLORS.ink,
              color: index === 0 ? COLORS.ink : COLORS.white,
              border: `2px solid ${COLORS.ink}`,
              fontFamily: FONT_MONO,
              fontSize: 17,
              fontWeight: 900,
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
        right: 46,
        top: 42,
        width: 378,
        height: 622,
        border: `3px solid ${COLORS.ink}`,
        background: COLORS.white,
        boxShadow: `16px 16px 0 ${COLORS.signal}`,
        overflow: "hidden",
        transform: "rotate(1.8deg)",
      }}
    >
      <div
        style={{
          height: 42,
          display: "flex",
          alignItems: "center",
          padding: "0 13px",
          background: COLORS.ink,
          color: COLORS.signal,
          fontFamily: FONT_MONO,
          fontSize: 15,
          fontWeight: 900,
        }}
      >
        SOLWARD INDEX / REAL OUTPUT
      </div>
      <Img
        src={staticFile("images/solward-catalog.png")}
        style={{width: "100%", height: "calc(100% - 42px)", objectFit: "cover"}}
      />
    </div>
  </AbsoluteFill>
);
