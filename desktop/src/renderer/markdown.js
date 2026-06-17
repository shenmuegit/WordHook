function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function renderInline(value) {
  return escapeHTML(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split(/(?<!\\)\|/).map((cell) => {
    return cell.trim().replace(/\\\|/g, '|');
  });
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return !!cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTable(rows) {
  const [head, _divider, ...body] = rows;
  const header = head.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  const cells = body.map((row) => {
    return `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`;
  }).join('');
  return `<table><thead><tr>${header}</tr></thead><tbody>${cells}</tbody></table>`;
}

function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let inList = false;
  let inQuote = false;

  function closeList() {
    if (!inList) return;
    html.push('</ul>');
    inList = false;
  }

  function closeQuote() {
    if (!inQuote) return;
    html.push('</blockquote>');
    inQuote = false;
  }

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line) {
      closeList();
      closeQuote();
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      if (!inQuote) {
        html.push('<blockquote>');
        inQuote = true;
      }
      html.push(`<p>${renderInline(quote[1])}</p>`);
      continue;
    }

    closeQuote();

    const tableHead = splitTableRow(line);
    if (tableHead && isTableDivider(lines[index + 1] || '')) {
      closeList();
      const tableRows = [tableHead, splitTableRow(lines[index + 1])];
      index += 2;
      while (index < lines.length) {
        const row = splitTableRow(lines[index]);
        if (!row) break;
        tableRows.push(row);
        index++;
      }
      index--;
      html.push(renderTable(tableRows));
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${renderInline(listItem[1])}</li>`);
      continue;
    }

    closeList();

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  closeQuote();
  return html.join('');
}

if (typeof module !== 'undefined') {
  module.exports = {
    escapeHTML,
    renderMarkdown
  };
}
