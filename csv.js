export function toCsv(rows, headers) {
  const esc = (v) => {
    const s = String(v ?? "").replaceAll('"', '""');
    return `"${s}"`;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}
