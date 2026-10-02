/* One frontend for the live server and the exported GitHub Pages snapshot. */
'use strict';
window.ROBOT_SITE = (() => {
  const script = document.currentScript;
  const base = new URL('./', script.src);
  const isStatic = script.dataset.static === 'true';
  const endpoints = {
    '/api/studies': 'data/studies.json',
    '/api/journal-version': 'data/journal-version.json',
    '/api/video_index': 'data/video-index.json',
  };
  function url(value) {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return value;
    if (value.startsWith('#')) return new URL(value, location.href).href;
    const target = new URL(value.replace(/^\//, ''), base);
    if (!isStatic) return target.href;
    let path = target.pathname.slice(base.pathname.length);
    if (endpoints['/' + path]) path = endpoints['/' + path];
    else if (['libero', 'libero/', 'index.html', 'studies/libero', 'studies/libero/'].includes(path)) path = 'libero/';
    else if (/^studies\/[^/]+\/?$/.test(path)) path = path.replace(/\/?$/, '/');
    // The psi-docs workflow excludes every file named README.md.
    path = path.replace(/(^|\/)README\.md$/, '$1readme.md');
    return new URL(path + target.search + target.hash, base).href;
  }
  function rewrite(root) {
    for (const el of root.querySelectorAll('[href], [src], [poster], [data-curve-url]')) {
      for (const attr of ['href', 'src', 'poster', 'data-curve-url']) {
        const value = el.getAttribute(attr);
        if (value?.startsWith('/') && !value.startsWith('//')) el.setAttribute(attr, url(value));
      }
    }
  }
  function mapData(value) {
    if (Array.isArray(value)) return value.map(mapData);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,mapData(v)]));
    return typeof value === 'string' && /^\/(?:assets|video)\//.test(value) ? url(value) : value;
  }
  function path() {
    const pathname = location.pathname;
    return pathname.startsWith(base.pathname) ? '/' + pathname.slice(base.pathname.length) : pathname;
  }
  return {url, rewrite, mapData, path, isStatic};
})();
