"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Bot, Maximize2, Minimize2, PenSquare, X } from "lucide-react";

import type { OrderDetail, Product } from "../lib/types";
import type { McpClient } from "../lib/mcp-client";
import { useChat } from "../hooks/useChat";
import { ChatMessageList } from "./chat/ChatMessageList";
import { MessageComposer } from "./chat/MessageComposer";
import { ProductDetailDrawer } from "./products/ProductDetailDrawer";
import { OrderTrackingDrawer } from "./orders/OrderTrackingDrawer";

const SIZE_STORAGE_KEY = "ua-cai-panel-size";
const DEFAULT_SIZE = { w: 400, h: 640 };
const MIN_SIZE = { w: 360, h: 460 };
/* The panel is anchored bottom-right at bottom-24/right-6; these margins keep it
   clear of the launcher and the viewport edges when fully expanded. */
const MARGIN_X = 48;
const MARGIN_Y = 120;

type PanelSize = { w: number; h: number };

function maxSize(): PanelSize {
  if (typeof window === "undefined") return { w: 720, h: 900 };
  return {
    w: Math.max(MIN_SIZE.w, window.innerWidth - MARGIN_X),
    h: Math.max(MIN_SIZE.h, window.innerHeight - MARGIN_Y),
  };
}

function clampSize(size: PanelSize): PanelSize {
  const max = maxSize();
  return {
    w: Math.min(Math.max(size.w, MIN_SIZE.w), max.w),
    h: Math.min(Math.max(size.h, MIN_SIZE.h), max.h),
  };
}

export function ChatPanel({
  client,
  title,
  userName,
  userAvatarUrl,
  onClose,
}: {
  client: McpClient;
  title: string;
  userName?: string;
  userAvatarUrl?: string;
  onClose: () => void;
}) {
  const chat = useChat(client);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Order-tracking dialog state. `trackingOrderNo` is the order currently being
  // fetched (drives inline spinners on the order cards / entry form).
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingDetail, setTrackingDetail] = useState<OrderDetail | null>(null);
  const [trackingOrderNo, setTrackingOrderNo] = useState<string | null>(null);
  const trackingAbort = useRef<AbortController | null>(null);

  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches,
  );
  const [size, setSize] = useState<PanelSize>(DEFAULT_SIZE);
  const [resizing, setResizing] = useState(false);
  const preExpandSize = useRef<PanelSize | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let initial = DEFAULT_SIZE;
    try {
      const raw = window.localStorage.getItem(SIZE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PanelSize;
        if (parsed?.w && parsed?.h) initial = parsed;
      }
    } catch {
      /* ignore malformed persisted size */
    }
    setSize(clampSize(initial));

    const onWindowResize = () => setSize((curr) => clampSize(curr));
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  const persistSize = useCallback((next: PanelSize) => {
    try {
      window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable; keep in-memory only */
    }
  }, []);

  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, axis: "both" | "x" | "y") => {
      if (!isDesktop) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture is a best-effort nicety; resizing works without it */
      }
      preExpandSize.current = null;
      setResizing(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { ...size };

      const onMove = (ev: PointerEvent) => {
        // Panel is anchored bottom-right, so dragging the top/left edges out grows it.
        setSize(
          clampSize({
            w: axis === "y" ? start.w : start.w + (startX - ev.clientX),
            h: axis === "x" ? start.h : start.h + (startY - ev.clientY),
          }),
        );
      };
      const onUp = () => {
        setResizing(false);
        setSize((curr) => {
          persistSize(curr);
          return curr;
        });
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isDesktop, size, persistSize],
  );

  const expanded =
    isDesktop &&
    size.w >= maxSize().w - 1 &&
    size.h >= maxSize().h - 1;

  const toggleExpand = useCallback(() => {
    if (expanded && preExpandSize.current) {
      const restored = clampSize(preExpandSize.current);
      preExpandSize.current = null;
      setSize(restored);
      persistSize(restored);
    } else {
      preExpandSize.current = size;
      const max = maxSize();
      setSize(max);
      persistSize(max);
    }
  }, [expanded, size, persistSize]);

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setDetailOpen(true);
  }

  // Fetches tracking detail for an order number (from a card click or the entry
  // form) and opens the tracking dialog with a loading state.
  const trackOrder = useCallback(
    async (orderNo: string) => {
      trackingAbort.current?.abort();
      const controller = new AbortController();
      trackingAbort.current = controller;

      setTrackingOrderNo(orderNo);
      setTrackingDetail(null);
      setTrackingError(null);
      setTrackingLoading(true);
      setTrackingOpen(true);

      try {
        const detail = await client.getOrderDetail(orderNo, controller.signal);
        if (controller.signal.aborted) return;
        if (detail) {
          setTrackingDetail(detail);
        } else {
          setTrackingError(
            `We couldn't find tracking for order ${orderNo}. Check the number and try again.`,
          );
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setTrackingError(
          err instanceof Error
            ? err.message
            : "Could not load tracking for this order right now.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setTrackingLoading(false);
          setTrackingOrderNo(null);
        }
      }
    },
    [client],
  );

  // Opens the tracking dialog with an already-loaded detail (no fetch), used
  // when the backend returned the order detail directly in a chat message.
  const viewTracking = useCallback((detail: OrderDetail) => {
    trackingAbort.current?.abort();
    setTrackingDetail(detail);
    setTrackingError(null);
    setTrackingLoading(false);
    setTrackingOrderNo(null);
    setTrackingOpen(true);
  }, []);

  const closeTracking = useCallback(() => {
    trackingAbort.current?.abort();
    setTrackingOpen(false);
  }, []);

  const streaming = chat.streamingId !== null;

  return (
    <div
      role="dialog"
      aria-label={title}
      style={isDesktop ? { width: size.w, height: size.h } : undefined}
      className="ua-cai-panel @container fixed inset-x-0 bottom-0 z-[999] flex h-[88vh] flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/5 sm:inset-x-auto sm:bottom-24 sm:right-6 sm:max-h-[calc(100vh-7.5rem)] sm:max-w-[calc(100vw-3rem)] sm:rounded-3xl"
    >
      {isDesktop && (
        <>
          {/* Left edge: resize width. */}
          <div
            role="separator"
            aria-label="Resize chat panel width"
            onPointerDown={(e) => startResize(e, "x")}
            className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize touch-none"
          />
          {/* Top edge: resize height. */}
          <div
            role="separator"
            aria-label="Resize chat panel height"
            onPointerDown={(e) => startResize(e, "y")}
            className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize touch-none"
          />
          {/* Top-left corner: resize both. */}
          <div
            role="separator"
            aria-label="Resize chat panel"
            onPointerDown={(e) => startResize(e, "both")}
            className="group absolute left-0 top-0 z-20 flex h-7 w-7 cursor-nwse-resize items-start justify-start p-1.5 touch-none"
          >
            <span className="h-3 w-3 rounded-tl-[4px] border-l-2 border-t-2 border-muted/80 transition-colors group-hover:border-foreground" />
          </div>
        </>
      )}
      {resizing && (
        <div className="fixed inset-0 z-[998] cursor-nwse-resize select-none" />
      )}

      <div className="flex items-center justify-between border-b border-border bg-surface/70 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_6px_16px_-4px_rgba(220,0,25,0.7)]"
          >
            <Bot className="h-5 w-5" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight">{title}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={chat.reset}
            aria-label="New conversation"
            title="New conversation"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PenSquare className="h-5 w-5" />
          </button>
          {isDesktop && (
            <button
              type="button"
              onClick={toggleExpand}
              aria-label={expanded ? "Restore panel size" : "Expand panel"}
              title={expanded ? "Restore size" : "Expand"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? (
                <Minimize2 className="h-[18px] w-[18px]" />
              ) : (
                <Maximize2 className="h-[18px] w-[18px]" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <ChatMessageList
        messages={chat.messages}
        pending={chat.pending}
        streamingId={chat.streamingId}
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        onSelectProduct={openProduct}
        onSuggestion={(p) => void chat.send(p)}
        onRetry={chat.retry}
        onTrackOrder={(orderNo) => void trackOrder(orderNo)}
        onViewTracking={viewTracking}
        trackingOrderNo={trackingOrderNo}
      />

      <div className="border-t border-border bg-surface px-4 py-3">
        {chat.loadError && (
          <p role="alert" className="mb-2 text-sm text-accent">
            {chat.loadError}
          </p>
        )}
        <MessageComposer
          onSend={(m) => void chat.send(m)}
          onCancel={chat.cancel}
          streaming={streaming}
        />
        <p className="mt-2 text-center text-xs text-muted">
          Recommendations only. Cart and checkout are coming soon.
        </p>
      </div>

      <ProductDetailDrawer
        product={selectedProduct}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        contained
      />

      <OrderTrackingDrawer
        open={trackingOpen}
        onClose={closeTracking}
        loading={trackingLoading}
        error={trackingError}
        detail={trackingDetail}
        orderNo={trackingOrderNo}
      />
    </div>
  );
}
