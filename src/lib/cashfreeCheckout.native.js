import { NativeModules, Linking } from "react-native";

export async function openCashfreeCheckout(order) {
  if (!order?.payment_session_id || !order?.order_id) {
    throw new Error("Cashfree did not return a valid payment session.");
  }

  if (!NativeModules.CashfreePgApi && !NativeModules.CashfreeEventEmitter) {
    // Native Cashfree SDK is not compiled into standard Expo Go
    if (order.payment_url) {
      await Linking.openURL(order.payment_url);
      return { orderId: order.order_id };
    }
    throw new Error(
      "Cashfree native SDK is not bundled into Expo Go. Use Web or a custom EAS development build to test native payments."
    );
  }

  const { CFEnvironment, CFSession } = require("cashfree-pg-api-contract");
  const { CFPaymentGatewayService } = require("react-native-cashfree-pg-sdk");

  const environment = order.environment === "production" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
  const session = new CFSession(order.payment_session_id, order.order_id, environment);

  return new Promise((resolve, reject) => {
    const cleanup = () => CFPaymentGatewayService.removeCallback();
    CFPaymentGatewayService.setCallback({
      onVerify: (orderId) => {
        cleanup();
        resolve({ orderId });
      },
      onError: (error) => {
        cleanup();
        reject(new Error(error?.getMessage?.() || "Cashfree checkout was not completed."));
      },
    });
    CFPaymentGatewayService.doWebPayment(session);
  });
}
