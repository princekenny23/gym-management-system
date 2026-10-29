export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const contents = rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          const safeText = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
          return `"${safeText.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const blob = new Blob([`\uFEFF${contents}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
