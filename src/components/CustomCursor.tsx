import { useEffect, useRef } from "react";
import "./CustomCursor.css";

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("custom-cursor-on");
    return () => {
      document.body.classList.remove("custom-cursor-on");
    };
  }, []);

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let frameId: number;
    let visible = false;

    const show = () => {
      if (!visible) {
        visible = true;
        dotRef.current?.classList.add("visible");
        ringRef.current?.classList.add("visible");
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      show();
    };

    const onMouseEnterClickable = () => {
      ringRef.current?.classList.add("expanded");
      dotRef.current?.classList.add("shrunk");
    };
    const onMouseLeaveClickable = () => {
      ringRef.current?.classList.remove("expanded");
      dotRef.current?.classList.remove("shrunk");
    };

    const attachHoverListeners = () => {
      document.querySelectorAll<Element>("a, button, [role='button'], input, select, label, textarea").forEach((el) => {
        if ((el as HTMLElement).dataset.cursorBound) return;
        (el as HTMLElement).dataset.cursorBound = "1";
        el.addEventListener("mouseenter", onMouseEnterClickable);
        el.addEventListener("mouseleave", onMouseLeaveClickable);
      });
    };

    const loop = () => {
      ringX += (mouseX - ringX) * 0.1;
      ringY += (mouseY - ringY) * 0.1;

      if (dotRef.current) {
        dotRef.current.style.left = `${mouseX}px`;
        dotRef.current.style.top = `${mouseY}px`;
      }
      if (ringRef.current) {
        ringRef.current.style.left = `${ringX}px`;
        ringRef.current.style.top = `${ringY}px`;
      }

      frameId = requestAnimationFrame(loop);
    };

    document.addEventListener("mousemove", onMouseMove);
    frameId = requestAnimationFrame(loop);
    attachHoverListeners();

    const observer = new MutationObserver(attachHoverListeners);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="cc-dot" />
      <div ref={ringRef} className="cc-ring" />
    </>
  );
}
