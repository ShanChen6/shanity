"use client";

import { Sheet } from "@/components/ui/dialog";
import type { ReactNode } from "react";

export function MobileCurriculumSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div data-testid="mobile-curriculum-sheet">
      <Sheet
        side="left"
        title="Giáo trình"
        onClose={onClose}
        className="max-md:mt-auto max-md:h-[82dvh] max-md:max-h-[82dvh] max-md:w-full max-md:max-w-none max-md:rounded-t-2xl md:max-w-sm lg:hidden"
      >
        {children}
      </Sheet>
    </div>
  );
}
