import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Controls.module.css';
export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'info';
}) {
  return (
    <div
      className={`${styles.alert} ${tone === 'info' ? styles.info : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon name={tone === 'error' ? 'warning' : 'help'} />
      <div>{children}</div>
    </div>
  );
}
