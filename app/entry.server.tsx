import {randomUUID} from 'node:crypto';
import {handleRequest} from '@vercel/react-router/entry.server';
import type {AppLoadContext, EntryContext} from 'react-router';
import {applySecurityHeaders} from '~/lib/security.server';

export default async function entryServer(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext?: AppLoadContext,
) {
  const nonce = randomUUID();
  const requestId = randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Request-Id', requestId);
  const tracedRequest = new Request(request, {headers: requestHeaders});
  const response = await handleRequest(
    tracedRequest,
    responseStatusCode,
    responseHeaders,
    routerContext,
    loadContext,
    {nonce},
  );
  applySecurityHeaders(response.headers, nonce, process.env.NODE_ENV === 'production');
  response.headers.set('X-Request-Id', requestId);
  return response;
}
