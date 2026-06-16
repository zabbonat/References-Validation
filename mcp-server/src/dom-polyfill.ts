/**
 * Node.js polyfill for DOMParser (used by ArxivService)
 * Must be imported before any service that uses DOMParser
 */

// Simple XML parser for Node.js — parses arXiv Atom XML without browser DOMParser
// This is a lightweight implementation that handles the specific XML structures
// that ArxivService needs (Atom feed entries).

class SimpleElement {
    tagName: string;
    namespaceURI: string;
    textContent: string | null = null;
    children: SimpleElement[] = [];
    attributes: Map<string, string> = new Map();

    constructor(tagName: string, namespaceURI: string = '') {
        this.tagName = tagName;
        this.namespaceURI = namespaceURI;
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    getElementsByTagNameNS(ns: string, localName: string): SimpleElement[] {
        const results: SimpleElement[] = [];
        for (const child of this.children) {
            if (child.tagName === localName && child.namespaceURI === ns) {
                results.push(child);
            }
            results.push(...child.getElementsByTagNameNS(ns, localName));
        }
        return results;
    }

    querySelector(selector: string): SimpleElement | null {
        if (selector === 'parsererror') return null; // We handle errors differently
        return null;
    }
}

class SimpleDOMParser {
    parseFromString(xmlString: string, _mimeType: string): SimpleElement {
        const doc = new SimpleElement('document');
        try {
            this.parseXML(xmlString, doc);
        } catch {
            // Return empty doc on parse error
        }
        return doc;
    }

    private parseXML(xml: string, parent: SimpleElement): void {
        let pos = 0;

        while (pos < xml.length) {
            // Find next tag
            const tagStart = xml.indexOf('<', pos);
            if (tagStart === -1) break;

            // Text content before tag
            if (tagStart > pos) {
                const text = xml.substring(pos, tagStart).trim();
                if (text && parent.textContent === null) {
                    parent.textContent = text;
                } else if (text) {
                    parent.textContent = (parent.textContent || '') + ' ' + text;
                }
            }

            // XML declaration or processing instruction
            if (xml[tagStart + 1] === '?') {
                pos = xml.indexOf('?>', tagStart) + 2;
                continue;
            }

            // Comment
            if (xml.substring(tagStart, tagStart + 4) === '<!--') {
                pos = xml.indexOf('-->', tagStart) + 3;
                continue;
            }

            // Closing tag
            if (xml[tagStart + 1] === '/') {
                pos = xml.indexOf('>', tagStart) + 1;
                return; // Return to parent
            }

            // Opening tag
            const tagEnd = xml.indexOf('>', tagStart);
            if (tagEnd === -1) break;

            const tagContent = xml.substring(tagStart + 1, tagEnd);
            const isSelfClosing = tagContent.endsWith('/');
            const cleanTagContent = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim();

            // Parse tag name and attributes
            const spaceIdx = cleanTagContent.indexOf(' ');
            const fullTagName = spaceIdx > 0 ? cleanTagContent.substring(0, spaceIdx) : cleanTagContent;
            const attrString = spaceIdx > 0 ? cleanTagContent.substring(spaceIdx) : '';

            // Extract namespace and local name
            let localName = fullTagName;
            let ns = '';
            const colonIdx = fullTagName.indexOf(':');
            if (colonIdx > 0) {
                localName = fullTagName.substring(colonIdx + 1);
            }

            // Determine namespace from prefix or xmlns
            const nsMatch = attrString.match(/xmlns(?::(\w+))?="([^"]+)"/g);
            const nsMap = new Map<string, string>();
            if (nsMatch) {
                for (const m of nsMatch) {
                    const parts = m.match(/xmlns(?::(\w+))?="([^"]+)"/);
                    if (parts) {
                        nsMap.set(parts[1] || '', parts[2]);
                    }
                }
            }

            // Resolve namespace
            const prefix = colonIdx > 0 ? fullTagName.substring(0, colonIdx) : '';
            if (nsMap.has(prefix)) {
                ns = nsMap.get(prefix)!;
            } else if (prefix === 'arxiv') {
                ns = 'http://arxiv.org/schemas/atom';
            } else if (!prefix) {
                // Inherit parent namespace or check for default xmlns
                ns = nsMap.get('') || parent.namespaceURI || 'http://www.w3.org/2005/Atom';
            }

            const element = new SimpleElement(localName, ns);

            // Parse attributes
            const attrRegex = /(\w[\w:-]*)="([^"]*)"/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrString)) !== null) {
                if (!attrMatch[1].startsWith('xmlns')) {
                    element.attributes.set(attrMatch[1], attrMatch[2]);
                }
            }

            parent.children.push(element);
            pos = tagEnd + 1;

            if (!isSelfClosing) {
                // Find the closing tag and parse children
                const closingTag = `</${fullTagName}>`;
                const closingIdx = this.findClosingTag(xml, fullTagName, pos);
                if (closingIdx > pos) {
                    const innerXml = xml.substring(pos, closingIdx);
                    if (innerXml.includes('<')) {
                        this.parseXML(innerXml, element);
                    } else {
                        element.textContent = innerXml.trim();
                    }
                    pos = closingIdx + closingTag.length;
                }
            }
        }
    }

    private findClosingTag(xml: string, tagName: string, startPos: number): number {
        let depth = 1;
        let pos = startPos;
        const openPattern = `<${tagName}`;
        const closePattern = `</${tagName}>`;

        while (pos < xml.length && depth > 0) {
            const nextOpen = xml.indexOf(openPattern, pos);
            const nextClose = xml.indexOf(closePattern, pos);

            if (nextClose === -1) return -1;

            if (nextOpen !== -1 && nextOpen < nextClose) {
                // Check it's actually an opening tag (not a partial match)
                const charAfter = xml[nextOpen + openPattern.length];
                if (charAfter === '>' || charAfter === ' ' || charAfter === '/') {
                    depth++;
                }
                pos = nextOpen + 1;
            } else {
                depth--;
                if (depth === 0) return nextClose;
                pos = nextClose + closePattern.length;
            }
        }
        return -1;
    }
}

// Install globally so ArxivService can use it
(globalThis as any).DOMParser = SimpleDOMParser;

export { SimpleDOMParser };
