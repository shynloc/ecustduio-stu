import { createCanvas } from "@napi-rs/canvas";
export const fixtureLines = [
  "OCR功能验收样本",
  "北京教育考试院 2027年初中学考报名",
  "全市报名信息采集时间：",
  "2026年11月7日8:30至11月13日17:00。",
  "各区可在此期间自行确定本区报名时间。",
  "第一次英语听说考试于2026年12月13日进行。",
  "第二次拟于2027年3月进行，具体时间另行通知。",
  "依据官方网页制作的OCR验收扫描件，非原始公文。",
];
export function fixtures(mixed = false) {
  const canvas = createCanvas(1600, 1200),
    c = canvas.getContext("2d");
  c.fillStyle = "#fff";
  c.fillRect(0, 0, 1600, 1200);
  c.fillStyle = "#111";
  c.font = "42px Microsoft YaHei";
  fixtureLines.forEach((s, i) => c.fillText(s, 70, 100 + 110 * i));
  const jpg = canvas.toBuffer("image/jpeg");
  const stream = Buffer.from("q 800 0 0 600 0 0 cm /Im1 Do Q");
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      Buffer.from("\nendstream"),
    ]),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1600 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
      ),
      jpg,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    ),
  ];
  if (mixed) {
    const text = Buffer.from(
      "BT /F1 16 Tf 50 500 Td (Mixed PDF text page with original conditions preserved.) Tj ET",
    );
    objects[5] = Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /Font << /F1 8 0 R >> >> /Contents 7 0 R >>",
    );
    objects.push(
      Buffer.concat([
        Buffer.from(`<< /Length ${text.length} >>\nstream\n`),
        text,
        Buffer.from("\nendstream"),
      ]),
      Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    );
  }
  const parts = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(parts.reduce((n, b) => n + b.length, 0));
    parts.push(
      Buffer.from(`${i + 1} 0 obj\n`),
      objects[i],
      Buffer.from("\nendobj\n"),
    );
  }
  const offset = parts.reduce((n, b) => n + b.length, 0);
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
          .join("") +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`,
    ),
  );
  return {
    png: canvas.toBuffer("image/png"),
    jpg,
    webp: canvas.toBuffer("image/webp"),
    pdf: Buffer.concat(parts),
  };
}
