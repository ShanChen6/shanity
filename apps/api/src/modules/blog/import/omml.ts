import { child, elements, type XmlElement } from './xml.js';

/**
 * Word equations (Office Math, OMML) to LaTeX for KaTeX. Covers what school
 * maths, physics and chemistry use: fractions, powers and indices, roots,
 * sums and integrals, brackets, systems of equations, matrices, accents
 * (vectors), limits, functions and arrows. Anything unknown keeps its
 * content, so text is never lost even when the layout is.
 */
export function ommlToLatex(math: XmlElement): string {
  return clean(convert(math));
}

const SYMBOLS: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon',
  ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta', ϑ: '\\vartheta',
  ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi',
  π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau', υ: '\\upsilon',
  φ: '\\varphi', ϕ: '\\phi', χ: '\\chi', ψ: '\\psi', ω: '\\omega',
  Γ: '\\Gamma', Δ: '\\Delta', '∆': '\\Delta', Θ: '\\Theta', Λ: '\\Lambda',
  Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
  '\u2126': '\\Omega',
  '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '±': '\\pm', '∓': '\\mp',
  '×': '\\times', '÷': '\\div', '⋅': '\\cdot', '·': '\\cdot', '∙': '\\cdot',
  '∞': '\\infty', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim',
  '∝': '\\propto', '→': '\\rightarrow', '←': '\\leftarrow',
  '↔': '\\leftrightarrow', '⇌': '\\rightleftharpoons', '⇒': '\\Rightarrow',
  '⇔': '\\Leftrightarrow', '⟹': '\\Longrightarrow', '↑': '\\uparrow',
  '↓': '\\downarrow', '∈': '\\in', '∉': '\\notin', '⊂': '\\subset',
  '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq', '∪': '\\cup',
  '∩': '\\cap', '∅': '\\varnothing', '∀': '\\forall', '∃': '\\exists',
  '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', '∘': '\\circ',
  '°': '^\\circ', '…': '\\ldots', '⋯': '\\cdots', '′': "'", '″': "''",
  '∂': '\\partial', '∇': '\\nabla', 'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}', '−': '-',
  '∗': '*', '⟶': '\\longrightarrow', '∣': '\\mid', '¬': '\\neg',
  '∧': '\\land', '∨': '\\lor', '∖': '\\setminus', '△': '\\triangle',
};

const ESCAPES: Record<string, string> = {
  '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', _: '\\_',
  $: '\\$', '\\': '\\backslash ', '^': '\\hat{}', '~': '\\sim ',
};

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min',
  'sup', 'inf', 'det', 'gcd', 'deg', 'arg', 'dim', 'ker',
]);

const NARY: Record<string, string> = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint',
  '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap',
};

const ACCENTS: Record<string, string> = {
  '⃗': '\\vec', '→': '\\overrightarrow', '̂': '\\hat',
  '^': '\\hat', '̄': '\\bar', '̅': '\\overline', '¯': '\\bar',
  '̇': '\\dot', '̈': '\\ddot', '̃': '\\tilde', '~': '\\tilde',
  '⃖': '\\overleftarrow', '⃡': '\\overleftrightarrow',
};

const DELIMITERS: Record<string, string> = {
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}',
  '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '⌊': '\\lfloor',
  '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '': '.',
};

const val = (node: XmlElement | undefined) => node?.attrs['m:val'];
const prop = (node: XmlElement, props: string, name: string) =>
  val(child(child(node, props), name));
const part = (node: XmlElement, name: string) => {
  const found = child(node, name);
  return found ? convert(found) : '';
};
const group = (latex: string) => `{${latex}}`;

/** Text of a math run as LaTeX: symbols mapped, specials escaped, words in \text. */
function mathText(text: string, plain: boolean): string {
  if (FUNCTIONS.has(text.trim())) return `\\${text.trim()} `;
  let out = '';
  let word = '';
  const flush = () => {
    if (!word) return;
    // Non-ASCII letters (Vietnamese) and plain-style runs read as words.
    out += /[^\x00-\x7f]/.test(word) || (plain && word.length > 1)
      ? `\\text{${word}}`
      : word;
    word = '';
  };
  for (const char of text) {
    if (/\p{L}/u.test(char) && !SYMBOLS[char]) {
      word += char;
      continue;
    }
    flush();
    if (SYMBOLS[char]) out += `${SYMBOLS[char]}${/^\\[a-zA-Z]+$/.test(SYMBOLS[char]) ? ' ' : ''}`;
    else if (ESCAPES[char]) out += ESCAPES[char];
    else if (char === ' ' || char === ' ') out += '\\ ';
    else out += char;
  }
  flush();
  return out;
}

function convert(node: XmlElement): string {
  switch (node.name) {
    case 'm:r': {
      const plain = prop(node, 'm:rPr', 'm:sty') === 'p' || Boolean(child(child(node, 'm:rPr'), 'm:nor'));
      return elements(node, 'm:t')
        .map((t) => mathText(t.children.join(''), plain))
        .join('');
    }
    case 'm:f': {
      const num = part(node, 'm:num');
      const den = part(node, 'm:den');
      const type = prop(node, 'm:fPr', 'm:type');
      if (type === 'lin') return `${group(num)}/${group(den)}`;
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}${group(num)}${group(den)}`;
      return `\\frac${group(num)}${group(den)}`;
    }
    case 'm:sSup':
      return `${group(part(node, 'm:e'))}^${group(part(node, 'm:sup'))}`;
    case 'm:sSub':
      return `${group(part(node, 'm:e'))}_${group(part(node, 'm:sub'))}`;
    case 'm:sSubSup':
      return `${group(part(node, 'm:e'))}_${group(part(node, 'm:sub'))}^${group(part(node, 'm:sup'))}`;
    case 'm:sPre':
      return `{}_${group(part(node, 'm:sub'))}^${group(part(node, 'm:sup'))}${group(part(node, 'm:e'))}`;
    case 'm:rad': {
      const hide = prop(node, 'm:radPr', 'm:degHide');
      const degree = part(node, 'm:deg');
      const body = group(part(node, 'm:e'));
      return hide === '1' || hide === 'on' || !degree.trim()
        ? `\\sqrt${body}`
        : `\\sqrt[${degree}]${body}`;
    }
    case 'm:nary': {
      const symbol = prop(node, 'm:naryPr', 'm:chr') ?? '∫';
      const command = NARY[symbol] ?? mathText(symbol, false);
      const sub = part(node, 'm:sub');
      const sup = part(node, 'm:sup');
      return `${command}${sub ? `_${group(sub)}` : ''}${sup ? `^${group(sup)}` : ''} ${part(node, 'm:e')}`;
    }
    case 'm:d': {
      const props = child(node, 'm:dPr');
      const begin = val(child(props, 'm:begChr')) ?? '(';
      const end = val(child(props, 'm:endChr')) ?? ')';
      const separator = val(child(props, 'm:sepChr')) ?? '|';
      const parts = elements(node, 'm:e').map(convert);
      const inner = parts.join(separator === '|' && parts.length > 1 ? ' \\mid ' : `${mathText(separator, false)} `);
      return `\\left${DELIMITERS[begin] ?? '.'} ${inner} \\right${DELIMITERS[end] ?? '.'}`;
    }
    case 'm:eqArr':
      // Left-aligned rows: how a system of equations reads inside a brace.
      return `\\begin{aligned}${elements(node, 'm:e')
        .map((row) => `&${convert(row)}`)
        .join(' \\\\ ')}\\end{aligned}`;
    case 'm:m':
      return `\\begin{matrix}${elements(node, 'm:mr')
        .map((row) => elements(row, 'm:e').map(convert).join(' & '))
        .join(' \\\\ ')}\\end{matrix}`;
    case 'm:func': {
      const name = clean(part(node, 'm:fName'));
      const bare = name.replace(/\\text\{([a-z]+)\}/, '$1').trim();
      const head = FUNCTIONS.has(bare) ? `\\${bare}` : /^\\[a-z]+$/.test(name) ? name : `\\operatorname{${bare}}`;
      return `${head}${group(part(node, 'm:e'))}`;
    }
    case 'm:acc': {
      const symbol = prop(node, 'm:accPr', 'm:chr') ?? '̂';
      return `${ACCENTS[symbol] ?? '\\hat'}${group(part(node, 'm:e'))}`;
    }
    case 'm:bar':
      return `${prop(node, 'm:barPr', 'm:pos') === 'bot' ? '\\underline' : '\\overline'}${group(part(node, 'm:e'))}`;
    case 'm:groupChr': {
      const symbol = prop(node, 'm:groupChrPr', 'm:chr') ?? '⏟';
      const top = prop(node, 'm:groupChrPr', 'm:pos') === 'top';
      const body = part(node, 'm:e');
      if (symbol === '⏟') return `\\underbrace${group(body)}`;
      if (symbol === '⏞') return `\\overbrace${group(body)}`;
      const arrow = mathText(symbol, false).trim();
      return top ? `\\overset${group(body)}${group(arrow)}` : `\\underset${group(body)}${group(arrow)}`;
    }
    case 'm:limLow': {
      const base = part(node, 'm:e');
      const limit = part(node, 'm:lim');
      return /^\\(lim|max|min|sup|inf)\s*$/.test(clean(base))
        ? `${clean(base)}_${group(limit)}`
        : `\\underset${group(limit)}${group(base)}`;
    }
    case 'm:limUpp':
      return `\\overset${group(part(node, 'm:lim'))}${group(part(node, 'm:e'))}`;
    case 'm:t':
      return mathText(node.children.join(''), false);
    case 'm:rPr':
    case 'm:ctrlPr':
    case 'w:rPr':
      return '';
    default:
      if (node.name.endsWith('Pr')) return '';
      return elements(node).map(convert).join('');
  }
}

/** Tidies spacing without touching what KaTeX reads. */
function clean(latex: string) {
  return latex.replace(/\s+/g, ' ').replace(/([a-zA-Z]) ([}^_])/g, '$1$2').trim();
}
