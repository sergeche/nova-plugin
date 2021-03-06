import expandAbbreviation, { extract as extractAbbreviation, UserConfig, AbbreviationContext, ExtractedAbbreviation, Options, ExtractOptions, resolveConfig, MarkupAbbreviation, StylesheetAbbreviation, SyntaxType } from 'emmet';
import match, { balancedInward, balancedOutward } from '@emmetio/html-matcher';
import { balancedInward as cssBalancedInward, balancedOutward as cssBalancedOutward } from '@emmetio/css-matcher';
import { selectItemCSS, selectItemHTML, TextRange } from '@emmetio/action-utils';
import { isXML, syntaxInfo, docSyntax, getMarkupAbbreviationContext, getStylesheetAbbreviationContext } from './syntax';
import { getContent, isQuotedString } from './utils';
import getEmmetConfig from './config';
import getOutputOptions, { field } from './output';

export interface ContextTag extends AbbreviationContext {
    open: TextRange;
    close?: TextRange;
}

/**
 * Cache for storing internal Emmet data.
 * TODO reset whenever user settings are changed
 */
let cache = {};

export const JSX_PREFIX = '<';

export const knownTags = [
    'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio',
    'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
    'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'content',
    'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
    'em', 'embed',
    'fieldset', 'figcaption', 'figure', 'footer', 'form',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html',
    'i', 'iframe', 'img', 'input', 'ins',
    'kbd', 'keygen',
    'label', 'legend', 'li', 'link',
    'main', 'map', 'mark', 'menu', 'menuitem', 'meta', 'meter',
    'nav', 'noscript',
    'object', 'ol', 'optgroup', 'option', 'output',
    'p', 'param', 'picture', 'pre', 'progress',
    'q',
    'rp', 'rt', 'rtc', 'ruby',
    's', 'samp', 'script', 'section', 'select', 'shadow', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
    'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track',
    'u', 'ul', 'var', 'video', 'wbr'
];

/**
 * Expands given abbreviation into code snippet
 */
export function expand(editor: TextEditor, abbr: string | MarkupAbbreviation | StylesheetAbbreviation, config?: UserConfig) {
    let opt: UserConfig = { cache };
    const outputOpt: Partial<Options> = {
        'output.field': field,
        'output.format': !config || !config['inline'],
    };

    if (config) {
        Object.assign(opt, config);
        if (config.options) {
            Object.assign(outputOpt, config.options);
        }
    }

    opt.options = outputOpt;

    const pluginConfig = getEmmetConfig();
    if (pluginConfig.config) {
        opt = resolveConfig(opt, pluginConfig.config);
    }

    return expandAbbreviation(abbr as string, opt);
}

/**
 * Extracts abbreviation from given source code by detecting actual syntax context.
 * For example, if host syntax is HTML, it tries to detect if location is inside
 * embedded CSS.
 *
 * It also detects if abbreviation is allowed at given location: HTML tags,
 * CSS selectors may not contain abbreviations.
 * @param code Code from which abbreviation should be extracted
 * @param pos Location at which abbreviation should be expanded
 * @param syntax Syntax of abbreviation to expand
 */
export function extract(code: string, pos: number, type: SyntaxType = 'markup', options?: Partial<ExtractOptions>): ExtractedAbbreviation | undefined {
    return extractAbbreviation(code, pos, {
        lookAhead: type !== 'stylesheet',
        type,
        ...options
    });
}

/**
 * Returns list of tags for balancing for given code
 */
export function balance(code: string, pos: number, inward = false, xml = false) {
    const options = { xml };
    return inward
        ? balancedInward(code, pos, options)
        : balancedOutward(code, pos, options);
}

/**
 * Returns list of selector/property ranges for balancing for given code
 */
export function balanceCSS(code: string, pos: number, inward?: boolean) {
    return inward
        ? cssBalancedInward(code, pos)
        : cssBalancedOutward(code, pos);
}

/**
 * Returns model for selecting next/previous item
 */
export function selectItem(code: string, pos: number, isCSS?: boolean, isPrevious?: boolean) {
    return isCSS
        ? selectItemCSS(code, pos, isPrevious)
        : selectItemHTML(code, pos, isPrevious);
}

/**
 * Returns matched HTML/XML tag for given point in view
 */
export function getTagContext(editor: TextEditor, pos: number, xml?: boolean): ContextTag | undefined {
    const content = getContent(editor);
    let ctx: ContextTag | undefined;

    if (xml == null) {
        // Autodetect XML dialect
        const syntax = docSyntax(editor);
        xml = syntax ? isXML(syntax) : false;
    }

    const matchedTag = match(content, pos, { xml });
    if (matchedTag) {
        const { open, close } = matchedTag;
        ctx = {
            name: matchedTag.name,
            open,
            close
        };

        if (matchedTag.attributes) {
            ctx.attributes = {};
            matchedTag.attributes.forEach(attr => {
                let value = attr.value;
                if (value && isQuotedString(value)) {
                    value = value.slice(1, -1);
                }

                ctx!.attributes![attr.name] = value == null ? null : value;
            });
        }
    }

    return ctx;
}

/**
 * Returns Emmet options for given character location in editor
 */
export function getOptions(editor: TextEditor, pos: number): UserConfig {
    const info = syntaxInfo(editor, pos);
    const { context } = info;

    const config: UserConfig = {
        type: info.type,
        syntax: info.syntax || 'html',
        options: getOutputOptions(editor, pos, info.inline)
    };

    if (context) {
        const content = getContent(editor);
        // Set context from syntax info
        if (context.type === 'html' && context.ancestors.length) {
            config.context = getMarkupAbbreviationContext(content, context);
        } else if (context.type === 'css') {
            config.context = getStylesheetAbbreviationContext(context);
        }
    }

    return config;
}
