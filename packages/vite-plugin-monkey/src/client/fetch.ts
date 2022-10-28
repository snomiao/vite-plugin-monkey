import { monkeyWindow } from './window';

const xmlhttpRequest = /* @__PURE__ */ (() => {
  return monkeyWindow.GM_xmlhttpRequest ?? monkeyWindow.GM.xmlHttpRequest;
})();

const fixUrl = (url = '') => {
  try {
    return url === '' && location.href ? location.href : url;
  } catch {
    return url;
  }
};

const delay = async (n = 0) =>
  new Promise((res) => {
    setTimeout(res, n);
  });

const parseHeaders = (rawHeaders = '') => {
  const headers = new Headers();
  // Replace instances of \r\n and \n followed by at least one space or horizontal tab with a space
  // https://tools.ietf.org/html/rfc7230#section-3.2
  const preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ');
  // Avoiding split via regex to work around a common IE11 bug with the core-js 3.6.0 regex polyfill
  // https://github.com/github/fetch/issues/748
  // https://github.com/zloirock/core-js/issues/751
  preProcessedHeaders
    .split('\r')
    .map(function (header) {
      return header.startsWith(`\n`) ? header.substring(1) : header;
    })
    .forEach(function (line) {
      let parts = line.split(':');
      let key = parts.shift()?.trim();
      if (key) {
        let value = parts.join(':').trim();
        headers.append(key, value);
      }
    });
  return headers;
};

/**
 * polyfill window.fetch by GM_xmlhttpRequest
 */
export const GM_fetch: typeof window.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.signal && request.signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  let data = await request.text();
  let binary = true;
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return new Promise<Response>((resolve, reject) => {
    const handle = xmlhttpRequest({
      method: request.method.toUpperCase() as 'GET' | 'POST' | 'HEAD',
      url: fixUrl(request.url),
      headers,
      data,
      binary,
      responseType: 'blob',
      async onload(response) {
        await delay();
        const resp = new Response(response.response ?? response.responseText, {
          status: response.status,
          statusText: response.statusText,
          headers: parseHeaders(response.responseHeaders),
        });
        Object.defineProperty(resp, 'url', { value: response.finalUrl });
        resolve(resp);
      },
      async onerror() {
        await delay();
        reject(new TypeError('Network request failed'));
      },
      async ontimeout() {
        await delay();
        reject(new TypeError('Network request failed'));
      },
      async onabort() {
        await delay();
        reject(new DOMException('Aborted', 'AbortError'));
      },
      async onreadystatechange(response) {
        if (response.readyState === 4) {
          request.signal?.removeEventListener('abort', abortXhr);
        }
      },
    });
    function abortXhr() {
      handle.abort();
    }
    request.signal?.addEventListener('abort', abortXhr);
  });
};
