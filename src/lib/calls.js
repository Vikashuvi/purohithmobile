import { Alert, Linking, Platform } from "react-native";

/**
 * Normalizes phone number into a dialable format (defaults to Indian +91 if 10 digits).
 */
export function sanitizePhoneNumber(phone) {
  if (!phone) return "";
  const digitsOnly = String(phone).replace(/[^0-9+]/g, "");
  if (digitsOnly.startsWith("+")) return digitsOnly;
  if (digitsOnly.length === 10) return `+91${digitsOnly}`;
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) return `+${digitsOnly}`;
  return digitsOnly;
}

/**
 * Formats a phone number for pleasant UI display.
 */
export function formatPhoneDisplay(phone) {
  if (!phone) return "";
  const sanitized = sanitizePhoneNumber(phone);
  if (sanitized.startsWith("+91") && sanitized.length === 13) {
    return `+91 ${sanitized.slice(3, 8)} ${sanitized.slice(8)}`;
  }
  return sanitized;
}

/**
 * Directly dials a phone number using the native dialer (tel: scheme).
 */
export async function makePhoneCall(phoneNumber, name = "Contact") {
  const sanitized = sanitizePhoneNumber(phoneNumber);
  if (!sanitized) {
    Alert.alert("Phone number unavailable", "No phone number is registered for this contact.");
    return false;
  }

  const telUrl = `tel:${sanitized}`;
  try {
    const canOpen = await Linking.canOpenURL(telUrl).catch(() => false);
    if (canOpen || Platform.OS !== "web") {
      await Linking.openURL(telUrl);
      return true;
    }
    // Web / desktop browser fallback
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(telUrl, "_self");
      return true;
    }
  } catch (err) {
    console.warn("Direct phone dialer failed:", err);
  }

  // Fallback if simulator/device doesn't support phone dialer
  Alert.alert(
    `Call ${name}`,
    `Phone number: ${formatPhoneDisplay(sanitized)}\n\n(Direct calling is available on physical mobile devices with phone capabilities.)`,
    [{ text: "OK" }]
  );
  return false;
}

/**
 * Prompts user with options to either place a direct mobile call or use the in-app private call room.
 */
export function promptCallAction({ phoneNumber, name = "Contact", onInAppCall }) {
  const display = formatPhoneDisplay(phoneNumber);

  if (!phoneNumber) {
    if (onInAppCall) {
      onInAppCall();
    } else {
      Alert.alert("Phone call unavailable", "No contact phone number is available for this booking.");
    }
    return;
  }

  const buttons = [
    {
      text: `Call ${display}`,
      onPress: () => makePhoneCall(phoneNumber, name),
    },
  ];

  if (onInAppCall) {
    buttons.push({
      text: "In-App Private Call",
      onPress: onInAppCall,
    });
  }

  buttons.push({
    text: "Cancel",
    style: "cancel",
  });

  Alert.alert(
    `Contact ${name}`,
    `Choose how you would like to connect:`,
    buttons,
    { cancelable: true }
  );
}
