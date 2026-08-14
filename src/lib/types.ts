// 앱 전체가 함께 쓰는 타입 정의. DESIGN.md §5.1을 그대로 코드로 옮긴 것이다.
// 이 파일은 값을 계산하지 않는다 — 모양만 정의한다. 실제 계산은 axis.ts에서 한다.

// 축 하나의 정보 — AI가 제안하고 사용자가 확정한다
export interface AxisInfo {
  type: 'linear' | 'log' | 'unknown'; // unknown이면 사용자가 직접 골라야 함
  min: number;
  max: number;
  unit: string;
  confirmedByUser: boolean; // 이게 true가 아니면 추출 단계로 못 넘어감
}

// 그래프 안의 선 하나
export interface Series {
  id: string;
  label: string; // 범례에서 읽은 이름 (없으면 "계열 1")
  colorHex: string; // 화면에 견본으로 보여줄 색
}

// AI가 돌려주는 원자료 — plotBox 안에서의 상대 위치만 담는다 (0~1)
// 좌표 기준: plotBox는 이미지(잘라낸 조각) 좌상단이 (0,0)인 정규화 좌표 (x0=왼쪽, y0=위쪽 / x1=오른쪽, y1=아래쪽)
export interface RawPoint {
  tx: number; // 앱이 미리 계산해 요청에 실은 값을 그대로 붙여 보관 (0=plotBox 왼쪽, 1=오른쪽)
  ty: number; // 모델이 답한 값. 축 관례대로 0=plotBox 아래쪽, 1=위쪽
  // 환산식: ty = (y1_pix − yPix) / (y1_pix − y0_pix)
  confidence: 'high' | 'medium' | 'low';
}

// 앱이 변환식을 적용해 만든 최종 좌표
export interface DataPoint {
  tx: number; // plotBox 내 가로 위치 (0~1) — 계열 교차 판정에 사용
  x: number | null; // 실제 X값. 범위를 크게 벗어나 계산하지 않은 경우 null
  y: number | null; // 실제 Y값. 범위를 크게 벗어나 계산하지 않은 경우 null
  confidence: 'high' | 'medium' | 'low';
  needsCheck: boolean;
  checkReason?: 'low_confidence' | 'crossing' | 'out_of_range';
  source: 'grid' | 'user_query'; // 균등 50지점인지, 사용자가 추가로 물어본 값인지
}

// 화면에 띄울 실패 상태 하나 — 코드별 안내 문구는 errors.ts(5번 작업)에서 정의한다 (DESIGN.md §6.4·§7)
export interface AppError {
  code: string; // 예: 'FILE_SIZE', 'REGION_NO_CHART', 'MODEL_TIMEOUT'
  stage: 'file' | 'region' | 'model';
}

// 이미지 위 사각 영역 — 좌상단이 (0,0)인 정규화 좌표 (DESIGN.md §5.2)
export interface NormalizedRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// 눈금 위치 보정값 — "축의 최솟값·최댓값 눈금이 plotBox 안 어디에 있는가"
//
// 왜 필요한가: 실제 논문 그래프는 **테두리와 눈금 범위가 다르다.**
// matplotlib 기본값은 데이터 양옆에 5% 여백을 두므로, 예를 들어 눈금이 1~7인 그래프라도
// 테두리 위쪽은 7.7, 아래쪽은 0.27쯤에 해당한다. 테두리를 그대로 1~7로 보면
// 아래쪽에서 최대 57%까지 값이 틀어진다(2026-08-14 실측).
// 그래서 눈금 표시(tick)를 픽셀에서 찾아 "어디가 최솟값이고 어디가 최댓값인지"를 따로 잰다.
//
// 값은 plotBox 기준 0~1이며, 축 관례대로 x는 왼쪽이 0, y는 **아래쪽이 0**이다.
// 눈금을 못 찾으면 {0,1,0,1} — 즉 테두리를 그대로 쓰는 예전 동작이 된다.
export interface AxisCalibration {
  xMinT: number;
  xMaxT: number;
  yMinT: number;
  yMaxT: number;
}

export const IDENTITY_CALIBRATION: AxisCalibration = {
  xMinT: 0,
  xMaxT: 1,
  yMinT: 0,
  yMaxT: 1,
};
