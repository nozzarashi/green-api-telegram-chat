import type { ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import styles from './Controls.module.css';

const buttonVariants = cva(styles.button, {
  variants: {
    variant: { primary: styles.primary, secondary: styles.secondary, ghost: styles.ghost },
  },
  defaultVariants: { variant: 'primary' },
});

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  asChild?: boolean;
}) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      data-slot="button"
      {...(asChild ? {} : { type })}
      className={buttonVariants({ variant, className })}
      {...props}
    />
  );
}
