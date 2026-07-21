import {NonRetriableError} from 'inngest';
import {
  assertFulfillmentConfiguration,
  confirmPrintfulOrder,
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
    await step.run('record-printful-draft', () =>
      markPrintfulCreated(
        orderId,
        printful.id,
        printful.confirmed,
        process.env,
      ),
    );
    if (printful.confirmed || process.env.PRINTFUL_AUTO_CONFIRM !== 'true') {
      return {status: printful.confirmed ? 'confirmed' : 'draft_created'};
    }

    await step.run('confirm-printful-order', async () => {
      const order = await getOrderById(orderId, process.env);
      if (!order || order.providerOrderId !== printful.id) {
        throw new NonRetriableError(
          'Local order does not match the Printful draft before confirmation',
        );
      }
      try {
        return await confirmPrintfulOrder(printful.id, process.env);
      } catch (error) {
        if (!isRetriableFulfillmentError(error)) {
          throw new NonRetriableError(
            error instanceof Error ? error.message : 'Permanent confirmation error',
          );
        }
        throw error;
      }
    });
    await step.run('record-printful-confirmation', () =>
      markPrintfulCreated(orderId, printful.id, true, process.env),
    );
    return {status: 'confirmed'};
  },
);

export const inngestFunctions = [fulfillOrder];
