import {NonRetriableError} from 'inngest';
import {
  assertFulfillmentConfiguration,
  cancelPrintfulOrder,
  createOrFindPrintfulOrder,
  isRetriableFulfillmentError,
} from '~/lib/fulfillment.server';
import {
  claimFulfillment,
  getOrderById,
  getOrderItems,
  markFulfillmentFailed,
  markPrintfulCreated,
} from '~/lib/orders.server';
import {retrieveCheckoutSession} from '~/lib/stripe.server';
import {getInngestClient} from './client.server';

const inngest = getInngestClient();

export const fulfillOrder = inngest.createFunction(
  {
    id: 'fulfill-paid-order',
    retries: 5,
    concurrency: {limit: 5},
    triggers: {event: 'orders/fulfillment.requested'},
    onFailure: async ({event, error}: {event: any; error: Error}) => {
      const orderId = event.data?.event?.data?.orderId;
      if (orderId) await markFulfillmentFailed(orderId, error, process.env);
    },
  },
  async ({event, runId, step}) => {
    try {
      assertFulfillmentConfiguration(process.env);
    } catch (error) {
      throw new NonRetriableError(
        error instanceof Error ? error.message : 'Fulfillment is disabled',
      );
    }
    const {orderId, sessionId} = event.data as {
      orderId: string;
      sessionId: string;
    };
    const claimed = await step.run('claim-order', () =>
      claimFulfillment(orderId, runId, process.env),
    );
    if (!claimed) return {status: 'already-claimed'};

    const printful = await step.run('create-printful-order', async () => {
      try {
        const [order, items, session] = await Promise.all([
          getOrderById(orderId, process.env),
          getOrderItems(orderId, process.env),
          retrieveCheckoutSession(sessionId, process.env),
        ]);
        if (!order || order.stripeSessionId !== session.id) {
          throw new NonRetriableError(
            'Fulfillment order does not match the Stripe session',
          );
        }
        if (order.paymentStatus !== 'paid' || session.payment_status !== 'paid') {
          throw new NonRetriableError('Fulfillment requires a paid Stripe session');
        }
        return createOrFindPrintfulOrder({
          env: process.env,
          items,
          order,
          session,
        });
      } catch (error) {
        if (!isRetriableFulfillmentError(error)) {
          throw new NonRetriableError(
            error instanceof Error ? error.message : 'Permanent fulfillment error',
          );
        }
        throw error;
      }
    });
    const recorded = await step.run('record-printful-draft', () =>
      markPrintfulCreated(
        orderId,
        printful.id,
        printful.confirmed,
        process.env,
      ),
    );
    if (!recorded) {
      await step.run('cancel-ineligible-printful-draft', () =>
        cancelPrintfulOrder(printful.id, process.env),
      );
      return {status: 'cancelled_after_payment_change'};
    }
    return {status: printful.confirmed ? 'confirmed' : 'draft_created'};
  },
);

export const inngestFunctions = [fulfillOrder];
