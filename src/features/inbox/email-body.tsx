import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/**
 * Renders an HTML email the way the web inbox does: on a white page with the
 * email's own styles, quoted replies collapsed behind "Show quoted text", and
 * links opening outside the view. A Content-Security-Policy forbids every
 * script in the email itself; only the script below runs (it's injected by the
 * native side, which the policy doesn't govern).
 */
const PREPARE = `
  (function () {
    function post() {
      window.ReactNativeWebView.postMessage(String(Math.ceil(document.body.getBoundingClientRect().height)));
    }
    function collapse(nodes) {
      var first = nodes[0];
      if (!first || !first.parentNode || first.closest('details[data-email-quote]')) return;
      var details = document.createElement('details');
      details.setAttribute('data-email-quote', '');
      var summary = document.createElement('summary');
      summary.textContent = 'Show quoted text';
      first.parentNode.insertBefore(details, first);
      details.appendChild(summary);
      nodes.forEach(function (node) { details.appendChild(node); });
      details.addEventListener('toggle', post);
    }
    var quoteSelector = '.gmail_quote, blockquote[type="cite"]';
    Array.prototype.slice.call(document.querySelectorAll(quoteSelector))
      .filter(function (quote) { return !(quote.parentElement && quote.parentElement.closest(quoteSelector)); })
      .forEach(function (quote) { collapse([quote]); });
    var outlook = document.querySelector('#divRplyFwdMsg, .OutlookMessageHeader');
    var start = outlook && outlook.previousElementSibling && outlook.previousElementSibling.matches('hr') ? outlook.previousElementSibling : outlook;
    if (start && start.parentElement) {
      var siblings = Array.prototype.slice.call(start.parentElement.children);
      collapse(siblings.slice(siblings.indexOf(start)));
    }
    Array.prototype.forEach.call(document.querySelectorAll('a'), function (link) {
      if (!/^(https?:|mailto:|tel:)/i.test(link.getAttribute('href') || '')) link.removeAttribute('href');
    });
    Array.prototype.forEach.call(document.images, function (image) {
      image.addEventListener('load', post);
      image.addEventListener('error', post);
    });
    window.addEventListener('load', post);
    new ResizeObserver(post).observe(document.body);
    post();
  })();
  true;
`;

/** Script tags would be blocked by the policy anyway; dropping them keeps the document tidy. */
function withoutScripts(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

function documentFor(html: string) {
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline' https:; font-src https: data:">
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; color: #18181b; font: 15px/1.45 -apple-system, system-ui, Roboto, sans-serif; overflow-wrap: anywhere; }
  body { padding: 8px 4px; }
  a { color: #4f46e5; }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  pre { white-space: pre-wrap; }
  details[data-email-quote] { margin-top: 12px; padding-top: 8px; border-top: 1px solid #e4e4e7; color: #52525b; font-size: 13px; }
  details[data-email-quote] > summary { cursor: pointer; font-weight: 600; list-style: none; }
</style></head><body>${withoutScripts(html)}</body></html>`;
}

const MAX_HEIGHT = 20_000;

export function EmailBody({ html, width }: { html: string; width: number }) {
  const [height, setHeight] = useState(80);

  const onMessage = (event: WebViewMessageEvent) => {
    const next = Number(event.nativeEvent.data);
    if (Number.isFinite(next) && next > 0) setHeight(Math.min(next + 16, MAX_HEIGHT));
  };

  return (
    <View style={{ width, height }}>
      <WebView
        source={{ html: documentFor(html) }}
        originWhitelist={['about:blank']}
        injectedJavaScript={PREPARE}
        onMessage={onMessage}
        scrollEnabled={false}
        style={{ backgroundColor: '#FFFFFF' }}
        // Anything the email tries to load as a page opens outside the app.
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url.startsWith('data:')) return true;
          if (/^https?:/i.test(request.url)) void WebBrowser.openBrowserAsync(request.url);
          else if (/^(mailto|tel):/i.test(request.url)) void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
      />
    </View>
  );
}
