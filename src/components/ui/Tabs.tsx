import React from 'react';
import { cn } from './cn';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeId, onSelect, ariaLabel }) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    onKeyDown={(e) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
      const current = els.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        e.key === 'ArrowRight'
          ? (current + 1) % els.length
          : e.key === 'ArrowLeft'
            ? (current - 1 + els.length) % els.length
            : e.key === 'Home'
              ? 0
              : els.length - 1;
      els[nextIndex]?.focus();
      els[nextIndex]?.click();
    }}
    className="flex border-b border-border gap-6 text-xs font-medium text-muted-foreground overflow-x-auto"
  >
    {tabs.map((t) => (
      <button
        key={t.id}
        role="tab"
        aria-selected={activeId === t.id}
        onClick={() => onSelect(t.id)}
        className={cn(
          'pb-2.5 transition-colors border-b-2 -mb-px whitespace-nowrap',
          activeId === t.id ? 'border-primary text-foreground font-semibold' : 'border-transparent hover:text-foreground',
        )}
      >
        {t.label}
        {t.count !== undefined ? ` (${t.count})` : ''}
      </button>
    ))}
  </div>
);

export const Toolbar: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div
    className={cn(
      'flex items-center justify-between gap-3 p-4 bg-muted border border-input rounded-lg shadow-2xs no-print',
      className,
    )}
    {...rest}
  />
);
