import { useEffect, useState } from "react";

export function useFocusNavigation(itemCount: number) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
          setFocusedIndex((prev) => Math.min(prev + 1, itemCount - 1));
          break;
        case "ArrowLeft":
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        // TODO:
        // case "ArrowDown":
        //   setFocusedIndex((prev) => Math.min(prev + rowSize, itemCount - 1));
        //   break;
        // case "ArrowUp":
        //   setFocusedIndex((prev) => Math.max(prev - rowSize, 0));
        //   break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [itemCount]);

  return { focusedIndex, setFocusedIndex };
}
