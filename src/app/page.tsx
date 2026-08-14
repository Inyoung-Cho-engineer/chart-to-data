'use client';

// 순수 스타일링 개편: 단계 표시(StepIndicator)와 완료된 단계 접기(StepSection)를 추가해
// 업로드→영역지정→축확인→계열선택→추출 흐름이 한눈에 보이도록 재구성했다.
// 비즈니스 로직은 각 Panel 컴포넌트 안에 그대로 있고, 여기서는 store 값을 읽어 "어느 단계인지"만 판단한다.

import { AxisPanel } from "@/components/AxisPanel";
import { ExtractPanel } from "@/components/ExtractPanel";
import { ImageViewer } from "@/components/ImageViewer";
import { RegionPanel } from "@/components/RegionPanel";
import { ResultTable } from "@/components/ResultTable";
import { SeriesPanel } from "@/components/SeriesPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { StepIndicator, StepSection } from "@/components/StepFlow";
import { useSessionStore } from "@/store/session";

export default function Home() {
  const file = useSessionStore((s) => s.file);
  const xAxis = useSessionStore((s) => s.xAxis);
  const yAxis = useSessionStore((s) => s.yAxis);
  const selectedSeriesId = useSessionStore((s) => s.selectedSeriesId);
  const seriesList = useSessionStore((s) => s.seriesList);

  const uploadDone = Boolean(file);
  const regionDone = Boolean(xAxis && yAxis);
  const axisDone = Boolean(xAxis?.confirmedByUser && yAxis?.confirmedByUser);
  const seriesDone = Boolean(selectedSeriesId);

  const currentStep = !uploadDone ? 1 : !regionDone ? 2 : !axisDone ? 3 : !seriesDone ? 4 : 5;
  const selectedSeries = seriesList.find((s) => s.id === selectedSeriesId);

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold text-navy">chart-to-data</h1>
      <StepIndicator currentStep={currentStep} />

      <div className="flex w-full max-w-5xl flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
        <ImageViewer />
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <StepSection
            step={1}
            title="① 파일 업로드"
            done={uploadDone}
            summary={file ? `✓ 파일: ${file.name}` : undefined}
          >
            <UploadPanel />
          </StepSection>

          <StepSection
            step={2}
            title="② 영역 지정 및 분석"
            done={axisDone}
            summary="✓ 영역 지정 및 분석 완료"
          >
            <RegionPanel />
          </StepSection>

          <StepSection
            step={3}
            title="③ 축 확인"
            done={axisDone}
            summary={
              xAxis && yAxis
                ? `✓ 축 확인 완료 (X ${xAxis.min}~${xAxis.max}, Y ${yAxis.min}~${yAxis.max})`
                : undefined
            }
          >
            <AxisPanel />
          </StepSection>

          <StepSection
            step={4}
            title="④ 계열 선택"
            done={seriesDone}
            summary={selectedSeries ? `✓ 계열 선택: ${selectedSeries.label}` : undefined}
          >
            <SeriesPanel />
          </StepSection>

          <StepSection step={5} title="⑤ 좌표 추출" done={false}>
            <ExtractPanel />
          </StepSection>
        </div>
      </div>
      <ResultTable />
    </main>
  );
}
