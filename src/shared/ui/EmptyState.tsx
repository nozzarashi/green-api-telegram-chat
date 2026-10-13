import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Controls.module.css';
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <Icon name="message" size={34} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
