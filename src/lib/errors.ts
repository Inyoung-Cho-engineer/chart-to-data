// DESIGN.md §7 실패 처리(3단계) 표를 그대로 코드로 옮긴 것.
// 원본 에러 메시지(모델·네트워크 등)는 여기 담지 않는다 — 코드별로 미리 정해둔 안내 문구만 화면에 보여준다.

import type { AppError } from './types';

export type ErrorCode =
  | 'FILE_TYPE'
  | 'FILE_SIZE'
  | 'FILE_PAGES'
  | 'REGION_TOO_SMALL'
  | 'REGION_NO_CHART'
  | 'REGION_NO_AXIS'
  | 'MODEL_CALL_FAILED'
  | 'MODEL_TIMEOUT'
  | 'MODEL_BAD_FORMAT'
  | 'MODEL_RATE_LIMITED';

interface ErrorEntry {
  stage: AppError['stage'];
  message: string;
  action: '다시 시도' | '영역 다시 잡기';
}

export const ERROR_TABLE: Record<ErrorCode, ErrorEntry> = {
  FILE_TYPE: {
    stage: 'file',
    message: 'PDF·JPG·PNG 파일만 올릴 수 있습니다. 다른 형식이면 이미지로 저장한 뒤 다시 올려주세요.',
    action: '다시 시도',
  },
  FILE_SIZE: {
    stage: 'file',
    message: '파일이 20MB를 넘습니다. 필요한 페이지만 따로 잘라서 올려주세요.',
    action: '다시 시도',
  },
  FILE_PAGES: {
    stage: 'file',
    message: 'PDF가 30페이지를 넘습니다. 그래프가 있는 페이지만 따로 저장해 올려주세요.',
    action: '다시 시도',
  },
  REGION_TOO_SMALL: {
    stage: 'region',
    message: '지정한 영역이 너무 작습니다. 그래프의 축과 눈금까지 함께 감싸도록 조금 넓게 드래그해주세요.',
    action: '영역 다시 잡기',
  },
  REGION_NO_CHART: {
    stage: 'region',
    message: '이 영역에서 라인차트를 찾지 못했습니다. 축과 선이 모두 들어가도록 영역을 다시 잡아주세요.',
    action: '영역 다시 잡기',
  },
  REGION_NO_AXIS: {
    stage: 'region',
    message: '축 눈금을 읽지 못했습니다. 축 숫자가 잘리지 않도록 영역을 조금 넓혀서 다시 시도해주세요.',
    action: '영역 다시 잡기',
  },
  MODEL_CALL_FAILED: {
    stage: 'model',
    message: '판독 요청이 처리되지 않았습니다. 잠시 후 다시 시도해주세요.',
    action: '다시 시도',
  },
  MODEL_TIMEOUT: {
    stage: 'model',
    message: '판독에 시간이 너무 오래 걸렸습니다. 영역을 조금 좁게 잡고 다시 시도해주세요.',
    action: '다시 시도',
  },
  MODEL_BAD_FORMAT: {
    stage: 'model',
    message: '판독 결과를 이해하지 못했습니다. 다시 시도하거나 영역을 다시 잡아주세요.',
    action: '다시 시도',
  },
  MODEL_RATE_LIMITED: {
    stage: 'model',
    message: '요청이 너무 잦습니다. 잠시(1분 정도) 기다렸다가 다시 시도해주세요.',
    action: '다시 시도',
  },
};

// 알 수 없는 코드가 들어와도 화면이 깨지지 않도록 기본 문구를 둔다.
const FALLBACK_MESSAGE = '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.';

export function getErrorEntry(code: string): ErrorEntry {
  return (ERROR_TABLE as Record<string, ErrorEntry>)[code] ?? {
    stage: 'model',
    message: FALLBACK_MESSAGE,
    action: '다시 시도',
  };
}

export function makeAppError(code: ErrorCode): AppError {
  return { code, stage: ERROR_TABLE[code].stage };
}
