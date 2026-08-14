// PLAN.md 28번 — 정답값을 아는 검증용 그래프 정의.
//
// 각 그래프는 수식으로 그리므로 "정답"을 정확히 알고 있고, 언제든 똑같이 다시 만들 수 있다.
// PLAN 29번(오차율·재현율 측정)이 이 정의를 그대로 가져다 쓴다.
//
// 브라우저에서 <script src="/test-charts/charts.js"> 로 불러오면 window.CHART_SPECS 가 생긴다.

(function () {
  const PLOT = { x: 95, y: 70, w: 660, h: 390 };
  const W = 820;
  const H = 560;

  // 축 그리기 (L자 또는 테두리) + 눈금·라벨
  function drawAxes(ctx, spec, opts) {
    const { xMin, xMax, yMin, yMax, xUnit, yUnit, yLog } = spec;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (opts.frame) {
      ctx.rect(PLOT.x, PLOT.y, PLOT.w, PLOT.h);
    } else {
      ctx.moveTo(PLOT.x, PLOT.y);
      ctx.lineTo(PLOT.x, PLOT.y + PLOT.h);
      ctx.lineTo(PLOT.x + PLOT.w, PLOT.y + PLOT.h);
    }
    ctx.stroke();

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 1;

    // 눈금 위치는 값 → 픽셀 변환으로 정한다 — margin이 있으면 테두리보다 안쪽에 찍힌다
    const toPx = makeToPx(spec);

    // X 눈금
    tickValues(spec, 'x').forEach((v) => {
      const px = toPx(v, yMin)[0];
      ctx.beginPath();
      ctx.moveTo(px, PLOT.y + PLOT.h);
      ctx.lineTo(px, PLOT.y + PLOT.h + 6);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(String(+v.toFixed(3)), px, PLOT.y + PLOT.h + 22);
    });

    // Y 눈금
    tickValues(spec, 'y').forEach((v) => {
      const py = toPx(xMin, v)[1];
      ctx.beginPath();
      ctx.moveTo(PLOT.x - 6, py);
      ctx.lineTo(PLOT.x, py);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(yLog ? +v.toPrecision(3) : +v.toFixed(2)), PLOT.x - 10, py + 4);
    });

    ctx.textAlign = 'center';
    ctx.fillText(xUnit, PLOT.x + PLOT.w / 2, PLOT.y + PLOT.h + 44);
    ctx.save();
    ctx.translate(30, PLOT.y + PLOT.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yUnit, 0, 0);
    ctx.restore();
  }

  // 격자선은 눈금 위치에 그린다. 테두리와 겹치는 것(여백이 없을 때의 양 끝)은 건너뛴다.
  function drawGrid(ctx, spec) {
    const toPx = makeToPx(spec);
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 1;

    tickValues(spec, 'x').forEach((v) => {
      const px = toPx(v, spec.yMin)[0];
      if (px <= PLOT.x + 1 || px >= PLOT.x + PLOT.w - 1) return;
      ctx.beginPath();
      ctx.moveTo(px, PLOT.y);
      ctx.lineTo(px, PLOT.y + PLOT.h);
      ctx.stroke();
    });
    tickValues(spec, 'y').forEach((v) => {
      const py = toPx(spec.xMin, v)[1];
      if (py <= PLOT.y + 1 || py >= PLOT.y + PLOT.h - 1) return;
      ctx.beginPath();
      ctx.moveTo(PLOT.x, py);
      ctx.lineTo(PLOT.x + PLOT.w, py);
      ctx.stroke();
    });
  }

  // 값 → 픽셀
  //
  // spec.margin(0~)을 주면 눈금 범위 바깥으로 그만큼 여백을 두고 테두리를 그린다.
  // matplotlib 기본값(5%)과 같은 모양으로, **테두리와 눈금 범위가 다른** 실제 논문 그래프를 흉내 낸다.
  function makeToPx(spec) {
    const { xMin, xMax, yMin, yMax, yLog } = spec;
    const m = spec.margin || 0;
    const lo = (min, max) => min - (max - min) * m;
    const hi = (min, max) => max + (max - min) * m;

    const xLo = lo(xMin, xMax);
    const xHi = hi(xMin, xMax);
    const yLo = yLog ? lo(Math.log10(yMin), Math.log10(yMax)) : lo(yMin, yMax);
    const yHi = yLog ? hi(Math.log10(yMin), Math.log10(yMax)) : hi(yMin, yMax);

    return (xv, yv) => {
      const tx = (xv - xLo) / (xHi - xLo);
      const yRaw = yLog ? Math.log10(yv) : yv;
      const ty = (yRaw - yLo) / (yHi - yLo);
      return [PLOT.x + PLOT.w * tx, PLOT.y + PLOT.h - PLOT.h * ty];
    };
  }

  // 축에 붙일 눈금 값 목록 (5칸)
  function tickValues(spec, axis) {
    if (axis === 'x') {
      return Array.from({ length: 6 }, (_, i) => spec.xMin + ((spec.xMax - spec.xMin) * i) / 5);
    }
    if (spec.yLog) {
      const decades = Math.round(Math.log10(spec.yMax) - Math.log10(spec.yMin));
      return Array.from({ length: decades + 1 }, (_, d) => spec.yMin * Math.pow(10, d));
    }
    return Array.from({ length: 6 }, (_, i) => spec.yMin + ((spec.yMax - spec.yMin) * i) / 5);
  }

  function drawSeries(ctx, spec, series) {
    const toPx = makeToPx(spec);
    ctx.strokeStyle = series.color;
    ctx.lineWidth = series.lineWidth || 2.5;
    ctx.setLineDash(series.dash || []);
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const xv = spec.xMin + ((spec.xMax - spec.xMin) * i) / 400;
      const [px, py] = toPx(xv, series.f(xv));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (series.markers) {
      ctx.fillStyle = series.color;
      for (let i = 0; i <= 10; i++) {
        const xv = spec.xMin + ((spec.xMax - spec.xMin) * i) / 10;
        const [px, py] = toPx(xv, series.f(xv));
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLegend(ctx, spec, inside) {
    const x = inside ? PLOT.x + 20 : PLOT.x + PLOT.w - 150;
    let y = inside ? PLOT.y + 22 : PLOT.y + 20;
    ctx.font = '12px sans-serif';
    spec.series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.lineWidth || 2.5;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 35, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#333';
      ctx.textAlign = 'left';
      ctx.fillText(s.label, x + 42, y + 4);
      y += 20;
    });
  }

  // 그래프 하나를 캔버스에 그린다
  function render(spec, canvas) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'black';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(spec.title, W / 2, 40);

    if (spec.grid) drawGrid(ctx, spec);
    drawAxes(ctx, spec, { frame: !!spec.frame });
    spec.series.forEach((s) => drawSeries(ctx, spec, s));
    if (spec.legend !== 'none') drawLegend(ctx, spec, spec.legend === 'inside');
    return canvas;
  }

  // ─────────────────────────────────────────────────────────────
  // 검증용 그래프 8개 — 각기 다른 위험 요소를 하나씩 담았다
  // ─────────────────────────────────────────────────────────────
  const CHART_SPECS = [
    {
      id: 'c1-basic',
      title: 'C1. Basic Single Line',
      risk: '기본 형태 (기준선)',
      xMin: 0, xMax: 10, yMin: 10, yMax: 60, xUnit: 'Time (s)', yUnit: 'Temp (C)',
      legend: 'none',
      series: [{ id: 's1', label: 'Sample', color: '#1f77b4', f: (x) => 15 + 40 * Math.pow(x / 10, 1.5) }],
    },
    {
      id: 'c2-log',
      title: 'C2. Log Y Axis',
      risk: '로그 축 변환',
      xMin: 0, xMax: 100, yMin: 0.001, yMax: 10, yLog: true, xUnit: 'Load (N)', yUnit: 'Strain',
      legend: 'none',
      series: [{ id: 's1', label: 'Strain', color: '#1f77b4', f: (x) => 0.002 * Math.pow(10, (3 * x) / 100) }],
    },
    {
      id: 'c3-dashed-cross',
      title: 'C3. Solid and Dashed, Crossing',
      risk: '점선 + 두 선이 교차',
      xMin: 0, xMax: 20, yMin: 40, yMax: 58, xUnit: 'Time (min)', yUnit: 'Response',
      legend: 'inside',
      series: [
        { id: 's1', label: 'Measured', color: '#1f77b4', f: (x) => 49 + 6 * Math.sin((x / 20) * Math.PI * 2) },
        { id: 's2', label: 'Predicted', color: '#ff7f0e', dash: [8, 6], f: (x) => 47 + 5 * Math.sin((x / 20) * Math.PI * 2 + 1.0) },
      ],
    },
    {
      id: 'c4-three-series',
      title: 'C4. Three Series',
      risk: '계열 3개 (색 구분)',
      xMin: 0, xMax: 50, yMin: 0, yMax: 100, xUnit: 'Cycle', yUnit: 'Capacity (%)',
      legend: 'outside',
      series: [
        { id: 's1', label: 'Type A', color: '#1f77b4', f: (x) => 95 - 0.8 * x },
        { id: 's2', label: 'Type B', color: '#d62728', f: (x) => 90 - 1.2 * x + 0.008 * x * x },
        { id: 's3', label: 'Type C', color: '#2ca02c', f: (x) => 85 - 0.4 * x },
      ],
    },
    {
      id: 'c5-grayscale',
      title: 'C5. Grayscale Dashed (known weak spot)',
      risk: '흑백 점선 — 색으로 구분 불가',
      xMin: 0, xMax: 10, yMin: 0, yMax: 5, xUnit: 'Distance (mm)', yUnit: 'Signal',
      legend: 'outside',
      series: [
        { id: 's1', label: 'Solid', color: '#000000', f: (x) => 1 + 0.3 * x },
        { id: 's2', label: 'Dashed', color: '#666666', dash: [10, 6], f: (x) => 4 - 0.25 * x },
      ],
    },
    {
      id: 'c6-markers',
      title: 'C6. Line with Markers',
      risk: '데이터 마커가 찍힌 선',
      xMin: 0, xMax: 10, yMin: 10, yMax: 60, xUnit: 'Time (s)', yUnit: 'Temp (C)',
      legend: 'outside',
      series: [{ id: 's1', label: 'Measured', color: '#1f77b4', markers: true, f: (x) => 12 + 4.6 * x }],
    },
    {
      id: 'c7-grid-frame',
      title: 'C7. Gridlines and Full Frame',
      risk: '격자선 + 사각 테두리',
      xMin: 0, xMax: 10, yMin: 0, yMax: 20, xUnit: 'X', yUnit: 'Y',
      grid: true, frame: true, legend: 'outside',
      series: [{ id: 's1', label: 'Curve', color: '#9467bd', f: (x) => 4 + 12 * Math.pow(x / 10, 2) }],
    },
    {
      id: 'c8-steep',
      title: 'C8. Steep Curve near Axis Limits',
      risk: '축 끝에 붙는 급한 곡선',
      xMin: 0, xMax: 5, yMin: 0, yMax: 100, xUnit: 'Voltage (V)', yUnit: 'Current (mA)',
      legend: 'none',
      series: [{ id: 's1', label: 'I-V', color: '#e377c2', f: (x) => Math.min(98, 2 + 1.6 * Math.pow(x, 3.2)) }],
    },

    // ───────────────────────────────────────────────────────────
    // R1~R4 — 실제 논문에 실리는 모양 (2026-08-14 추가)
    //
    // C1~C8은 테두리가 곧 축 최솟값~최댓값이라, "테두리 ≠ 눈금 범위"인 실제 그래프에서
    // 값이 크게 틀어지는 문제를 잡아내지 못했다. matplotlib 기본값처럼 양옆에 5% 여백을 둔
    // 그래프를 추가해 그 경우를 검사한다.
    // ───────────────────────────────────────────────────────────
    {
      id: 'r1-margin-two-series',
      title: 'R1. Margins, Grid, Legend Inside (paper style)',
      risk: '테두리보다 눈금이 안쪽 + 그래프 안 범례',
      xMin: 0, xMax: 20, yMin: 1, yMax: 7, xUnit: 'Time (s)', yUnit: 'Value',
      margin: 0.08, grid: true, frame: true, legend: 'inside',
      series: [
        { id: 's1', label: 'Condition-A', color: '#1f77b4', lineWidth: 2, f: (x) => Math.exp(0.1 * x) },
        { id: 's2', label: 'Condition-B', color: '#ff7f0e', lineWidth: 2, f: (x) => 0.65 * Math.exp(0.0915 * x) },
      ],
    },
    {
      id: 'r2-margin-log',
      title: 'R2. Margins with Log Y Axis',
      risk: '여백 + 로그 축',
      xMin: 0, xMax: 100, yMin: 0.01, yMax: 100, yLog: true, xUnit: 'Load (N)', yUnit: 'Strain',
      margin: 0.05, grid: true, frame: true, legend: 'none',
      series: [{ id: 's1', label: 'Strain', color: '#2ca02c', lineWidth: 2, f: (x) => 0.02 * Math.pow(10, (3 * x) / 100) }],
    },
    {
      id: 'r3-margin-overshoot',
      title: 'R3. Curve Rising Above the Top Tick',
      risk: '곡선이 최댓값 눈금 위로 올라감 (여백 안)',
      xMin: 0, xMax: 10, yMin: 0, yMax: 50, xUnit: 'X', yUnit: 'Y',
      margin: 0.05, grid: true, frame: true, legend: 'none',
      series: [{ id: 's1', label: 'Curve', color: '#d62728', lineWidth: 2, f: (x) => 1 + 0.05 * x * x * x }],
    },
    {
      id: 'r4-margin-thin-lines',
      title: 'R4. Thin Lines, Three Series, Margins',
      risk: '얇은 선 3개 + 여백 (색 구분이 어려운 조건)',
      xMin: 0, xMax: 50, yMin: 0, yMax: 100, xUnit: 'Cycle', yUnit: 'Capacity (%)',
      margin: 0.05, grid: true, frame: true, legend: 'outside',
      series: [
        { id: 's1', label: 'Type A', color: '#1f77b4', lineWidth: 1.2, f: (x) => 95 - 0.8 * x },
        { id: 's2', label: 'Type B', color: '#d62728', lineWidth: 1.2, f: (x) => 90 - 1.2 * x + 0.008 * x * x },
        { id: 's3', label: 'Type C', color: '#2ca02c', lineWidth: 1.2, f: (x) => 85 - 0.4 * x },
      ],
    },
  ];

  window.CHART_SPECS = CHART_SPECS;
  window.renderChart = render;
  window.CHART_PLOT = { PLOT, W, H };
})();
