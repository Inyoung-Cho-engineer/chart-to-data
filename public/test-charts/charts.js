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

    // X 눈금 5칸
    for (let i = 0; i <= 5; i++) {
      const v = xMin + ((xMax - xMin) * i) / 5;
      const px = PLOT.x + (PLOT.w * i) / 5;
      ctx.beginPath();
      ctx.moveTo(px, PLOT.y + PLOT.h);
      ctx.lineTo(px, PLOT.y + PLOT.h + 6);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(String(+v.toFixed(3)), px, PLOT.y + PLOT.h + 22);
    }
    // Y 눈금
    if (yLog) {
      const decades = Math.round(Math.log10(yMax) - Math.log10(yMin));
      for (let d = 0; d <= decades; d++) {
        const v = yMin * Math.pow(10, d);
        const py = PLOT.y + PLOT.h - (PLOT.h * d) / decades;
        ctx.beginPath();
        ctx.moveTo(PLOT.x - 6, py);
        ctx.lineTo(PLOT.x, py);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(String(+v.toPrecision(3)), PLOT.x - 10, py + 4);
      }
    } else {
      for (let i = 0; i <= 5; i++) {
        const v = yMin + ((yMax - yMin) * i) / 5;
        const py = PLOT.y + PLOT.h - (PLOT.h * i) / 5;
        ctx.beginPath();
        ctx.moveTo(PLOT.x - 6, py);
        ctx.lineTo(PLOT.x, py);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(String(+v.toFixed(2)), PLOT.x - 10, py + 4);
      }
    }

    ctx.textAlign = 'center';
    ctx.fillText(xUnit, PLOT.x + PLOT.w / 2, PLOT.y + PLOT.h + 44);
    ctx.save();
    ctx.translate(30, PLOT.y + PLOT.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yUnit, 0, 0);
    ctx.restore();
  }

  function drawGrid(ctx) {
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const px = PLOT.x + (PLOT.w * i) / 5;
      ctx.beginPath();
      ctx.moveTo(px, PLOT.y);
      ctx.lineTo(px, PLOT.y + PLOT.h);
      ctx.stroke();
      const py = PLOT.y + (PLOT.h * i) / 5;
      ctx.beginPath();
      ctx.moveTo(PLOT.x, py);
      ctx.lineTo(PLOT.x + PLOT.w, py);
      ctx.stroke();
    }
  }

  // 값 → 픽셀
  function makeToPx(spec) {
    const { xMin, xMax, yMin, yMax, yLog } = spec;
    return (xv, yv) => {
      const tx = (xv - xMin) / (xMax - xMin);
      const ty = yLog
        ? (Math.log10(yv) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))
        : (yv - yMin) / (yMax - yMin);
      return [PLOT.x + PLOT.w * tx, PLOT.y + PLOT.h - PLOT.h * ty];
    };
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

    if (spec.grid) drawGrid(ctx);
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
  ];

  window.CHART_SPECS = CHART_SPECS;
  window.renderChart = render;
  window.CHART_PLOT = { PLOT, W, H };
})();
