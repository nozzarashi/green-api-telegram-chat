import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Controls.module.css';

export function InputField({
  label,
  error,
  helperText,
  suffix,
  id: suppliedId,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  helperText?: string;
  suffix?: ReactNode;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={id}
          className={`${styles.input} ${suffix ? styles.withSuffix : ''} ${className}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error || helperText ? `${id}-help` : undefined}
          {...props}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      {(error || helperText) && (
        <p id={`${id}-help`} className={error ? styles.error : styles.help}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
