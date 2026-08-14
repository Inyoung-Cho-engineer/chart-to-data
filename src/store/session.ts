'use client';

// 브라우저 메모리에만 있는 작업 상태 저장소 (DESIGN.md §5.2). 서버에는 아무것도 저장하지 않는다.
// 새로고침하면 Zustand 스토어도 함께 초기화되어 모든 값이 사라진다 — 이 파일에 별도 저장 로직을 넣지 않는다.

import { create } from 'zustand';
import type {
  AxisInfo,
  Series,
  DataPoint,
  AppError,
  NormalizedRect,
} from '@/lib/types';

interface SessionState {
  file: { name: string; pageCount: number; raw: File } | null;
  // raw: 원본 File 객체. 서버로 보내지 않고 페이지를 다시 그릴 때만 씀
  pageImage: string | null; // 화면에 띄운 페이지 그림 (원본 페이지 전체)
  currentPage: number; // 지금 보고 있는 페이지 (1부터 시작, PDF 아니면 항상 1)
  cropRect: NormalizedRect | null; // pageImage 기준 드래그 영역
  cropImage: string | null; // 잘라낸 영역 조각 (API 호출마다 함께 보냄)
  xAxis: AxisInfo | null;
  yAxis: AxisInfo | null;
  plotBox: NormalizedRect | null; // cropImage 기준 그래프 안쪽 영역
  seriesList: Series[];
  selectedSeriesId: string | null;
  crossings: Array<{ tx: number; seriesIds: string[] }>;
  points: DataPoint[];
  error: AppError | null;
}

interface SessionActions {
  setFile: (file: SessionState['file']) => void;
  setPageImage: (image: string | null) => void;
  setCurrentPage: (page: number) => void;
  setCropRect: (rect: NormalizedRect | null) => void;
  setCropImage: (image: string | null) => void;
  setXAxis: (axis: AxisInfo | null) => void;
  setYAxis: (axis: AxisInfo | null) => void;
  setPlotBox: (box: NormalizedRect | null) => void;
  setSeriesList: (list: Series[]) => void;
  setSelectedSeriesId: (id: string | null) => void;
  setCrossings: (crossings: SessionState['crossings']) => void;
  setPoints: (points: DataPoint[]) => void;
  setError: (error: AppError | null) => void;
  reset: () => void;
}

const initialState: SessionState = {
  file: null,
  pageImage: null,
  currentPage: 1,
  cropRect: null,
  cropImage: null,
  xAxis: null,
  yAxis: null,
  plotBox: null,
  seriesList: [],
  selectedSeriesId: null,
  crossings: [],
  points: [],
  error: null,
};

export const useSessionStore = create<SessionState & SessionActions>()((set) => ({
  ...initialState,
  setFile: (file) => set({ file }),
  setPageImage: (pageImage) => set({ pageImage }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setCropRect: (cropRect) => set({ cropRect }),
  setCropImage: (cropImage) => set({ cropImage }),
  setXAxis: (xAxis) => set({ xAxis }),
  setYAxis: (yAxis) => set({ yAxis }),
  setPlotBox: (plotBox) => set({ plotBox }),
  setSeriesList: (seriesList) => set({ seriesList }),
  setSelectedSeriesId: (selectedSeriesId) => set({ selectedSeriesId }),
  setCrossings: (crossings) => set({ crossings }),
  setPoints: (points) => set({ points }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));

// 개발 중 진단용 — 브라우저 콘솔에서 현재 상태를 들여다볼 수 있게 열어둔다.
// 배포 빌드(production)에서는 실행되지 않는다.
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as unknown as { __session?: unknown }).__session = useSessionStore;
}
