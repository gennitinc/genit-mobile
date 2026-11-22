import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useColors } from '@/lib/theme';

/**
 * Renders an HTML email. A Content-Security-Policy forbids every script in the
 * email itself; only the height measurement below runs (it's injected by the
 * native side, which the policy doesn't govern). Links open in the browser
 * instead of navigating the view.
 */
const MEASURE = `
  (function () {
    function post() { window.ReactNativeWebView.postMessage(String(document.documentElement.scrollHeight)); }
    window.addEventListener('load', post);
    new ResizeObserver(post).observe(document.body);
    post();
  })();
  true;
`;

function documentFor(html: string, text: string, link: string) {
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:">
<style>
  html, body { margin: 0; padding: 0; background: transparent; color: ${text}; font: 15px/1.45 -apple-system, system-ui, Roboto, sans-serif; word-wrap: break-word; }
  a { color: ${link}; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100% !important; }
</style></head><body>${html}</body></html>`;
}

export function EmailBody({ html, width }: { html: string; width: number }) {
  const colors = useColors();
  const [height, setHeight] = useState(60);

  const onMessage = (event: WebViewMessageEvent) => {
    const next = Number(event.nativeEvent.data);
    if (Number.isFinite(next) && next > 0) setHeight(Math.min(next, 4000));
  };

  return (
    <View style={{ width, height }}>
      <WebView
        source={{ html: documentFor(html, colors.text, colors.primary) }}
        originWhitelist={['about:blank']}
        injectedJavaScript={MEASURE}
        onMessage={onMessage}
        scrollEnabled={false}
        style={{ backgroundColor: 'transparent' }}
        // Anything the email tries to load as a page opens outside the app.
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url.startsWith('data:')) return true;
          if (/^https?:/i.test(request.url)) void WebBrowser.openBrowserAsync(request.url);
          return false;
        }}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
      />
    </View>
  );
}
