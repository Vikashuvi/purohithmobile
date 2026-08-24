import { usePreferences } from "./preferences";

const en = {
  appName: "Purohith Connect", tagline: "Trusted home poojas",
  chooseRole: "Who are you?", roleCustomer: "I book poojas", roleCustomerSub: "Book a priest for your home",
  rolePriest: "I am a priest", rolePriestSub: "Offer services and earn",
  enterPhone: "Phone number", sendOtp: "Send OTP", enterOtp: "Enter OTP", verifyOtp: "Verify",
  name: "Name", loggingIn: "Signing in…", biometricUnlock: "Sign in with biometrics", biometricPrompt: "Confirm your identity",
  tabHome: "Home", tabBookings: "Bookings", tabPriests: "Priests", tabProfile: "Profile", tabDashboard: "Dashboard", tabAvailability: "Availability",
  addOns: "Add-ons (optional)", total: "Total", includingGst: "Includes 18% GST", payNow: "Confirm and pay",
  reschedule: "Reschedule", cancelBooking: "Cancel", invoice: "Invoice", raiseDispute: "Raise dispute", reviewCta: "Review",
  submit: "Submit", close: "Close", keep: "Keep booking", confirmCancel: "Confirm cancellation",
  refundPolicy: "Refund policy: over 48h = 100%, 24–48h = 50%, under 24h = 0%",
  pendingRequests: "Pending requests", upcoming: "Upcoming", todaysEarnings: "Today's earnings", accept: "Accept", reject: "Reject", complete: "Mark complete",
  loading: "Loading…", retry: "Retry", logout: "Log out", bookNow: "Book now", noResults: "No results", cameSoon: "Coming soon",
};

const kn = {
  appName: "ಪುರೋಹಿತ್ ಕನೆಕ್ಟ್", tagline: "ಶ್ರದ್ಧೆಯುತ ಮನೆ ಪೂಜೆಗಳು",
  chooseRole: "ನೀವು ಯಾರು?", roleCustomer: "ನಾನು ಪೂಜೆ ಬುಕ್ ಮಾಡುತ್ತೇನೆ", roleCustomerSub: "ನಿಮ್ಮ ಮನೆಗೆ ಪುರೋಹಿತರನ್ನು ಬುಕ್ ಮಾಡಿ",
  rolePriest: "ನಾನು ಪುರೋಹಿತ", rolePriestSub: "ಸೇವೆ ಸಲ್ಲಿಸಿ ಮತ್ತು ಸಂಪಾದಿಸಿ",
  enterPhone: "ಫೋನ್ ಸಂಖ್ಯೆ", sendOtp: "OTP ಕಳುಹಿಸಿ", enterOtp: "OTP ನಮೂದಿಸಿ", verifyOtp: "ಪರಿಶೀಲಿಸಿ",
  name: "ಹೆಸರು", loggingIn: "ಸೈನ್ ಇನ್ ಆಗುತ್ತಿದೆ…", biometricUnlock: "ಬಯೋಮೆಟ್ರಿಕ್ ಮೂಲಕ ಸೈನ್ ಇನ್", biometricPrompt: "ನಿಮ್ಮ ಗುರುತನ್ನು ದೃಢಪಡಿಸಿ",
  tabHome: "ಮುಖಪುಟ", tabBookings: "ಬುಕಿಂಗ್‌ಗಳು", tabPriests: "ಪುರೋಹಿತರು", tabProfile: "ಪ್ರೊಫೈಲ್", tabDashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", tabAvailability: "ಲಭ್ಯತೆ",
  addOns: "ಹೆಚ್ಚುವರಿ ಸೇವೆಗಳು", total: "ಒಟ್ಟು", includingGst: "18% GST ಒಳಗೊಂಡಿದೆ", payNow: "ದೃಢೀಕರಿಸಿ ಮತ್ತು ಪಾವತಿಸಿ",
  reschedule: "ಮರುಹೊಂದಿಸಿ", cancelBooking: "ರದ್ದುಮಾಡಿ", invoice: "ಇನ್‌ವಾಯ್ಸ್", raiseDispute: "ದೂರು ದಾಖಲಿಸಿ", reviewCta: "ವಿಮರ್ಶೆ",
  submit: "ಸಲ್ಲಿಸಿ", close: "ಮುಚ್ಚಿ", keep: "ಬುಕಿಂಗ್ ಉಳಿಸಿ", confirmCancel: "ರದ್ದತಿ ದೃಢೀಕರಿಸಿ",
  refundPolicy: "ಮರುಪಾವತಿ ನೀತಿ: 48 ಗಂಟೆಗೂ ಹೆಚ್ಚು = 100%, 24–48 ಗಂಟೆ = 50%, 24 ಗಂಟೆಯೊಳಗೆ = 0%",
  pendingRequests: "ಬಾಕಿ ವಿನಂತಿಗಳು", upcoming: "ಮುಂಬರುವ", todaysEarnings: "ಇಂದಿನ ಸಂಪಾದನೆ", accept: "ಸ್ವೀಕರಿಸಿ", reject: "ನಿರಾಕರಿಸಿ", complete: "ಪೂರ್ಣಗೊಳಿಸಿ",
  loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…", retry: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", logout: "ಲಾಗ್ ಔಟ್", bookNow: "ಈಗ ಬುಕ್ ಮಾಡಿ", noResults: "ಫಲಿತಾಂಶಗಳಿಲ್ಲ", cameSoon: "ಶೀಘ್ರದಲ್ಲೇ",
};

export const t = en;
export function useI18n() {
  const { language } = usePreferences();
  return { t: language === "kn" ? kn : en, language };
}
