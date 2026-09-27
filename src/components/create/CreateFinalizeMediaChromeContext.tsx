import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Value = {
  mediaDockExpanded: boolean;
  setMediaDockExpanded: (expanded: boolean) => void;
  mediaDragActive: boolean;
  setMediaDragActive: (active: boolean) => void;
};

const CreateFinalizeMediaChromeContext = createContext<Value | null>(null);

export function CreateFinalizeMediaChromeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [mediaDockExpanded, setMediaDockExpanded] = useState(false);
  const [mediaDragActive, setMediaDragActive] = useState(false);

  const value = useMemo<Value>(
    () => ({
      mediaDockExpanded,
      setMediaDockExpanded,
      mediaDragActive,
      setMediaDragActive,
    }),
    [mediaDockExpanded, mediaDragActive],
  );

  return (
    <CreateFinalizeMediaChromeContext.Provider value={value}>
      {children}
    </CreateFinalizeMediaChromeContext.Provider>
  );
}

export function useCreateFinalizeMediaChrome(): Value {
  const ctx = useContext(CreateFinalizeMediaChromeContext);
  if (!ctx) {
    return {
      mediaDockExpanded: false,
      setMediaDockExpanded: () => {},
      mediaDragActive: false,
      setMediaDragActive: () => {},
    };
  }
  return ctx;
}
