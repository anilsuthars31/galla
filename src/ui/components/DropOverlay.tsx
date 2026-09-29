import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Drag-and-drop anywhere on the page. Returns true while a file is being dragged over the window. */
export function useFileDrop(onFile: (f: File) => void): boolean {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const cb = useRef(onFile);
  cb.current = onFile;

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const f = e.dataTransfer?.files[0];
      if (f) cb.current(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overFn);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return over;
}

export function DropOverlay() {
  return (
    <div className="drop" aria-hidden="true">
      <div>
        <Icon.upload />
        <b>Drop your statement</b>
        <span className="muted">CSV, XLS or XLSX from net banking. It stays in this browser.</span>
      </div>
    </div>
  );
}
