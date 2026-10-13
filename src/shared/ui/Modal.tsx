import { useState } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './Controls.module.css';

/** Radix handles keyboard focus, Escape and screen-reader dialog semantics. */
export function Modal({
  title,
  children,
  onClose,
  getReturnFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Resolve after closing, when the next screen's refs have been attached. */
  getReturnFocus?: () => HTMLElement | null;
}) {
  const [returnFocusElement] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content
          className={styles.dialog}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = getReturnFocus?.() ?? returnFocusElement;
            target?.focus();
          }}
        >
          <div className={styles.dialogHeader}>
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Закрыть">
                <Icon name="close" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
