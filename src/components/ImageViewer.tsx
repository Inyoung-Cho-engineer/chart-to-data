'use client';

// DESIGN.md §3.1·§3.4 ②·§9 — 왼쪽에 계속 떠 있는 원본 이미지 영역.
// 이미지 표시 + PDF 페이지 이동 + 마우스 드래그로 영역 지정 + 잘라낸 이미지 만들기까지 한다.
// 자동으로 그래프 위치를 찾지 않는다 — 사용자가 직접 드래그한 사각형만 사용한다.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useSessionStore } from '@/store/session';
import { loadPdf } from '@/lib/pdf';
import { cropImageForTrace, cropImageToDataUrl } from '@/lib/crop';
import { makeAppError } from '@/lib/errors';
import { IDENTITY_CALIBRATION } from '@/lib/types';
import { mutedTextClass, secondaryButtonClass } from '@/lib/ui';

const MIN_SELECTION_PX = 100; // DESIGN.md §3.4 ② — 가로·세로 100px 미만이면 너무 작다고 안내

interface Point {
  x: number; // 이미지 기준 정규화 좌표 (0~1)
  y: number;
}

function clamp01(n: number) {
  return Math.min(Math.max(n, 0), 1);
}

function rectFromPoints(a: Point, b: Point) {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

export function ImageViewer() {
  const [moving, setMoving] = useState(false);
  const [dragAnchor, setDragAnchor] = useState<Point | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const file = useSessionStore((s) => s.file);
  const pageImage = useSessionStore((s) => s.pageImage);
  const currentPage = useSessionStore((s) => s.currentPage);
  const cropRect = useSessionStore((s) => s.cropRect);
  const setPageImage = useSessionStore((s) => s.setPageImage);
  const setCurrentPage = useSessionStore((s) => s.setCurrentPage);
  const setCropRect = useSessionStore((s) => s.setCropRect);
  const setCropImage = useSessionStore((s) => s.setCropImage);
  const setTraceImage = useSessionStore((s) => s.setTraceImage);
  const setPlotBox = useSessionStore((s) => s.setPlotBox);
  const setCalibration = useSessionStore((s) => s.setCalibration);
  const setGrayscaleWarning = useSessionStore((s) => s.setGrayscaleWarning);
  const setXAxis = useSessionStore((s) => s.setXAxis);
  const setYAxis = useSessionStore((s) => s.setYAxis);
  const setSeriesList = useSessionStore((s) => s.setSeriesList);
  const setSelectedSeriesId = useSessionStore((s) => s.setSelectedSeriesId);
  const setCrossings = useSessionStore((s) => s.setCrossings);
  const setPoints = useSessionStore((s) => s.setPoints);
  const setError = useSessionStore((s) => s.setError);

  // 영역을 새로 그리거나 페이지를 넘기면 이전 판독 결과는 더 이상 맞지 않으므로 함께 지운다.
  function clearAnalysisResult() {
    setPlotBox(null);
    setCalibration(IDENTITY_CALIBRATION);
    setGrayscaleWarning(false);
    setXAxis(null);
    setYAxis(null);
    setSeriesList([]);
    setSelectedSeriesId(null);
    setCrossings([]);
    setPoints([]);
  }

  function pointFromClient(clientX: number, clientY: number): Point | null {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  async function finishDrag(point: Point | null) {
    const anchor = dragAnchor;
    setDragAnchor(null);
    if (!anchor || !point) return;

    const rect = rectFromPoints(anchor, point);
    const img = imgRef.current;
    const pxWidth = Math.round((rect.x1 - rect.x0) * (img?.naturalWidth ?? 0));
    const pxHeight = Math.round((rect.y1 - rect.y0) * (img?.naturalHeight ?? 0));

    if (pxWidth < MIN_SELECTION_PX || pxHeight < MIN_SELECTION_PX) {
      setCropRect(null);
      setCropImage(null);
      setTraceImage(null);
      clearAnalysisResult();
      setError(makeAppError('REGION_TOO_SMALL'));
      return;
    }

    setError(null);
    setCropRect(rect);

    if (!pageImage) return;
    try {
      // 서버로 보낼 조각(줄인 JPEG)과 앱이 픽셀을 추적할 조각(원본 해상도 PNG)을 따로 만든다.
      const [forServer, forTrace] = await Promise.all([
        cropImageToDataUrl(pageImage, rect),
        cropImageForTrace(pageImage, rect),
      ]);
      setCropImage(forServer);
      setTraceImage(forTrace);
    } catch {
      // 자르기 자체가 실패하면(예: 손상된 이미지) 영역 단계 문제로 안내한다.
      setCropImage(null);
      setTraceImage(null);
      setError(makeAppError('REGION_NO_CHART'));
    }
  }

  // 드래그 도중 마우스가 이미지 밖으로 나가도 놓치지 않도록 window에 직접 붙인다.
  useEffect(() => {
    if (!dragAnchor) return;

    function handleWindowMouseMove(e: globalThis.MouseEvent) {
      const point = pointFromClient(e.clientX, e.clientY);
      if (point && dragAnchor) {
        setCropRect(rectFromPoints(dragAnchor, point));
      }
    }
    function handleWindowMouseUp(e: globalThis.MouseEvent) {
      void finishDrag(pointFromClient(e.clientX, e.clientY));
    }

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragAnchor]);

  if (!file || !pageImage) {
    return (
      <div className="flex w-full max-w-lg items-center justify-center rounded-xl border border-dashed border-slate-300 bg-card/40 p-16 text-sm text-slate-400">
        업로드한 그래프 이미지가 여기에 표시됩니다.
      </div>
    );
  }

  const isMultiPagePdf = file.pageCount > 1;

  async function goToPage(page: number) {
    if (!file || page < 1 || page > file.pageCount) return;
    setMoving(true);
    try {
      const pdf = await loadPdf(file.raw);
      const dataUrl = await pdf.renderPageToDataUrl(page);
      setPageImage(dataUrl);
      setCurrentPage(page);
      setCropRect(null); // 페이지가 바뀌면 이전 페이지에서 그린 영역·판독 결과는 의미가 없다
      setCropImage(null);
      setTraceImage(null);
      clearAnalysisResult();
    } finally {
      setMoving(false);
    }
  }

  function handleMouseDown(e: ReactMouseEvent) {
    if (moving) return;
    const point = pointFromClient(e.clientX, e.clientY);
    if (!point) return;
    setDragAnchor(point);
    setCropRect(null);
    setCropImage(null);
    setTraceImage(null);
    clearAnalysisResult();
    setError(null);
  }

  const naturalW = imgRef.current?.naturalWidth ?? 0;
  const naturalH = imgRef.current?.naturalHeight ?? 0;
  const selectionPx = cropRect
    ? {
        w: Math.round((cropRect.x1 - cropRect.x0) * naturalW),
        h: Math.round((cropRect.y1 - cropRect.y0) * naturalH),
      }
    : null;

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-2">
      <div
        className="relative inline-block cursor-crosshair select-none"
        onMouseDown={handleMouseDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={pageImage}
          alt={file.name}
          draggable={false}
          className="max-h-[500px] w-auto rounded-lg border border-slate-200 object-contain"
        />
        {cropRect && (
          <div
            className="pointer-events-none absolute border-2 border-steel bg-steel/20"
            style={{
              left: `${cropRect.x0 * 100}%`,
              top: `${cropRect.y0 * 100}%`,
              width: `${(cropRect.x1 - cropRect.x0) * 100}%`,
              height: `${(cropRect.y1 - cropRect.y0) * 100}%`,
            }}
          />
        )}
      </div>

      <p className={`text-sm ${mutedTextClass}`}>
        {cropRect
          ? `선택 영역: ${selectionPx?.w ?? '?'} × ${selectionPx?.h ?? '?'}px`
          : '이미지 위에서 그래프 영역을 드래그로 지정해주세요.'}
      </p>

      {isMultiPagePdf && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            className={`${secondaryButtonClass} px-2 py-1`}
            onClick={() => goToPage(currentPage - 1)}
            disabled={moving || currentPage <= 1}
          >
            ◀
          </button>
          <span className="text-navy">
            {moving ? '불러오는 중...' : `${currentPage} / ${file.pageCount} 페이지`}
          </span>
          <button
            type="button"
            className={`${secondaryButtonClass} px-2 py-1`}
            onClick={() => goToPage(currentPage + 1)}
            disabled={moving || currentPage >= file.pageCount}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
