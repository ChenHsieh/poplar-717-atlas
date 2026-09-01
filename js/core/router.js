// Hash router. Hash (not history API) so it works on GitHub Pages under a project subpath
// with no server rewrite rules.
const routes = [];
export function route(pattern, handler) { routes.push({ pattern, handler }); }

export function navigate(path) {
  if (location.hash.slice(1) === path) render();
  else location.hash = path;
}

export function render() {
  const path = location.hash.slice(1) || '/';
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
