import React from 'react';
import { cn } from './cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const fieldBase =
  'bg-card text-foreground border border-input rounded-md placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring disabled:opacity-50';

export const Input: React.FC<InputProps> = ({ className, ...rest }) => (
  <input className={cn(fieldBase, 'px-3 py-1.5 text-xs font-sans', className)} {...rest} />
);

export const Textarea: React.FC<TextareaProps> = ({ className, ...rest }) => (
  <textarea className={cn(fieldBase, 'px-3 py-2 text-xs font-sans min-h-20', className)} {...rest} />
);

export const Select: React.FC<SelectProps> = ({ className, children, ...rest }) => (
  <select className={cn(fieldBase, 'px-2.5 py-1.5 text-xs font-sans', className)} {...rest}>
    {children}
  </select>
);

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...rest }) => (
  <label className={cn('text-xs font-semibold text-foreground flex items-center gap-1.5', className)} {...rest} />
);

export const FieldError: React.FC<{ message?: string }> = ({ message }) => {
  if (!message) return null;
  return <p className="text-[11px] font-mono text-destructive">{message}</p>;
};

export const SearchInput: React.FC<InputProps & { icon?: React.ReactNode }> = ({ icon, className, ...rest }) => (
  <div className="relative">
    {icon && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
    <input className={cn(fieldBase, 'pl-9 pr-3 py-1.5 text-xs w-64 font-sans', className)} {...rest} />
  </div>
);
