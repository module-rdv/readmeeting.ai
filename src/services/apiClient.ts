import { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';

function getApiScope(): string {
  const scope = import.meta.env.VITE_READMEETING_API_SCOPE?.trim();
  if (!scope) {
    throw new Error('VITE_READMEETING_API_SCOPE must identify an exposed ReadMeeting API scope.');
  }
  return scope;
}

function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
    || import.meta.env.VITE_READMEETING_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error('VITE_API_BASE_URL must point to the ReadMeeting API.');
  }
  const parsed = new URL(baseUrl);
  const localHttp = parsed.protocol === 'http:'
    && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('The ReadMeeting API must use HTTPS except on localhost.');
  }
  return parsed.origin;
}

export async function fetchReadMeetingApi(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const tokenResult = await msal.acquireTokenSilent({
    account,
    scopes: [getApiScope()],
  });
  const baseUrl = getApiBaseUrl();
  const url = new URL(path.replace(/^\/+/, ''), `${baseUrl}/`);
  if (url.origin !== baseUrl) {
    throw new Error('ReadMeeting API paths must remain on the configured API origin.');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${tokenResult.accessToken}`);

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 30_000);
  const requestSignal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;
  const method = (init.method ?? 'GET').toUpperCase();
  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: requestSignal,
    });
  } catch (error) {
    if (timeoutController.signal.aborted && !init.signal?.aborted) {
      throw new Error(`La requête ${method} ${url.href} vers l’API ReadMeeting a dépassé le délai de 30 secondes.`);
    }
    if (error instanceof TypeError) {
      throw new Error(`Impossible de joindre ${method} ${url.href}. Vérifiez que le backend est démarré, que TLS est valide et que CORS autorise l’origine du frontend.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
