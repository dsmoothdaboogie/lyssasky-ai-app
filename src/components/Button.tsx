import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Shared pill-shaped button used across the funnel.
 * Styling lives in src/styles/global.css (.btn / .btn-primary / .btn-secondary)
 * so it stays token-driven and framework-free.
 */
export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  const variantClass = variant === 'secondary' ? 'btn-secondary' : 'btn-primary';
  const classes = ['btn', variantClass, className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}
