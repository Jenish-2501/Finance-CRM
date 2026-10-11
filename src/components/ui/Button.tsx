import React from 'react';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'success' | 'success-outline' | 'destructive-outline' | 'ghost' | 'icon-ghost';
type ButtonSize = 'sm' | 'md' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
  secondary: 'bg-card text-foreground border border-border hover:bg-muted shadow-2xs',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs dark:bg-emerald-500 dark:hover:bg-emerald-600',
  'success-outline': 'text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 shadow-2xs dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30 dark:hover:bg-emerald-500/20',
  'destructive-outline': 'text-destructive bg-destructive/10 border border-destructive/25 hover:bg-destructive/15',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted',
  'icon-ghost': 'text-muted-foreground hover:text-foreground hover:bg-muted rounded-md',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs font-medium',
  md: 'px-3.5 py-1.5 text-xs font-semibold',
  icon: 'p-1',
};

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', className, type = 'button', ...rest }) => (
  <button
    type={type}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap',
      variantStyles[variant],
      sizeStyles[size],
      className,
    )}
    {...rest}
  />
);
