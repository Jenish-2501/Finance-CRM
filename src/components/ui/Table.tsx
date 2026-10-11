import React from 'react';
import { cn } from './cn';

export const TableShell: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('bg-card border border-border rounded-lg shadow-xs overflow-hidden', className)} {...rest} />
);

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...rest }) => (
  <table className={cn('w-full text-xs', className)} {...rest} />
);

export const THead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...rest }) => (
  <thead className={cn('bg-muted/80 border-b border-border font-mono text-[11px] uppercase tracking-wider text-muted-foreground', className)} {...rest} />
);

export const TBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...rest }) => (
  <tbody className={cn('divide-y divide-border font-sans bg-card', className)} {...rest} />
);

export const TR: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, ...rest }) => (
  <tr className={cn('hover:bg-muted/50 transition-colors', className)} {...rest} />
);

export const TH: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...rest }) => (
  <th className={cn('text-left font-semibold px-4 py-2.5', className)} {...rest} />
);

export const TD: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...rest }) => (
  <td className={cn('px-4 py-3 text-foreground', className)} {...rest} />
);

export const EmptyState: React.FC<{ message: string; hint?: string }> = ({ message, hint }) => (
  <div className="px-6 py-10 text-center">
    <p className="text-xs font-medium text-foreground">{message}</p>
    {hint && <p className="text-[11px] font-mono text-muted-foreground mt-1">{hint}</p>}
  </div>
);
