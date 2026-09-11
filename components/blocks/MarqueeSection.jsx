'use client';

import Marquee from '../Marquee';

/**
 * The scrolling keyword strip with its own heading — the "chapter break"
 * spread from the home page, available to any page.
 */
export default function MarqueeSection({ content = {} }) {
  const { label, head, items } = content;

  return (
    <div className="deck-divider deck-fill">
      {label && (
        <div className="sec-label mono">
          <span className="ln" /> {label}
        </div>
      )}
      {head && (
        <h2 className="deck-divider__head">
          {head}<span style={{ color: 'var(--olive)' }}>.</span>
        </h2>
      )}
      <Marquee items={items} />
    </div>
  );
}
