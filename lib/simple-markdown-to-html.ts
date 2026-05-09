/** Minimal Markdown → safe HTML for proposals (no raw HTML pass-through). */
export function simpleMarkdownToSafeHtml(markdown: string): string {
  function escapeHtml(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inlineFormat(s: string) {
    let out = escapeHtml(s);
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/_(.+?)_/g, "<em>$1</em>");
    return out;
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      chunks.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith("## ")) {
      closeList();
      chunks.push(`<h2 class="proposal-h2">${inlineFormat(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      chunks.push(`<h3 class="proposal-h3">${inlineFormat(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!listOpen) {
        chunks.push("<ul class=\"proposal-ul\">");
        listOpen = true;
      }
      chunks.push(`<li>${inlineFormat(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    chunks.push(`<p class="proposal-p">${inlineFormat(line)}</p>`);
  }
  closeList();
  return chunks.join("\n");
}
