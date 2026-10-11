import React from 'react';
import { cn } from './cn';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'success' | 'destructive' | 'info' | 'warning' | 'neutral';
}

const toneStyles: Record<NonNullable<AlertProps['tone']>, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200',
  destructive: 'bg-destructive/10 border-destructive/25 text-destructive',
  info: 'bg-chart-2/10 border-chart-2/25 text-chart-2',
  warning: 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200',
  neutral: 'bg-muted border-border text-foreground',
};

export const Alert: React.FC<AlertProps> = ({ tone = 'neutral', className, ...rest }) => (
  <div className={cn('p-3.5 rounded-lg border text-xs', toneStyles[tone], className)} {...rest} />
);

export const Well: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('bg-muted border border-border rounded-md p-3', className)} {...rest} />
);

export const Eyebrow: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground', className)} {...rest} />
);
