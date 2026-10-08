'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Machine } from "@/types";
import { MachineCard } from "@/components/machines/MachineCard";
import { MachineCardSkeleton } from "@/components/machines/MachineCardSkeleton";
import { cn } from "@/lib/utils";

type VirtualMachineGridProps = {
  machines: Machine[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  minCardWidth?: number;
  gap?: number;
};

const DEFAULT_MIN_CARD_WIDTH = 280;
const DEFAULT_GAP = 16;

export function VirtualMachineGrid({
  machines,
  isLoading = false,
  emptyMessage = "No machines match the current search and filter set.",
  className = "",
  minCardWidth = DEFAULT_MIN_CARD_WIDTH,
  gap = DEFAULT_GAP,
}: VirtualMachineGridProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    const updateWidth = () => {
      setContainerWidth(element.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const columns = useMemo(() => {
    if (!containerWidth) return 1;
    return Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)));
  }, [containerWidth, gap, minCardWidth]);

  const rowCount = useMemo(() => {
    if (isLoading) {
      return 3;
    }
    return Math.ceil(machines.length / columns);
  }, [columns, isLoading, machines.length]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 360,
    overscan: 2,
  });

  const rows = rowVirtualizer.getVirtualItems();

  if (!isLoading && machines.length === 0) {
    return (
      <div className={`col-span-full py-20 text-center font-mono text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn(
        "relative h-[calc(100vh-280px)] min-h-[720px] overflow-auto custom-scrollbar",
        className
      )}
    >
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowMachines = isLoading
            ? Array.from({ length: columns }, (_, index) => ({ id: `skeleton-${virtualRow.index}-${index}` } as Machine))
            : machines.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 grid w-full gap-4 xl:gap-5"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {rowMachines.map((machine, index) => (
                <div key={machine.id ?? index} className="min-w-0">
                  {isLoading ? (
                    <MachineCardSkeleton />
                  ) : (
                    <MachineCard machine={machine} />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
