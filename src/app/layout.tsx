import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "chart-to-data",
  description: "논문·보고서 라인차트에서 좌표값을 추출해 기준값과 비교하는 설계 검증 보조 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
