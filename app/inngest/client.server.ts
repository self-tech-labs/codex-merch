import {Inngest} from 'inngest';

const clients = new Map<string, Inngest>();

export function getInngestClient(env: AppEnv = process.env) {
  const key = env.INNGEST_EVENT_KEY || 'local';
  let client = clients.get(key);
  if (!client) {
    client = new Inngest({
      id: 'codex-merch',
      eventKey: env.INNGEST_EVENT_KEY,
      isDev: env.NODE_ENV !== 'production',
    });
    clients.set(key, client);
  }
  return client;
}

export async function enqueueFulfillment(
  data: {orderId: string; sessionId: string},
  env: AppEnv,
  attempt = 0,
) {
  return getInngestClient(env).send({
    id: `fulfill-${data.orderId}-${attempt}`,
    name: 'orders/fulfillment.requested',
    data,
  });
}
