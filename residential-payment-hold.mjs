import { assignmentServiceScope } from "./assignment-service-scope.mjs";

export function paymentHoldMessage(item) {
  if (item.residential_payment_state === "paid") return "";
  if (!item.residential_payment_state && assignmentServiceScope(item) !== "residential") return "";
  return item.residential_payment_state === "action_required"
    ? "Payment hold: the customer must resolve their payment. Do not start cleaning."
    : "Awaiting customer payment. Do not start cleaning until payment is confirmed.";
}
