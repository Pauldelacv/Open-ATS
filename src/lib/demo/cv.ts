import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type CvContent = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  summary: string;
  experience: Array<{ role: string; company: string; period: string; points: string[] }>;
  education: Array<{ title: string; school: string; period: string }>;
  skills: string[];
  languages: string[];
  labels: { experience: string; education: string; skills: string; languages: string };
};

const INK = rgb(0.094, 0.137, 0.227);
const MUTED = rgb(0.345, 0.38, 0.455);
const RULE = rgb(0.835, 0.851, 0.824);

/** One-page A4 CV, used for demo data and tests. Standard fonts cover French accents. */
export async function renderCvPdf(cv: CvContent): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`CV ${cv.name}`);
  pdf.setAuthor(cv.name);
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 56;
  const width = 595.28 - left * 2;
  let y = 841.89 - 64;

  const wrap = (text: string, font = regular, size = 10) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (
    value: string,
    opts: {
      font?: typeof regular;
      size?: number;
      color?: typeof INK;
      x?: number;
      gap?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10;
    for (const line of wrap(value, opts.font ?? regular, size)) {
      page.drawText(line, {
        x: opts.x ?? left,
        y,
        size,
        font: opts.font ?? regular,
        color: opts.color ?? INK,
      });
      y -= size + (opts.gap ?? 4);
    }
  };
  const section = (title: string) => {
    y -= 10;
    page.drawText(title, { x: left, y, size: 11, font: bold, color: INK });
    y -= 6;
    page.drawLine({
      start: { x: left, y },
      end: { x: left + width, y },
      thickness: 0.75,
      color: RULE,
    });
    y -= 16;
  };

  text(cv.name, { font: bold, size: 22, gap: 8 });
  text(cv.headline, { size: 12, color: MUTED, gap: 10 });
  text(`${cv.email}    ${cv.phone}    ${cv.city}`, { size: 9.5, color: MUTED, gap: 14 });
  text(cv.summary, { size: 10, gap: 4 });

  section(cv.labels.experience);
  for (const job of cv.experience) {
    page.drawText(job.role, { x: left, y, size: 10.5, font: bold, color: INK });
    const period = job.period;
    page.drawText(period, {
      x: left + width - regular.widthOfTextAtSize(period, 9.5),
      y,
      size: 9.5,
      font: regular,
      color: MUTED,
    });
    y -= 14;
    text(job.company, { size: 10, color: MUTED, gap: 6 });
    for (const point of job.points) text(`- ${point}`, { size: 9.5, gap: 3 });
    y -= 8;
  }

  section(cv.labels.education);
  for (const edu of cv.education) {
    page.drawText(edu.title, { x: left, y, size: 10.5, font: bold, color: INK });
    page.drawText(edu.period, {
      x: left + width - regular.widthOfTextAtSize(edu.period, 9.5),
      y,
      size: 9.5,
      font: regular,
      color: MUTED,
    });
    y -= 14;
    text(edu.school, { size: 10, color: MUTED, gap: 10 });
  }

  section(cv.labels.skills);
  text(cv.skills.join(", "), { size: 10, gap: 4 });
  section(cv.labels.languages);
  text(cv.languages.join(", "), { size: 10, gap: 4 });

  return Buffer.from(await pdf.save());
}
