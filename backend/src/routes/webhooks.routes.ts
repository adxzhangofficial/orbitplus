import { Router, raw } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { applyStripeEvent, verifyWebhook } from "../services/stripe.service.js";

export const webhooksRouter = Router();

/**
 * Stripe webhook.
 *
 * Mounted with a raw body parser and registered before express.json, because
 * signature verification runs over the exact bytes Stripe signed; parsing and
 * reserializing would change them and every signature would fail.
 *
 * Unauthenticated by design. The signature is the authentication, which is why
 * an unverifiable payload is rejected before it reaches any handler.
 */
webhooksRouter.post(
  "/stripe",
  raw({ type: "application/json", limit: "1mb" }),
  asyncHandler(async (request, response) => {
    const event = verifyWebhook(request.body as Buffer, request.header("stripe-signature"));
    const result = await applyStripeEvent(event);
    // Always 200 once the signature is valid. A non-2xx makes Stripe retry, and
    // an event we deliberately ignore or have already applied is not a failure.
    response.json({ received: true, ...result });
  }),
);
