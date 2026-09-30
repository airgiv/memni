"use client";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/ui/rapui";
import { useIsDesktop } from "@/client/hooks";

/** Dialog on desktop, bottom drawer on phones — same content. */
export function Adaptive({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  if (desktop)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="sm" showClose>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent handle>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="px-4 pb-[calc(var(--safe-bottom)+16px)]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
