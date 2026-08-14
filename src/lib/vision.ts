// 서버 전용 모듈 — OpenAI 비전 모델을 쓰는 코드는 반드시 이 파일(과 app/api/*/route.ts)에서만 다룬다.
// Next.js 서버 컴포넌트·라우트 핸들러에서만 import해서 쓴다. 브라우저로 값이 넘어가지 않는다.

import OpenAI from 'openai';

export function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았습니다. my-app/.env 파일에 키를 추가해주세요."
    );
  }
  return key;
}

// 화면에 키 값을 노출하지 않고 "설정되어 있는지"만 알려줄 때 쓴다.
export function hasOpenAIApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    // maxRetries: 0 — SDK 기본값(2회)이 켜져 있으면 타임아웃으로 끊어도 재시도가 이어져
    // 실패 하나당 최대 3배 요금이 나갈 수 있다. 재시도는 상위(withAbortTimeout)에서 다루지 않는다.
    client = new OpenAI({ apiKey: getOpenAIApiKey(), maxRetries: 0 });
  }
  return client;
}

// DESIGN.md §6.1 응답 모양(plotBox·xAxis·yAxis·series·crossings)을 설명하는 프롬프트.
// 응답 형식은 schema.ts(Zod)로 서버에서 엄격히 검사한다 — 여기서 어긋나면 MODEL_BAD_FORMAT으로 처리된다.
const ANALYZE_PROMPT = `당신은 논문·보고서에 실린 라인차트 이미지를 분석하는 도구입니다.
주어진 이미지를 보고 아래 정보를 JSON 객체 하나로만 답하세요. 다른 설명은 붙이지 마세요.

- chartFound: 이미지 안에 라인차트(꺾은선 그래프)가 있으면 true, 없거나 알아볼 수 없으면 false.
  false인 경우 chartFound만 담은 { "chartFound": false } 로 답하고 다른 필드는 넣지 마세요.

chartFound가 true일 때만 아래 필드도 함께 답하세요.

- plotBox: 눈금·라벨을 제외한, 실제 선이 그려지는 안쪽 영역의 위치.
  이미지 좌상단을 (0,0), 우하단을 (1,1)로 하는 정규화 좌표로 { "x0", "y0", "x1", "y1" } (x0<x1, y0<y1)
- xAxis, yAxis: 각각 { "type": "linear" 또는 "log" 또는 "unknown", "min": 숫자, "max": 숫자, "unit": 문자열 }
  축 눈금 숫자를 읽어 min/max를 정하고, 로그/선형 여부를 판단할 수 없으면 "unknown"으로 답하세요.
- series: 그래프 안의 선(계열) 목록. 각 항목은 { "id", "label", "colorHex" }. id는 "s1", "s2"처럼 붙이세요.
- crossings: 계열끼리 서로 교차하는 지점 목록. 각 항목은 { "tx": 0~1 사이 가로 위치, "seriesIds": [교차하는 두 계열의 id] }
  교차가 없으면 빈 배열로 답하세요.

확실하지 않은 값을 임의로 지어내지 말고, 이미지에서 실제로 읽을 수 있는 값만 답하세요.`;

export async function analyzeChartImage(imageDataUrl: string, signal?: AbortSignal): Promise<unknown> {
  const openai = getClient();

  const response = await openai.chat.completions.create(
    {
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYZE_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    },
    { signal }
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('모델 응답이 비어 있습니다.');
  }

  return JSON.parse(content);
}

