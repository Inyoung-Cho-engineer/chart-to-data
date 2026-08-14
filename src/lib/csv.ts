// DESIGN.md §4.2 #11 — 추출 결과를 CSV로 만든다. 상단 주석 헤더로 검증 근거를 남긴다.

import type { AxisInfo, DataPoint } from './types';

interface CsvMeta {
  fileName: string;
  seriesLabel: string;
  xAxis: AxisInfo;
  yAxis: AxisInfo;
}

const BOM = '﻿'; // 엑셀에서 한글이 깨지지 않도록 붙인다 (DESIGN.md §8.2)

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(points: DataPoint[], meta: CsvMeta): string {
  const header = [
    `# file: ${meta.fileName}`,
    `# series: ${meta.seriesLabel}`,
    `# x-axis: ${meta.xAxis.type} ${meta.xAxis.min}~${meta.xAxis.max} ${meta.xAxis.unit}`,
    `# y-axis: ${meta.yAxis.type} ${meta.yAxis.min}~${meta.yAxis.max} ${meta.yAxis.unit}`,
    `# extracted-at: ${new Date().toISOString()}`,
  ].join('\n');

  const rows = [
    ['번호', 'X', '추출값', '신뢰도', '상태', '구분'].join(','),
    ...points.map((p, i) =>
      [
        p.source === 'user_query' ? '추가질의' : String(i + 1),
        p.x != null ? String(p.x) : '',
        p.y != null ? String(p.y) : '',
        p.confidence,
        p.needsCheck ? '확인 필요' : '정상',
        p.source === 'grid' ? '균등추출' : '추가질의',
      ]
        .map(csvEscape)
        .join(',')
    ),
  ];

  return `${header}\n${rows.join('\n')}`;
}

export function downloadCsv(csvContent: string, fileName: string) {
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
