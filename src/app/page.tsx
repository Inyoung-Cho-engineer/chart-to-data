import { AxisPanel } from "@/components/AxisPanel";
import { ExtractPanel } from "@/components/ExtractPanel";
import { ImageViewer } from "@/components/ImageViewer";
import { RegionPanel } from "@/components/RegionPanel";
import { ResultTable } from "@/components/ResultTable";
import { SeriesPanel } from "@/components/SeriesPanel";
import { UploadPanel } from "@/components/UploadPanel";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">chart-to-data</h1>
      <div className="flex w-full max-w-5xl flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
        <ImageViewer />
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <UploadPanel />
          <RegionPanel />
          <AxisPanel />
          <SeriesPanel />
          <ExtractPanel />
        </div>
      </div>
      <ResultTable />
    </main>
  );
}
