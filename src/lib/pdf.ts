// PDF 파일을 브라우저에서 직접 다루는 곳 — 원본 PDF가 서버로 나가지 않는다 (DESIGN.md §8.2).
// pdfjs-dist는 모듈 맨 위에서 브라우저 전용 기능(DOMMatrix 등)을 바로 참조하기 때문에,
// Next.js가 이 컴포넌트를 서버에서 미리 그릴 때(SSR) 함께 실행되면 오류가 난다.
// 그래서 최상단에서 import하지 않고, 실제로 함수가 호출될 때(=브라우저에서 파일을 고른 뒤)만 불러온다.

// 페이지를 그릴 때 긴 변이 이 정도 픽셀이 되도록 배율을 정한다.
//
// 왜 이렇게 크게 그리나: 배율 1.5로 그리면 논문 속 작은 그래프의 선이 1픽셀도 안 되게 그려져
// 안티에일리어싱으로 흰색과 섞여버린다. 실측(2026-08-14)에서 파란 계열(#1f77b4)의 실제 색이
// 그래프 전체에 6픽셀밖에 남지 않아, 색으로 선을 따라가는 방식이 축 선을 데이터로 오인했다.
// 긴 변 3000픽셀로 그리면 같은 그래프에서 1369픽셀이 남아 색 구분이 확실해진다.
const TARGET_LONG_SIDE = 3000;
const MIN_SCALE = 1.5;
const MAX_SCALE = 6; // 지나치게 큰 캔버스로 브라우저가 멈추는 것을 막는 상한

export interface LoadedPdf {
  numPages: number;
  renderPageToDataUrl: (pageNumber: number) => Promise<string>;
}

// PDF를 한 번만 읽어서 페이지 수 확인과 페이지 그림 변환을 모두 할 수 있게 한다
// (검사와 표시를 따로 할 때마다 PDF를 다시 파싱하지 않도록).
export async function loadPdf(file: File): Promise<LoadedPdf> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const buffer = await file.arrayBuffer();
  // wasmUrl — 2026-08-14 실측: 이게 없으면 JBIG2·JPEG2000으로 압축된 스캔 이미지(실제 논문에서
  // 흔함)가 그래프째로 통째로 빈 흰 화면이 된다. pdfjs-dist v6은 이런 이미지를 디코딩하는 데
  // wasm 파일이 필요한데, 기본값이 상대경로 "wasm"이라 Next.js에서 못 찾아 콘솔에
  // "Jbig2Error: JBig2 failed to initialize"를 남기고 그 XObject(이미지)를 조용히 건너뛴다.
  // public/pdfjs-wasm/에 wasm 파일을 미리 복사해두고 정적 경로로 알려준다.
  const doc = await pdfjsLib.getDocument({ data: buffer, wasmUrl: '/pdfjs-wasm/' }).promise;

  return {
    numPages: doc.numPages,
    async renderPageToDataUrl(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, TARGET_LONG_SIDE / Math.max(base.width, base.height))
      );
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('캔버스 컨텍스트를 만들지 못했습니다.');
      }

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/png');
    },
  };
}
