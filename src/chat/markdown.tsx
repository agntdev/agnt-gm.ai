// Markdown-lite for chat bubbles. The assistant and build logs emit a small,
// predictable subset — **bold**, `inline code`, [links](…), bare URLs, and
// "- " bullet lists — so it's rendered by hand: the mini-app stays at two
// dependencies and skips a full remark pipeline for four inline tokens.
// Everything is emitted as React text nodes, so untrusted content stays inert.
import React from 'react';
import { Theme } from '../theme';

// One alternation per inline token; anything unmatched falls through as text.
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+)/g;
const MD_LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/;

// Only ever link to http(s) — a model-emitted javascript: URL must render as text.
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : null);

function Link({ T, href, label }: { T: Theme; href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, fontWeight: 600 }}>
      {label}
    </a>
  );
}

function renderInline(text: string, T: Theme): React.ReactNode {
  const parts = text.split(INLINE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 0) return part; // plain text between tokens
    if (part.startsWith('**')) return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) {
      return (
        <code key={i} style={{
          fontFamily: T.mono, fontSize: '0.88em', background: T.nestedBg,
          padding: '1px 5px', borderRadius: 5,
        }}>{part.slice(1, -1)}</code>
      );
    }
    const link = MD_LINK.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      return href ? <Link key={i} T={T} href={href} label={link[1]} /> : <span key={i}>{link[1]}</span>;
    }
    const bare = safeHref(part);
    return bare ? <Link key={i} T={T} href={bare} label={part} /> : part;
  });
}

// Block pass: consecutive "- " / "• " / "* " lines become a bullet list;
// everything else keeps the bubble's pre-line behavior.
export function ChatMarkdown({ T, text }: { T: Theme; text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let plain: string[] = [];

  const flushPlain = () => {
    if (!plain.length) return;
    blocks.push(<span key={blocks.length} style={{ whiteSpace: 'pre-line' }}>{renderInline(plain.join('\n'), T)}</span>);
    plain = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <span key={blocks.length} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 0' }}>
        {bullets.map((b, i) => (
          <span key={i} style={{ display: 'flex', gap: 7 }}>
            <span style={{ flexShrink: 0 }}>•</span>
            <span>{renderInline(b, T)}</span>
          </span>
        ))}
      </span>,
    );
    bullets = [];
  };

  for (const line of lines) {
    const m = /^\s*(?:[-•*])\s+(.*)$/.exec(line);
    if (m) { flushPlain(); bullets.push(m[1]); } else { flushBullets(); plain.push(line); }
  }
  flushPlain(); flushBullets();
  return <>{blocks}</>;
}
