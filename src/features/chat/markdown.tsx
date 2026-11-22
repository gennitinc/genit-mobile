import * as WebBrowser from 'expo-web-browser';
import { marked, type Token, type Tokens } from 'marked';
import { Fragment, type ReactNode, useMemo } from 'react';
import { Platform, ScrollView, Text, type TextStyle, View } from 'react-native';

import { radius, space, useColors } from '@/lib/theme';

/** Links like "Connect HubSpot" that the web turns into connect buttons. */
const CONNECTION_LABEL = /^(?:re)?connect\b|^authorize\b/i;

export function isConnectionLink(label: string, href?: string) {
  return !!href && CONNECTION_LABEL.test(label.trim()) && /^https?:\/\//.test(href);
}

type Props = {
  children: string;
  /** Smaller, muted text, used for the agent's thought process. */
  muted?: boolean;
  size?: number;
  /** Renders a connect button for a "Connect X" link. Plain links open in the browser. */
  renderConnection?: (label: string, href: string) => ReactNode;
};

function plainText(tokens: Token[] = []): string {
  return tokens
    .map((token) => {
      if ('tokens' in token && token.tokens) return plainText(token.tokens);
      return 'text' in token ? String(token.text) : '';
    })
    .join('');
}

function openLink(href: string) {
  if (/^https?:\/\//.test(href)) WebBrowser.openBrowserAsync(href).catch(() => undefined);
}

/** Markdown as native views: headings, lists, tables, code, quotes and links. */
export function Markdown({ children, muted, size = 15, renderConnection }: Props) {
  const colors = useColors();
  const tokens = useMemo(() => marked.lexer(children ?? '', { gfm: true, breaks: true }), [children]);
  const color = muted ? colors.textMuted : colors.text;
  const base: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.45), color };
  const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

  const inline = (items: Token[] = [], key = 'i'): ReactNode[] =>
    items.map((token, index) => {
      const k = `${key}-${index}`;
      switch (token.type) {
        case 'strong':
          return (
            <Text key={k} style={{ fontWeight: '700' }}>
              {inline((token as Tokens.Strong).tokens, k)}
            </Text>
          );
        case 'em':
          return (
            <Text key={k} style={{ fontStyle: 'italic' }}>
              {inline((token as Tokens.Em).tokens, k)}
            </Text>
          );
        case 'del':
          return (
            <Text key={k} style={{ textDecorationLine: 'line-through' }}>
              {inline((token as Tokens.Del).tokens, k)}
            </Text>
          );
        case 'codespan':
          return (
            <Text key={k} style={{ fontFamily: mono, fontSize: size - 2, backgroundColor: colors.surface }}>
              {(token as Tokens.Codespan).text}
            </Text>
          );
        case 'link': {
          const link = token as Tokens.Link;
          return (
            <Text
              key={k}
              accessibilityRole='link'
              onPress={() => openLink(link.href)}
              style={{ color: colors.primary, textDecorationLine: 'underline' }}
            >
              {inline(link.tokens, k)}
            </Text>
          );
        }
        case 'br':
          return '\n';
        case 'image':
          return (
            <Text key={k} onPress={() => openLink((token as Tokens.Image).href)} style={{ color: colors.primary }}>
              {(token as Tokens.Image).text || 'Image'}
            </Text>
          );
        case 'text': {
          const text = token as Tokens.Text;
          return text.tokens?.length ? <Fragment key={k}>{inline(text.tokens, k)}</Fragment> : decode(text.text);
        }
        case 'escape':
          return (token as Tokens.Escape).text;
        default:
          return 'raw' in token ? decode(String(token.raw)) : null;
      }
    });

  /** Paragraph-level inline tokens, with any connect links lifted out as buttons. */
  const paragraph = (items: Token[] = [], key: string) => {
    const connections = renderConnection
      ? items.filter((token): token is Tokens.Link => token.type === 'link' && isConnectionLink(plainText(token.tokens), token.href))
      : [];
    const rest = items.filter((token) => !connections.includes(token as Tokens.Link));
    const hasText = plainText(rest).trim().length > 0;
    return (
      <View key={key} style={{ gap: space.xs }}>
        {hasText ? (
          <Text selectable style={base}>
            {inline(rest, key)}
          </Text>
        ) : null}
        {connections.map((link, index) => (
          <Fragment key={`${key}-c${index}`}>{renderConnection?.(plainText(link.tokens), link.href)}</Fragment>
        ))}
      </View>
    );
  };

  const block = (items: Token[], key = 'b'): ReactNode[] =>
    items.map((token, index) => {
      const k = `${key}-${index}`;
      switch (token.type) {
        case 'space':
          return null;
        case 'heading': {
          const heading = token as Tokens.Heading;
          const scale = [1.35, 1.2, 1.1, 1, 1, 1][heading.depth - 1] ?? 1;
          return (
            <Text key={k} accessibilityRole='header' selectable style={{ ...base, fontSize: size * scale, lineHeight: size * scale * 1.3, fontWeight: '700', marginTop: space.xs }}>
              {inline(heading.tokens, k)}
            </Text>
          );
        }
        case 'paragraph':
          return paragraph((token as Tokens.Paragraph).tokens, k);
        case 'text': {
          const text = token as Tokens.Text;
          return paragraph(text.tokens ?? [{ type: 'text', raw: text.raw, text: text.text } as Tokens.Text], k);
        }
        case 'list': {
          const list = token as Tokens.List;
          const start = typeof list.start === 'number' ? list.start : 1;
          return (
            <View key={k} style={{ gap: space.xs }}>
              {list.items.map((item, itemIndex) => (
                <View key={`${k}-${itemIndex}`} style={{ flexDirection: 'row', gap: space.sm }}>
                  <Text style={{ ...base, minWidth: 18, color: colors.textMuted }}>
                    {item.task ? (item.checked ? '☑' : '☐') : list.ordered ? `${start + itemIndex}.` : '•'}
                  </Text>
                  <View style={{ flex: 1, gap: space.xs }}>{block(item.tokens, `${k}-${itemIndex}`)}</View>
                </View>
              ))}
            </View>
          );
        }
        case 'code':
          return (
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} key={k} horizontal style={{ borderRadius: radius.sm, backgroundColor: colors.surface }} contentContainerStyle={{ padding: space.md }}>
              <Text selectable style={{ fontFamily: mono, fontSize: size - 2, lineHeight: (size - 2) * 1.45, color: colors.text }}>
                {(token as Tokens.Code).text}
              </Text>
            </ScrollView>
          );
        case 'blockquote':
          return (
            <View key={k} style={{ borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: space.md, gap: space.xs }}>
              {block((token as Tokens.Blockquote).tokens, k)}
            </View>
          );
        case 'hr':
          return <View key={k} style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />;
        case 'table': {
          const table = token as Tokens.Table;
          const cell = (content: Tokens.TableCell, header: boolean, cellKey: string) => (
            <View key={cellKey} style={{ width: 150, padding: space.sm, borderRightWidth: 1, borderColor: colors.border }}>
              <Text selectable style={{ ...base, fontSize: size - 1, fontWeight: header ? '700' : '400' }}>
                {inline(content.tokens, cellKey)}
              </Text>
            </View>
          );
          return (
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} key={k} horizontal style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }}>
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: colors.surface }}>
                  {table.header.map((content, column) => cell(content, true, `${k}-h${column}`))}
                </View>
                {table.rows.map((row, rowIndex) => (
                  <View key={`${k}-r${rowIndex}`} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border }}>
                    {row.map((content, column) => cell(content, false, `${k}-r${rowIndex}-${column}`))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }
        case 'html':
          return (
            <Text key={k} selectable style={base}>
              {decode((token as Tokens.HTML).text.replace(/<[^>]+>/g, ''))}
            </Text>
          );
        default:
          return 'raw' in token && String(token.raw).trim() ? (
            <Text key={k} selectable style={base}>
              {decode(String(token.raw))}
            </Text>
          ) : null;
      }
    });

  return <View style={{ gap: space.sm }}>{block(tokens)}</View>;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function decode(text: string) {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (match) => ENTITIES[match] ?? match);
}
