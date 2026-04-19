export { URL_STATE_VERSION } from './url-state/contract.js';
export {
  buildUrlStateSnapshot,
  encodeUrlState,
  getActiveAppTabId
} from './url-state/snapshot.js';
export { hydrateUrlState } from './url-state/hydrate.js';
import { URL_STATE_PARAM_NAMES } from './url-state/contract.js';
import { encodeUrlState, getActiveAppTabId } from './url-state/snapshot.js';

export function buildShareableUrl({
  activeTab = getActiveAppTabId()
} = {}) {
  const location = globalThis.location;
  const params = new URLSearchParams(location?.search || '');
  URL_STATE_PARAM_NAMES.forEach((key) => params.delete(key));
  encodeUrlState({ activeTab }).forEach((value, key) => {
    params.set(key, value);
  });
  const search = params.toString();
  const baseUrl = location
    ? `${location.origin || ''}${location.pathname || ''}`
    : '';
  return search ? `${baseUrl}?${search}` : baseUrl;
}

export async function copyShareableUrl({
  activeTab = getActiveAppTabId()
} = {}) {
  const url = buildShareableUrl({ activeTab });
  if (!url) {
    return { copied: false, url };
  }

  if (!globalThis.navigator?.clipboard?.writeText) {
    return { copied: false, url };
  }

  await globalThis.navigator.clipboard.writeText(url);
  return { copied: true, url };
}

export function syncUrlState({
  activeTab = getActiveAppTabId(),
  historyMode = 'replace'
} = {}) {
  const location = globalThis.location;
  const params = new URLSearchParams(location?.search || '');
  URL_STATE_PARAM_NAMES.forEach((key) => params.delete(key));
  encodeUrlState({ activeTab }).forEach((value, key) => {
    params.set(key, value);
  });
  const search = params.toString();
  const pathname = location?.pathname || '';
  const nextUrl = search ? `${pathname}?${search}` : pathname;

  if (globalThis.history?.replaceState) {
    if (historyMode === 'push' && globalThis.history.pushState) {
      globalThis.history.pushState(null, '', nextUrl);
    } else {
      globalThis.history.replaceState(null, '', nextUrl);
    }
  }

  return nextUrl;
}
