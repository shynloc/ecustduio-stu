import { marked, type Token, type Tokens } from "marked";
import {
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  HeightRule,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
} from "docx";

const font = { ascii: "Arial", hAnsi: "Arial", eastAsia: "Source Han Sans CN" };
const headings = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function inline(
  tokens: Token[],
  style: IRunOptions = {},
): (TextRun | ExternalHyperlink)[] {
  return tokens.flatMap((token): (TextRun | ExternalHyperlink)[] => {
    if (token.type === "br") return [new TextRun({ break: 1 })];
    if (token.type === "link" && /^https?:\/\//i.test(token.href)) {
      return [
        new ExternalHyperlink({
          link: token.href,
          children: inline(token.tokens, {
            ...style,
            style: "Hyperlink",
          }).filter((r): r is TextRun => r instanceof TextRun),
        }),
      ];
    }
    if ("tokens" in token && token.tokens?.length) {
      return inline(token.tokens, {
        ...style,
        bold: style.bold || token.type === "strong",
        italics: style.italics || token.type === "em",
        strike: style.strike || token.type === "del",
      });
    }
    return [
      new TextRun({
        font,
        ...style,
        text: "text" in token ? token.text : token.raw,
      }),
    ];
  });
}

function table(token: Tokens.Table): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 75, bottom: 75, left: 100, right: 100 },
    rows: [token.header, ...token.rows].map(
      (cells, i) =>
        new TableRow({
          tableHeader: i === 0,
          cantSplit: true,
          height: { value: i === 0 ? 380 : 500, rule: HeightRule.ATLEAST },
          children: cells.map(
            (cell) =>
              new TableCell({
                width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
                shading: i === 0 ? { fill: "E6EFEA" } : undefined,
                children: [
                  new Paragraph({
                    spacing: { after: 0 },
                    children: inline(cell.tokens, { bold: i === 0 }),
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}
function paragraphs(tokens: Token[], title: string): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  for (const token of tokens) {
    if (token.type === "space") continue;
    if (token.type === "heading") {
      if (!result.length && token.depth === 1 && token.text === title) continue;
      result.push(
        new Paragraph({
          heading: headings[token.depth - 1],
          keepNext: true,
          spacing: { before: 160, after: 65 },
          children: inline(token.tokens, {
            size: 26,
            bold: true,
            color: "24483A",
          }),
        }),
      );
    } else if (token.type === "table")
      result.push(table(token as Tokens.Table));
    else if (token.type === "blockquote")
      result.push(...paragraphs(token.tokens, title));
    else if (token.type === "list") {
      for (const [index, item] of (token as Tokens.List).items.entries()) {
        const prefix = token.ordered
          ? Number(token.start || 1) + index + ". "
          : "• ";
        const first = item.tokens[0];
        result.push(
          new Paragraph({
            indent: { left: 260, hanging: 220 },
            children: [
              new TextRun(prefix),
              ...inline(
                first && (first.type === "text" || first.type === "paragraph")
                  ? first.tokens || [first]
                  : [],
              ),
            ],
          }),
        );
        result.push(
          ...paragraphs(
            item.tokens.slice(
              first && (first.type === "text" || first.type === "paragraph")
                ? 1
                : 0,
            ),
            title,
          ),
        );
      }
    } else
      result.push(
        new Paragraph({
          children:
            token.type === "paragraph"
              ? inline(token.tokens)
              : [
                  new TextRun({
                    font,
                    text: "text" in token ? token.text : token.raw,
                  }),
                ],
        }),
      );
  }
  return result;
}

export async function conversationWord(p: any) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      keepNext: true,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: p.title,
          font,
          bold: true,
          size: 36,
          color: "172D26",
        }),
      ],
    }),
    ...paragraphs(marked.lexer(p.chatMarkdown), p.title),
  ];
  for (const warning of p.unverified || [])
    children.push(new Paragraph({ text: warning }));
  if (p.sources.length)
    children.push(
      new Paragraph({
        text: "资料来源",
        keepNext: true,
        spacing: { before: 180, after: 60 },
      }),
    );
  for (const source of p.sources) {
    const link = source.url && /^https?:\/\//i.test(source.url);
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: source.title, size: 19, font }),
          ...(link
            ? [
                new ExternalHyperlink({
                  link: source.url,
                  children: [
                    new TextRun({ text: "　查看原文", style: "Hyperlink" }),
                  ],
                }),
              ]
            : []),
        ],
      }),
    );
  }
  return Packer.toBuffer(
    new Document({
      title: p.title,
      description: p.meta + " · " + p.versionId,
      styles: {
        default: {
          document: {
            run: { font, size: 23 },
            paragraph: { spacing: { after: 95, line: 300 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: {
                top: 1100,
                bottom: 1100,
                left: 1140,
                right: 1140,
                footer: 560,
              },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      font,
                      size: 16,
                      color: "555555",
                      children: ["研究草稿　·　第 ", PageNumber.CURRENT, " 页"],
                    }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    }),
  );
}
