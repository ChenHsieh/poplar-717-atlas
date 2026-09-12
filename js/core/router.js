// Hash router. Hash (not history API) so it works on GitHub Pages under a project subpath
// with no server rewrite rules.
const routes = [];
export function route(pattern, handler) { routes.push({ pattern, handler }); }

export function navigate(path) {
  if (location.hash.slice(1) === path) render();
  else location.hash = path;
}

/** The `?a=b&c=d` part of the current hash, as a plain object. Empty when there is none.
 *  Routes match against the path only (see render), so a view that wants query state asks
 *  for it here rather than parsing its own arguments. */
export function query() {
  const raw = location.hash.slice(1);
  const i = raw.indexOf('?');
  if (i < 0) return {};
  const out = {};
  for (const [k, v] of new URLSearchParams(raw.slice(i + 1))) out[k] = v;
  return out;
}

/** Rewrite the query part WITHOUT navigating. Setting location.hash would fire hashchange,
 *  re-run the route and rebuild the view from scratch, throwing away the very state we are
 *  trying to record. replaceState leaves the URL shareable and the view untouched. */
export function setQuery(params) {
  const raw = location.hash.slice(1);
  const path = raw.split('?')[0] || '/';
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  history.replaceState(null, '', '#' + path + (qs ? '?' + qs : ''));
}

export function render() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  for (const { pattern, handler } of routes) {
    const m = pattern.exec(path);
    if (m) return handler(...m.slice(1));
  }
  const el = document.getElementById('view');
  el.innerHTML = `<div class="empty"><h2>Not found</h2><p class="mono">${path}</p></div>`;
}

export function start() {
  addEventListener('hashchange', render);
  render();
}
