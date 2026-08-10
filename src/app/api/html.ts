import { selectAll as cssSelectAll, selectOne as cssSelectOne } from 'css-select';
import { parseDocument } from 'htmlparser2';
import { AnyNode, Document, Element, isTag } from 'domhandler';
import { getAttributeValue, getName, getParent, hasAttrib, textContent } from 'domutils';

export type HtmlRoot = Document;
export type HtmlElement = Element;

export function parseHTML(html: string) {
  return parseDocument(html);
}

export function selectAll(root: HtmlRoot | HtmlElement, selector: string) {
  return cssSelectAll<AnyNode, Element>(selector, root.children);
}

export function selectOne(root: HtmlRoot | HtmlElement, selector: string) {
  return cssSelectOne<AnyNode, Element>(selector, root.children);
}

export function attr(el: HtmlElement, name: string) {
  return getAttributeValue(el, name);
}

export function hasAttr(el: HtmlElement, name: string) {
  return hasAttrib(el, name);
}

export function tagName(el: HtmlElement) {
  return getName(el).toLowerCase();
}

export function text(el: HtmlElement | HtmlElement[]) {
  return textContent(el).trim();
}

export function closest(el: HtmlElement, tag: string) {
  for (let node = getParent(el); node; node = getParent(node)) {
    if (isTag(node) && tagName(node) === tag) return node;
  }
  return null;
}
