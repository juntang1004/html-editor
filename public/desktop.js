// Native privileges remain in the bundled top-level editor, never imported slide frames.
(() => {
  if (window !== window.top || !window.__TAURI__?.core?.invoke) return;
  const invoke = window.__TAURI__.core.invoke;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init);
    const request = input instanceof Request ? input : null;
    const result = await invoke('api_request', {path:url.pathname, method:init.method || request?.method || 'GET', body:init.body ?? (request && request.method !== 'GET' ? await request.text() : '')});
    return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}});
  };
  window.studioDesktop = Object.freeze({
    open: () => invoke('open_document'),
    resetDocument: () => invoke('reset_document_paths'),
    acceptDocument: path => invoke('accept_document',{path}),
    save: options => invoke('save_document',{options}),
    print: options => invoke('print_document',{html:options?.html || ''}),
    platform:'windows'
  });
})();
