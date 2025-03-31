import { ReactNode, HTMLAttributes } from "react";

interface SecondarySectionContainerProps extends HTMLAttributes<HTMLElement> {
  className?: string;
  children: ReactNode;
}

const SecondarySectionContainer = ({
  className = "",
  children,
  ...rest
}: SecondarySectionContainerProps) => {
  return (
    <section
      className={`w-full flex items-start justify-center bg-white rounded-md shadow-md ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
};

export default SecondarySectionContainer;
