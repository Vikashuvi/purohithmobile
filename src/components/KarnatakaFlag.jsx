import React from "react";
import { View, Text } from "react-native";
import Svg, { Rect, G, Circle, Path, Ellipse } from "react-native-svg";

/**
 * ಕರ್ನಾಟಕ ಬಾವುಟ · Karnataka Flag (React Native version)
 *
 * Mirrors /app/frontend/src/components/KarnatakaFlag.jsx from the web:
 *   • Proper 3:2 aspect ratio, yellow (top) over red (bottom)
 *   • size prop: xs / sm / md / lg / xl
 *   • Optional Ganda-berunda heraldic emblem
 */

const SIZE_MAP = {
  xs: { w: 15, h: 10 },
  sm: { w: 21, h: 14 },
  md: { w: 27, h: 18 },
  lg: { w: 42, h: 28 },
  xl: { w: 60, h: 40 },
};

const YELLOW = "#FFCC00";
const RED = "#E63946";
const BORDER = "rgba(60,25,10,0.35)";
const EMBLEM = "#5B2A0C";

export default function KarnatakaFlag({ size = "md", withGandaBerunda = false, style }) {
  const { w, h } = SIZE_MAP[size] || SIZE_MAP.md;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Karnataka flag · ಕರ್ನಾಟಕ ಬಾವುಟ"
      style={[
        {
          width: w,
          height: h,
          borderRadius: 2,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
        style,
      ]}
    >
      <Svg width={w} height={h} viewBox="0 0 60 40">
        <Rect x={0} y={0} width={60} height={20} fill={YELLOW} />
        <Rect x={0} y={20} width={60} height={20} fill={RED} />
        {withGandaBerunda && <GandaBerunda />}
        <Rect
          x={0.5}
          y={0.5}
          width={59}
          height={39}
          fill="none"
          stroke={BORDER}
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

function GandaBerunda() {
  return (
    <G transform="translate(30 20)">
      {/* Central body */}
      <Ellipse cx={0} cy={1} rx={1.6} ry={4} fill={EMBLEM} />
      {/* Two heads */}
      <Circle cx={-2.8} cy={-4} r={1.6} fill={EMBLEM} />
      <Circle cx={2.8} cy={-4} r={1.6} fill={EMBLEM} />
      {/* Beaks */}
      <Path d="M-4.3 -4 L-5.4 -4.4 L-4.3 -3.4 Z" fill={EMBLEM} />
      <Path d="M4.3 -4 L5.4 -4.4 L4.3 -3.4 Z" fill={EMBLEM} />
      {/* Necks */}
      <Path d="M-1.5 -1 L-2.8 -3.5 L-2.2 -3.5 L-0.4 -1 Z" fill={EMBLEM} />
      <Path d="M1.5 -1 L2.8 -3.5 L2.2 -3.5 L0.4 -1 Z" fill={EMBLEM} />
      {/* Wings */}
      <Path d="M-1.6 0 Q-6 -1 -8 3 Q-5.5 2 -2 2 Z" fill={EMBLEM} />
      <Path d="M1.6 0 Q6 -1 8 3 Q5.5 2 2 2 Z" fill={EMBLEM} />
      {/* Tail feathers */}
      <Path d="M-1.5 4 L0 6.5 L1.5 4 L1 5 L0 5.5 L-1 5 Z" fill={EMBLEM} />
      {/* Legs */}
      <Rect x={-1.3} y={3.5} width={0.6} height={1.5} fill={EMBLEM} />
      <Rect x={0.7} y={3.5} width={0.6} height={1.5} fill={EMBLEM} />
      {/* Crown dots */}
      <Circle cx={-2.8} cy={-5.4} r={0.4} fill={YELLOW} stroke={EMBLEM} strokeWidth={0.3} />
      <Circle cx={2.8} cy={-5.4} r={0.4} fill={YELLOW} stroke={EMBLEM} strokeWidth={0.3} />
    </G>
  );
}

/**
 * "Made in Karnataka" pill — for headers/footers.
 */
export function MadeInKarnatakaBadge({ tone = "light", language = "en", style }) {
  const isDark = tone === "dark";
  const textColor = isDark ? "#FEF7EC" : "#5B2A0C";
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: isDark ? "rgba(254,247,236,0.2)" : "rgba(212,140,66,0.4)",
          backgroundColor: isDark ? "rgba(254,247,236,0.1)" : "#FFFFFF",
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <KarnatakaFlag size="sm" />
      <Text style={{ color: textColor, fontSize: 11, fontWeight: "600" }}>
        {language === "kn" ? "ಕರ್ನಾಟಕದಲ್ಲಿ ನಿರ್ಮಿಸಲಾಗಿದೆ" : "Made in Karnataka"}
      </Text>
    </View>
  );
}
