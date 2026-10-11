import React from 'react';
import { cn } from './cn';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('bg-card text-card-foreground border border-border rounded-lg shadow-xs', className)} {...rest} />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('px-5 py-3.5 border-b border-border bg-muted/60 flex items-center justify-between gap-3 rounded-t-lg', className)} {...rest} />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...rest }) => (
  <h2 className={cn('text-xs font-bold uppercase tracking-wider text-foreground', className)} {...rest} />
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('p-5', className)} {...rest} />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('px-5 py-3.5 border-t border-border bg-muted/60 rounded-b-lg', className)} {...rest} />
);

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-card border border-border rounded-lg shadow-xs">
    <div>
      <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="text-xs text-muted-foreground font-mono mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'info' | 'primary';
  valueClassName?: string;
  subClassName?: string;
}

const toneIcon: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  info: 'bg-chart-2/10 text-chart-2',
};

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon, tone = 'default', valueClassName, subClassName }) => (
  <div className="p-4 bg-card border border-border rounded-lg shadow-xs">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      {icon && <span className={cn('w-7 h-7 rounded-md flex items-center justify-center', toneIcon[tone])}>{icon}</span>}
    </div>
    <div className={cn('text-2xl font-bold font-mono text-foreground mt-1.5 tracking-tight', valueClassName)}>{value}</div>
    {sub && <div className={cn('text-[11px] font-mono text-muted-foreground mt-0.5', subClassName)}>{sub}</div>}
  </div>
);
