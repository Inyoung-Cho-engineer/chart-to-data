// PDF 파일을 브라우저에서 직접 다루는 곳 — 원본 PDF가 서버로 나가지 않는다 (DESIGN.md §8.2).
// pdfjs-dist는 모듈 맨 위에서 브라우저 전용 기능(DOMMatrix 등)을 바로 참조하기 때문에,
// Next.js가 이 컴포넌트를 서버에서 미리 그릴 때(SSR) 함께 실행되면 오류가 난다.
// 그래서 최상단에서 import하지 않고, 실제로 함수가 호출될 때(=브라우저에서 파일을 고른 뒤)만 불러온다.

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
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  return {
    numPages: doc.numPages,
    async renderPageToDataUrl(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 4 });

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
