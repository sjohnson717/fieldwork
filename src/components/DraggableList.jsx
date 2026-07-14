import { useState, useRef } from "react";

// Generic drag-to-reorder list. `items` need a stable `id`; `onReorder(reordered)`
// is called with the new array order on drop; `renderItem(item, index)` renders each row.
export default function DraggableList({ items, onReorder, renderItem }) {
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) {
      setDragOverIndex(null);
      return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex.current, 1);
    reordered.splice(index, 0, moved);
    dragIndex.current = null;
    setDragOverIndex(null);
    onReorder(reordered);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div
          key={item.id}
          draggable
          onDragStart={e => handleDragStart(e, index)}
          onDragOver={e => handleDragOver(e, index)}
          onDrop={e => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={`transition-all ${
            dragOverIndex === index ? "opacity-50 scale-[0.98]" : ""
          }`}
        >
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}
