import { useEffect } from 'react';
import type { RefObject } from 'react';

// Makes every titled .card inside `containerRef` collapsible: the card's header
// (its h2/h3 title, or the header row wrapping that title) toggles the rest of the card,
// and cards start collapsed. Done at the DOM level rather than by wrapping each
// card in a component because the Settings page has dozens of cards spread
// across its own file and shared components (NamedListCard, ChecklistsCard,
// etc.) that are also used elsewhere un-collapsed. A MutationObserver picks up
// cards as tabs switch and as cards swap from their loading placeholder to
// their loaded content. Cards inside a modal, cards nested in another card,
// cards with no title (bare tables), and cards marked data-no-collapse are
// left alone.
export function useCollapsibleCards(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Titles the user has expanded, so a card that re-mounts (e.g. loading →
    // loaded) keeps the state they chose for as long as the page is open.
    const expanded = new Set<string>();

    const headerOf = (card: HTMLElement): HTMLElement | null => {
      for (const child of Array.from(card.children) as HTMLElement[]) {
        if (child.matches('h2, h3')) return child;
        if (child.querySelector(':scope > h2, :scope > h3, :scope > div > h2, :scope > div > h3')) return child;
      }
      return null;
    };

    const titleElOf = (header: HTMLElement) =>
      header.matches('h2, h3') ? header : header.querySelector<HTMLElement>('h2, h3');
    const titleOf = (header: HTMLElement) => titleElOf(header)?.textContent?.trim() ?? '';

    const setCollapsed = (card: HTMLElement, header: HTMLElement, collapsed: boolean) => {
      card.classList.toggle('card-collapsed', collapsed);
      titleElOf(header)?.setAttribute('aria-expanded', String(!collapsed));
    };

    const enhance = () => {
      container.querySelectorAll<HTMLElement>('.card').forEach((card) => {
        if (card.closest('.modal') || card.parentElement?.closest('.card')) return;
        // Opt-out for a card that's the only thing on its tab (Recycle Bin),
        // where starting collapsed would just hide the whole tab.
        if (card.dataset.noCollapse !== undefined) return;
        const header = headerOf(card);
        if (!header || header.classList.contains('card-collapse-header')) return;
        // React can keep the same card element and swap its children (e.g. a
        // loading placeholder becoming the real content), so a card seen before
        // may come back with a fresh header that needs wiring up again.
        const collapsed = card.dataset.collapsible
          ? card.classList.contains('card-collapsed')
          : !expanded.has(titleOf(header));
        card.dataset.collapsible = 'true';
        card.classList.add('card-collapsible');
        header.classList.add('card-collapse-header');
        // The title, not the whole row, is the keyboard/screen-reader toggle so
        // buttons in the row aren't nested inside another button.
        const titleEl = titleElOf(header);
        titleEl?.setAttribute('role', 'button');
        if (titleEl) titleEl.tabIndex = 0;
        setCollapsed(card, header, collapsed);
      });
    };

    const toggleFrom = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      const header = el?.closest<HTMLElement>('.card-collapse-header');
      if (!header || !container.contains(header)) return false;
      const card = header.closest<HTMLElement>('.card-collapsible');
      if (!card) return false;
      // Buttons, links and inputs in a header row keep doing their own thing,
      // but open a collapsed card so anything they show inline is visible.
      const onControl = el !== header && !!el?.closest('button, a, input, select, textarea, label');
      const collapse = !card.classList.contains('card-collapsed');
      if (onControl && collapse) return false;
      const title = titleOf(header);
      if (collapse) expanded.delete(title);
      else expanded.add(title);
      setCollapsed(card, header, collapse);
      return true;
    };

    const onClick = (e: MouseEvent) => {
      toggleFrom(e.target);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target as HTMLElement;
      const header = target.closest?.<HTMLElement>('.card-collapse-header');
      if (!header || titleElOf(header) !== target) return;
      if (toggleFrom(e.target)) e.preventDefault();
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(container, { childList: true, subtree: true });
    container.addEventListener('click', onClick);
    container.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef]);
}
