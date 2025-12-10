import { ReactNode } from "react";

interface LazyListProps<T> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  bufferBefore?: number;
  bufferAfter?: number;
  rootMargin?: string;
  loadingComponent?: ReactNode;
  enabled?: boolean;
  className?: string;
}

export default function LazyList<T>({
  items,
  renderItem,
  className = "",
}: LazyListProps<T>) {
  return <div className={className}>{items.map(renderItem)}</div>;
}

