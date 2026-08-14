'use client';

// DESIGN.md §3.2 ①·§3.4 ①·§7 — 파일을 고르고, 형식·용량·PDF 페이지 수를 검사하는 화면.
// 검사를 통과하면 화면에 띄울 그림(JPG는 그대로, PDF는 1페이지)을 만들어 세션 저장소에 커밋한다.

import { useState, type ChangeEvent } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSessionStore } from '@/store/session';
import { makeAppError } from '@/lib/errors';
import { loadPdf } from '@/lib/pdf';
import { IDENTITY_CALIBRATION } from '@/lib/types';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_PDF_PAGES = 30;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function UploadPanel() {
  const [checking, setChecking] = useState(false);
  const file = useSessionStore((s) => s.file);
  const setFile = useSessionStore((s) => s.setFile);
  const setPageImage = useSessionStore((s) => s.setPageImage);
  const setCurrentPage = useSessionStore((s) => s.setCurrentPage);
  const setCropRect = useSessionStore((s) => s.setCropRect);
  const setCropImage = useSessionStore((s) => s.setCropImage);
  const setTraceImage = useSessionStore((s) => s.setTraceImage);
  const setPlotBox = useSessionStore((s) => s.setPlotBox);
  const setCalibration = useSessionStore((s) => s.setCalibration);
  const setXAxis = useSessionStore((s) => s.setXAxis);
  const setYAxis = useSessionStore((s) => s.setYAxis);
  const setSeriesList = useSessionStore((s) => s.setSeriesList);
  const setSelectedSeriesId = useSessionStore((s) => s.setSelectedSeriesId);
  const setCrossings = useSessionStore((s) => s.setCrossings);
  const setPoints = useSessionStore((s) => s.setPoints);
  const error = useSessionStore((s) => s.error);
  const setError = useSessionStore((s) => s.setError);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 onChange가 다시 일어나게 초기화

    if (!picked) return;

    setError(null);
    setFile(null);
    setPageImage(null);
    setCropRect(null); // 새 파일을 고르면 이전 파일에서 그린 영역·판독 결과는 의미가 없으므로 지운다
    setCropImage(null);
    setTraceImage(null);
    setPlotBox(null);
    setCalibration(IDENTITY_CALIBRATION);
    setXAxis(null);
    setYAxis(null);
    setSeriesList([]);
    setSelectedSeriesId(null);
    setCrossings([]);
    setPoints([]);

    const isPdf = picked.type === 'application/pdf' || /\.pdf$/i.test(picked.name);
    const isJpg = picked.type === 'image/jpeg' || /\.jpe?g$/i.test(picked.name);

    if (!isPdf && !isJpg) {
      setError(makeAppError('FILE_TYPE'));
      return;
    }

    if (picked.size > MAX_FILE_SIZE) {
      setError(makeAppError('FILE_SIZE'));
      return;
    }

    setChecking(true);
    try {
      if (isPdf) {
        const pdf = await loadPdf(picked);
        if (pdf.numPages > MAX_PDF_PAGES) {
          setError(makeAppError('FILE_PAGES'));
          return;
        }
        const dataUrl = await pdf.renderPageToDataUrl(1);
        setFile({ name: picked.name, pageCount: pdf.numPages, raw: picked });
        setPageImage(dataUrl);
        setCurrentPage(1);
      } else {
        const dataUrl = await readFileAsDataUrl(picked);
        setFile({ name: picked.name, pageCount: 1, raw: picked });
        setPageImage(dataUrl);
        setCurrentPage(1);
      }
    } catch {
      // PDF를 열지 못하거나(손상·비표준 형식) 이미지를 읽지 못하면 형식 문제로 안내한다 — 원본 에러는 노출하지 않는다.
      setError(makeAppError('FILE_TYPE'));
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-3 rounded border p-6 text-center text-sm">
      <ErrorNotice error={error} onAction={() => setError(null)} />

      <label className="cursor-pointer rounded bg-black px-4 py-2 text-white">
        PDF 또는 JPG 파일 선택
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {checking && <p className="text-zinc-500">확인 중...</p>}
      {!checking && file && !error && (
        <p className="text-zinc-600">
          선택한 파일: {file.name} — 검사 통과 (왼쪽에서 확인하세요)
        </p>
      )}

      <p className="text-zinc-500">업로드 파일은 20MB 이하, PDF는 30페이지 이하만 가능합니다.</p>
      <p className="text-zinc-500">
        업로드한 파일과 추출 결과는 서버에 저장되지 않습니다. 새로고침하면 사라집니다.
      </p>
      <p className="text-zinc-500">
        지정한 그래프 영역은 판독을 위해 외부 AI 모델로 전송됩니다. 공개된 논문·기술 보고서 등
        공개 자료만 올려주세요.
      </p>
    </section>
  );
}
