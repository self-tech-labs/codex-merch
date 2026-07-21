import type {Route} from './+types/api.readiness';
import {createReadinessLoader} from '~/lib/readiness-route.server';

export const loader = createReadinessLoader() satisfies (
  args: Route.LoaderArgs,
) => Promise<Response>;
