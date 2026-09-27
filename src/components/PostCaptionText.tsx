/**
 * Published caption plain-text renderer with safe http(s) inline link pills.
 * No HTML parsing / no destination network requests while rendering.
 */
import { useMemo, type ReactNode } from "react";
import ExternalLinkPill from "./ui/ExternalLinkPill";
import { tokenizeSafeHttpUrlsInText } from "../lib/safeHttpUrlText";

type Props = {
  text: string;
  className?: string;
  /** When true, link pills stop click/keyboard from bubbling (feed cards). */
  stopLinkPropagation?: boolean;
};

export default function PostCaptionText({
  text,
  className,
  stopLinkPropagation = false,
}: Props) {
  const segments = useMemo(() => tokenizeSafeHttpUrlsInText(text), [text]);

  const nodes: ReactNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.kind === "text") {
      nodes.push(<span key={`t-${i}`}>{seg.value}</span>);
      continue;
    }
    nodes.push(
      <ExternalLinkPill
        key={`u-${i}-${seg.href}`}
        href={seg.href}
        stopPropagation={stopLinkPropagation}
      />,
    );
  }

  return className ? <span className={className}>{nodes}</span> : <>{nodes}</>;
}
