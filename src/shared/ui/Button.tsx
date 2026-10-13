import type { ButtonHTMLAttributes } from 'react';
import styles from './Controls.module.css';

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]} ${className}`} {...props} />
  );
}
