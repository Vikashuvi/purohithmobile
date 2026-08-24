import { Platform } from "react-native";

export const isWeb = Platform.OS === "web";
export const webMaxWidth = 1180;
export const webContentWidth = isWeb ? { width: "100%", maxWidth: webMaxWidth, alignSelf: "center" } : {};
export const webPagePadding = isWeb ? { paddingHorizontal: 32 } : {};
