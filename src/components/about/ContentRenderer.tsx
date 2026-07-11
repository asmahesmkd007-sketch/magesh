// =====================================================================
// ABOUT CHESS — verbatim content renderer
// ---------------------------------------------------------------------
// Renders admin-submitted content on the About Chess page. The design
// contract: EVERY line of the source text is rendered — nothing is
// skipped, summarized, shortened, or reordered. Lines that match a
// known structure (headings, lists, tables, quotes, code, images,
// videos, links) get rich formatting; everything else renders as a
// plain paragraph, unchanged.
//
// Supported syntax:
//   #..######  headings H1–H6
//   - or *     bullet list items       1. 2.   numbered list items
//   > quote    blockquote              ``` … ```  code block
//   | a | b |  table rows (first row = header)
//   ![alt](url)                        image
//   @video(url) or bare YouTube/.mp4 URL on its own line → embedded video
//   [text](url) and bare URLs inside text → links
//   **bold** and *italic* inline formatting
// =====================================================================
import { Fragment, type ReactNode } from "react";

// ---- inline formatting: links, bold, italic --------------------------------
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // split on markdown links, bare urls, bold, italic — keep delimiters
  const re = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(
        <a key={key} href={mm[2]} className="text-gold underline underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer">
          {mm[1]}
        </a>,
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else {
      out.push(
        <a key={key} href={tok} className="text-gold underline underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer">
          {tok}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function youTubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}

function Video({ url }: { url: string }) {
  const yt = youTubeId(url);
  if (yt) {
    return (
      <div className="my-4 aspect-video overflow-hidden rounded-xl border border-white/10">
        <iframe
          src={`https://www.youtube.com/embed/${yt}`}
          title="Embedded video"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <video controls className="my-4 w-full rounded-xl border border-white/10">
      <source src={url} />
      Your browser does not support embedded video. <a href={url}>{url}</a>
    </video>
  );
}

// ---- block parser -----------------------------------------------------------
export function ContentRenderer({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;

    // code block
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre key={key} className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // table
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        // skip pure separator rows like |---|---|
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="my-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            {head && (
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-left">
                  {head.map((c, ci) => (
                    <th key={ci} className="px-4 py-2 font-medium text-gold">
                      {renderInline(c, `${key}h${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-white/5 last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-4 py-2 text-ivory/85">
                      {renderInline(c, `${key}r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(
        <ul key={key} className="my-3 list-disc space-y-1.5 pl-6 text-ivory/85">
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `${key}i${ii}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // numbered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={key} className="my-3 list-decimal space-y-1.5 pl-6 text-ivory/85">
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `${key}i${ii}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]))
        buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="my-4 border-l-2 border-gold/50 bg-gold/5 py-2 pl-4 pr-3 italic text-ivory/80">
          {buf.map((b, bi) => (
            <p key={bi}>{renderInline(b, `${key}q${bi}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    i++;

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = [
        "font-display text-gradient-gold mt-8 mb-3 text-4xl",
        "font-display text-gold mt-7 mb-3 text-3xl",
        "font-display mt-6 mb-2 text-2xl",
        "font-display mt-5 mb-2 text-xl",
        "font-semibold mt-4 mb-1.5 text-lg",
        "font-semibold mt-4 mb-1.5 text-base uppercase tracking-wide text-gold/80",
      ][level - 1];
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(
        <Tag key={key} className={cls}>
          {renderInline(h[2], key)}
        </Tag>,
      );
      continue;
    }

    // image
    const img = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (img) {
      blocks.push(
        <figure key={key} className="my-4">
          <img src={img[2]} alt={img[1]} className="max-w-full rounded-xl border border-white/10" />
          {img[1] && <figcaption className="mt-1.5 text-xs text-muted-foreground">{img[1]}</figcaption>}
        </figure>,
      );
      continue;
    }

    // video: @video(url) or a bare video URL on its own line
    const vid = /^\s*@video\(([^)]+)\)\s*$/.exec(line);
    const bare = line.trim();
    if (vid || youTubeId(bare) || /^https?:\/\/\S+\.(mp4|webm|ogg)$/i.test(bare)) {
      blocks.push(<Video key={key} url={vid ? vid[1] : bare} />);
      continue;
    }

    // blank line → vertical spacing (still represents the original line)
    if (line.trim() === "") {
      blocks.push(<div key={key} className="h-2" aria-hidden />);
      continue;
    }

    // default: plain paragraph, verbatim
    blocks.push(
      <p key={key} className="my-1.5 leading-relaxed text-ivory/85">
        {renderInline(line, key)}
      </p>,
    );
  }

  return <Fragment>{blocks}</Fragment>;
}
