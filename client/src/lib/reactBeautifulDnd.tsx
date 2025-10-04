import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode
} from "react";

export interface DraggableLocation {
  droppableId: string;
  index: number;
}

export interface DropResult {
  draggableId: string;
  type: string;
  source: DraggableLocation;
  destination: DraggableLocation | null;
  reason: "DROP" | "CANCEL";
}

type ActiveDrag = {
  draggableId: string;
  type: string;
  source: DraggableLocation;
};

type DragContextValue = {
  activeDrag: ActiveDrag | null;
  startDrag: (drag: ActiveDrag) => void;
  completeDrop: (destination: DraggableLocation | null, reason: "DROP" | "CANCEL") => void;
};

const DragContext = createContext<DragContextValue | null>(null);

export type DragDropContextProps = {
  onDragEnd: (result: DropResult) => void;
  children?: ReactNode;
};

export const DragDropContext = ({ onDragEnd, children }: DragDropContextProps) => {
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const dropHandledRef = useRef(false);

  const startDrag = useCallback((drag: ActiveDrag) => {
    dropHandledRef.current = false;
    setActiveDrag(drag);
  }, []);

  const completeDrop = useCallback(
    (destination: DraggableLocation | null, reason: "DROP" | "CANCEL") => {
      setActiveDrag((current) => {
        if (!current) {
          return null;
        }
        onDragEnd({
          draggableId: current.draggableId,
          type: current.type,
          source: current.source,
          destination,
          reason
        });
        dropHandledRef.current = true;
        return null;
      });
    },
    [onDragEnd]
  );

  const contextValue = useMemo(
    () => ({
      activeDrag,
      startDrag,
      completeDrop
    }),
    [activeDrag, completeDrop, startDrag]
  );

  const handleDragEnd = useCallback(() => {
    if (!dropHandledRef.current && activeDrag) {
      completeDrop(null, "CANCEL");
    }
    dropHandledRef.current = false;
  }, [activeDrag, completeDrop]);

  return (
    <DragContext.Provider value={contextValue}>
      <div onDragEnd={handleDragEnd}>{children}</div>
    </DragContext.Provider>
  );
};

type DroppableContextValue = {
  droppableId: string;
  type: string;
};

const DroppableContext = createContext<DroppableContextValue | null>(null);

export type DroppableStateSnapshot = {
  isDraggingOver: boolean;
};

export type DroppableProvided = {
  innerRef: (element: HTMLElement | null) => void;
  droppableProps: {
    onDragOver: (event: ReactDragEvent) => void;
    onDragEnter: (event: ReactDragEvent) => void;
    onDragLeave: (event: ReactDragEvent) => void;
    onDrop: (event: ReactDragEvent) => void;
    "data-dnd-droppable": string;
  };
  placeholder: ReactNode;
};

export type DroppableProps = {
  droppableId: string;
  type?: string;
  children: (provided: DroppableProvided, snapshot: DroppableStateSnapshot) => ReactNode;
};

export const Droppable = ({ droppableId, type = "DEFAULT", children }: DroppableProps) => {
  const dragContext = useContext(DragContext);
  const containerRef = useRef<HTMLElement | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const setRef = useCallback(
    (element: HTMLElement | null) => {
      containerRef.current = element;
    },
    []
  );

  const computeIndex = useCallback(
    (event: ReactDragEvent): number => {
      const container = containerRef.current;
      if (!container) {
        return 0;
      }
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-dnd-draggable]");
      if (target && container.contains(target)) {
        const indexAttr = target.getAttribute("data-dnd-index");
        const parsed = indexAttr ? Number.parseInt(indexAttr, 10) : Number.NaN;
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
      return container.querySelectorAll("[data-dnd-draggable]").length;
    },
    []
  );

  const handleDragOver = useCallback(
    (event: ReactDragEvent) => {
      if (!dragContext?.activeDrag) {
        return;
      }
      if (dragContext.activeDrag.type !== type) {
        return;
      }
      event.preventDefault();
    },
    [dragContext, type]
  );

  const handleDragEnter = useCallback(
    (event: ReactDragEvent) => {
      if (!dragContext?.activeDrag) {
        return;
      }
      if (dragContext.activeDrag.type !== type) {
        return;
      }
      event.preventDefault();
      setIsDraggingOver(true);
    },
    [dragContext, type]
  );

  const handleDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent) => {
      if (!dragContext?.activeDrag) {
        return;
      }
      if (dragContext.activeDrag.type !== type) {
        return;
      }
      event.preventDefault();
      const index = computeIndex(event);
      dragContext.completeDrop({ droppableId, index }, "DROP");
      setIsDraggingOver(false);
    },
    [computeIndex, dragContext, droppableId, type]
  );

  const provided: DroppableProvided = useMemo(
    () => ({
      innerRef: setRef,
      droppableProps: {
        onDragOver: handleDragOver,
        onDragEnter: handleDragEnter,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
        "data-dnd-droppable": droppableId
      },
      placeholder: null
    }),
    [droppableId, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, setRef]
  );

  const snapshot: DroppableStateSnapshot = useMemo(
    () => ({ isDraggingOver }),
    [isDraggingOver]
  );

  const contextValue = useMemo(
    () => ({ droppableId, type }),
    [droppableId, type]
  );

  return (
    <DroppableContext.Provider value={contextValue}>
      {children(provided, snapshot)}
    </DroppableContext.Provider>
  );
};

export type DraggableStateSnapshot = {
  isDragging: boolean;
};

export type DraggableProvided = {
  innerRef: (element: HTMLElement | null) => void;
  draggableProps: {
    draggable: boolean;
    onDragStart: (event: ReactDragEvent) => void;
    onDragEnd: (event: ReactDragEvent) => void;
    "data-dnd-draggable": string;
    "data-dnd-index": number;
  };
  dragHandleProps: {
    onDragStart: (event: ReactDragEvent) => void;
  };
};

export type DraggableProps = {
  draggableId: string;
  index: number;
  children: (provided: DraggableProvided, snapshot: DraggableStateSnapshot) => ReactNode;
};

export const Draggable = ({ draggableId, index, children }: DraggableProps) => {
  const dragContext = useContext(DragContext);
  const droppable = useContext(DroppableContext);
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);

  const setRef = useCallback((element: HTMLElement | null) => {
    nodeRef.current = element;
  }, []);

  const handleDragStart = useCallback(
    (event: ReactDragEvent) => {
      if (!dragContext || !droppable) {
        return;
      }
      dragContext.startDrag({
        draggableId,
        type: droppable.type,
        source: { droppableId: droppable.droppableId, index }
      });
      event.dataTransfer.effectAllowed = "move";
      setIsDragging(true);
    },
    [dragContext, draggableId, droppable, index]
  );

  const handleDragEnd = useCallback(
    (event: ReactDragEvent) => {
      event.preventDefault();
      setIsDragging(false);
    },
    []
  );

  const provided = useMemo<DraggableProvided>(
    () => ({
      innerRef: setRef,
      draggableProps: {
        draggable: true,
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
        "data-dnd-draggable": draggableId,
        "data-dnd-index": index
      },
      dragHandleProps: {
        onDragStart: handleDragStart
      }
    }),
    [draggableId, handleDragEnd, handleDragStart, index, setRef]
  );

  const snapshot = useMemo<DraggableStateSnapshot>(
    () => ({ isDragging }),
    [isDragging]
  );

  return <>{children(provided, snapshot)}</>;
};
