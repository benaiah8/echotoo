import { ReactNode } from "react";

interface PrimarySectionContainerProps {
  className?: string;
  ClassName?: string;
  children: ReactNode;
}

const PrimarySectionContainer = ({
  className = "",
  ClassName = "",
  children,
}: PrimarySectionContainerProps) => {
  return (
    <section className={`w-full flex items-start justify-center ${ClassName}`}>
      <div
        className={`w-full max-w-7xl items-start justify-start ${className}`}
      >
        {children}
      </div>
    </section>
  );
};

export default PrimarySectionContainer;
