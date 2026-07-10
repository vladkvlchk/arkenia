import { cn } from "@/shared/lib/cn";

/** Bordered scroll container for tables placed directly on the page. */
export function TableContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-x-auto rounded-lg border border-line bg-surface shadow-xs", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface-2/60", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-line transition-colors duration-150 last:border-0 hover:bg-surface-2/40",
        className
      )}
      {...props}
    />
  );
}

interface CellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligned; Td additionally switches to mono for figures. */
  numeric?: boolean;
}

export function Th({ className, numeric, ...props }: CellProps) {
  return (
    <th
      className={cn("t-overline h-9 whitespace-nowrap px-4 text-left font-medium", numeric && "text-right", className)}
      {...props}
    />
  );
}

export function Td({ className, numeric, ...props }: CellProps) {
  return (
    <td
      className={cn("whitespace-nowrap px-4 py-3", numeric && "text-right font-mono", className)}
      {...props}
    />
  );
}
