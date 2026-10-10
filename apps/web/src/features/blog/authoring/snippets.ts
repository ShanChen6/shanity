/**
 * Ready-made formulas for the editor's "Công thức" menu. `tex` is KaTeX
 * (with mhchem's \ce and \pu for chemistry and units); `display` puts it on
 * a line of its own ($$...$$) instead of inside the sentence ($...$).
 */
export type Snippet = { label: string; tex: string; display?: boolean };
export type SnippetGroup = { subject: string; items: Snippet[] };

export const SNIPPETS: SnippetGroup[] = [
  {
    subject: "Toán",
    items: [
      { label: "Phân số", tex: "\\frac{a}{b}" },
      { label: "Căn bậc hai / bậc n", tex: "\\sqrt{x} + \\sqrt[3]{y}" },
      { label: "Lũy thừa, chỉ số", tex: "x^{2} + a_{n}" },
      { label: "Nghiệm bậc hai", tex: "x_{1,2} = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a}", display: true },
      {
        label: "Hệ phương trình",
        tex: "\\begin{cases} x + y = 3 \\\\ 2x - y = 0 \\end{cases}",
        display: true,
      },
      { label: "Giới hạn", tex: "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1", display: true },
      { label: "Đạo hàm", tex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}", display: true },
      { label: "Tích phân", tex: "\\int_{a}^{b} f(x)\\,dx", display: true },
      { label: "Tổng", tex: "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}", display: true },
      { label: "Vectơ, góc", tex: "\\overrightarrow{AB}, \\ \\widehat{ABC} = 60^\\circ" },
      { label: "Tập hợp", tex: "x \\in \\mathbb{R}, \\ A \\cap B, \\ A \\cup B" },
      {
        label: "Ma trận",
        tex: "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}",
        display: true,
      },
    ],
  },
  {
    subject: "Vật lý",
    items: [
      { label: "Định luật II Newton", tex: "\\vec{F} = m\\vec{a}" },
      { label: "Vận tốc trung bình", tex: "v = \\dfrac{\\Delta s}{\\Delta t}", display: true },
      { label: "Đơn vị", tex: "g = 9{,}8\\ \\pu{m/s^2}" },
      { label: "Động năng", tex: "W_{\\text{đ}} = \\dfrac{1}{2}mv^{2}", display: true },
      { label: "Định luật Ôm", tex: "I = \\dfrac{U}{R}, \\quad R = 10\\,\\Omega", display: true },
      { label: "Hằng số", tex: "c \\approx 3 \\times 10^{8}\\ \\text{m/s}" },
      { label: "Chữ Hy Lạp", tex: "\\alpha, \\beta, \\lambda, \\omega, \\varphi, \\Delta" },
    ],
  },
  {
    subject: "Hóa học",
    items: [
      { label: "Phương trình phản ứng", tex: "\\ce{2H2 + O2 -> 2H2O}", display: true },
      { label: "Có điều kiện", tex: "\\ce{CaCO3 ->[t°] CaO + CO2 ^}", display: true },
      { label: "Thuận nghịch", tex: "\\ce{N2 + 3H2 <=>[xt, t°] 2NH3}", display: true },
      { label: "Kết tủa", tex: "\\ce{Ba^2+ + SO4^2- -> BaSO4 v}", display: true },
      { label: "Ion", tex: "\\ce{SO4^2-}, \\ce{Fe^3+}" },
      { label: "Công thức hóa học", tex: "\\ce{H2SO4}, \\ce{CuSO4*5H2O}" },
      { label: "Đồng vị", tex: "\\ce{^{14}_{6}C}" },
    ],
  },
];

/** Markdown for a snippet: `$tex$` inline, or `$$` on lines of its own. */
export const snippetMarkdown = ({ tex, display }: Snippet) =>
  display ? `\n$$\n${tex}\n$$\n` : `$${tex}$`;
