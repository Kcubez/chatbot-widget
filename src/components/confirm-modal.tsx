'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  busyLabel?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Reusable destructive/confirm dialog. Owns its busy state: the confirm button
 * shows `busyLabel` and stays disabled until `onConfirm` settles, then closes
 * itself on success (stays open on error so the caller can toast).
 */
export default function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busyLabel = 'Working…',
  onConfirm,
}: ConfirmModalProps) {
  const [isBusy, setIsBusy] = useState(false);
  const Icon = tone === 'danger' ? Trash2 : AlertTriangle;
  const iconClasses =
    tone === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600';

  return (
    <Dialog open={open} onOpenChange={isBusy ? undefined : onOpenChange}>
      <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
        <div className="p-8 pb-6 bg-white shrink-0">
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-6 shadow-inner mx-auto ${iconClasses}`}>
            <Icon className="h-7 w-7" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2 tracking-tight">
              {title}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              {description}
            </DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col-reverse sm:flex-row items-center justify-center gap-3 shrink-0">
          <DialogClose asChild>
            <Button
              variant="outline"
              disabled={isBusy}
              className="rounded-xl h-12 px-6 font-bold w-full sm:flex-1 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
            >
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={isBusy}
            className="rounded-xl h-12 px-6 font-bold shadow-xl w-full sm:flex-1 transition-all active:scale-95"
            onClick={async () => {
              setIsBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setIsBusy(false);
              }
            }}
          >
            {isBusy ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
