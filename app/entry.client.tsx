import {HydratedRouter} from 'react-router/dom';
import {startTransition} from 'react';
import {hydrateRoot} from 'react-dom/client';

if (!window.location.origin.includes('webcache.googleusercontent.com')) {
  startTransition(() => {
    hydrateRoot(document, <HydratedRouter />);
  });
}
