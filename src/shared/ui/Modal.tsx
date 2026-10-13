import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './Controls.module.css';
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.dialogHeader}>
        <h2 id={id}>{title}</h2>
        <Button variant="ghost" aria-label="Закрыть" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
