import sanitizeHtml from 'sanitize-html';
export const LESSON_HTML_TAGS = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'code',
    'pre',
    'blockquote',
    'a',
    'img',
];
export function sanitizeLessonHtml(value) {
    return sanitizeHtml(value.trim(), {
        allowedTags: [...LESSON_HTML_TAGS],
        allowedAttributes: {
            a: ['href', 'title', 'target', 'rel'],
            img: ['src', 'alt', 'title'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: { img: ['http', 'https'] },
        allowProtocolRelative: false,
        disallowedTagsMode: 'discard',
        nonTextTags: ['script', 'style', 'textarea', 'option'],
        transformTags: {
            a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }, true),
        },
    }).trim();
}
//# sourceMappingURL=html-sanitizer.js.map