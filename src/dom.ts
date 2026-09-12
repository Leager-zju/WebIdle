export function setText(element: Element | null | undefined, value: unknown): void { if (!element) return; const next = String(value); if (element.textContent !== next) element.textContent = next; }
export function setHtml(element: HTMLElement | null | undefined, value: string): void { if (!element || element.dataset.html === value) return; element.dataset.html = value; element.innerHTML = value; }
export function setWidth(element: HTMLElement | null | undefined, percent: number): void { if (!element) return; const next = `${Math.max(0, Math.min(100, percent)).toFixed(2)}%`; if (element.style.width !== next) element.style.width = next; }
export function setClass(element: Element | null | undefined, name: string, enabled: boolean): void { element?.classList.toggle(name, !!enabled); }
export function setHidden(element: HTMLElement | null | undefined, hidden: boolean): void { if (element) element.hidden = !!hidden; }
export function setDisabled(element: HTMLButtonElement | null | undefined, disabled: boolean): void { if (element) element.disabled = !!disabled; }
export function pick(root: Element, ...names: string[]): Record<string, HTMLElement | null> { return Object.fromEntries(names.map(name => [name, root.querySelector(`[data-ref="${name}"]`)])); }
export function toFragment(html: string): DocumentFragment { const template = document.createElement('template'); template.innerHTML = html; return template.content; }
export function prefersReducedMotion(): boolean { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; }
/** 统一错误出口：只向浏览器控制台输出错误，可用 [WebIdle] 前缀过滤。 */
export function reportError(scope: string, message: string, detail?: unknown): void {
  const detailText = detail === undefined || detail === null ? '' : typeof detail === 'string' ? detail : String((detail as Error)?.stack || (detail as Error)?.message || detail);
  console.error(`[WebIdle] [${scope}] ${message}${detailText ? ` :: ${detailText}` : ''}`);
}
