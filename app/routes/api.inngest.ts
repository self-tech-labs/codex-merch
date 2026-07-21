import {serve} from 'inngest/remix';
import {getInngestClient} from '~/inngest/client.server';
import {inngestFunctions} from '~/inngest/fulfill-order.server';

const handler = serve({
  client: getInngestClient(),
  functions: inngestFunctions,
});

export const config = {maxDuration: 300};

export {handler as action, handler as loader};
