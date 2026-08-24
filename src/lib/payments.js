import { Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

export const PUROHITH_UPI_ID = "sgmsfreshmindsservicesllp.8050934625.ibz@icici";
export const PUROHITH_PAYEE_NAME = "SGMS Freshminds Services LLP";

async function invokePaymentWorkflow(body) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("payment-workflow", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || {};
}

export async function createCeremonyRequest(payload) {
  return invokePaymentWorkflow({ action: "create_request", ...payload });
}

export async function submitPaymentScreenshot(payload) {
  return invokePaymentWorkflow({ action: "submit_payment", ...payload });
}

export async function listRequestProposals(requestId) {
  return invokePaymentWorkflow({ action: "list_proposals", request_id: requestId });
}

export async function selectProposal(requestId, proposalId) {
  return invokePaymentWorkflow({ action: "award_proposal", request_id: requestId, proposal_id: proposalId });
}

export async function listProviderRequests(userId) {
  return invokePaymentWorkflow({ action: "provider_requests", user_id: userId });
}

export async function sendProviderProposal(payload) {
  return invokePaymentWorkflow({ action: "send_proposal", ...payload });
}

export async function createDirectBookingPayment(payload) {
  return invokePaymentWorkflow({ action: "direct_booking_payment", ...payload });
}

export async function openUpiPayment({ amountInr, note = "Purohith Connect booking" } = {}) {
  const params = new URLSearchParams({
    pa: PUROHITH_UPI_ID,
    pn: PUROHITH_PAYEE_NAME,
    tn: note,
    cu: "INR",
  });
  if (amountInr) params.set("am", String(Number(amountInr)));
  const url = `upi://pay?${params.toString()}`;
  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (!supported && Platform.OS !== "web") throw new Error("No UPI app was found on this device.");
  await Linking.openURL(url);
  return true;
}

export async function pickPaymentScreenshot() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Photo permission is required to upload the UPI payment screenshot.");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: 0.78,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.base64) throw new Error("Could not read the selected screenshot.");
  const mimeType = asset.mimeType || "image/jpeg";
  return {
    name: asset.fileName || "payment-screenshot.jpg",
    uri: asset.uri,
    dataUrl: `data:${mimeType};base64,${asset.base64}`,
  };
}

export function downloadInvoice(invoiceHtml, invoiceNumber = "purohith-connect-invoice") {
  if (!invoiceHtml) return false;
  if (Platform.OS !== "web") return false;
  const blob = new Blob([invoiceHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoiceNumber}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
