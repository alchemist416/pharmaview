'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShortageYear {
  year: number;
  count: number;
}

interface RecallWarningYear {
  year: number;
  recalls: number;
  warning_letters: number;
}

interface Recession {
  start: string;
  end: string;
  label: string;
}

interface RateYear {
  year: number;
  rate: number;
}

interface FreightYear {
  year: number;
  index: number;
}

interface GeoEvent {
  date: string;
  label: string;
  type: string;
  detail: string;
}

interface MfgGeoYear {
  year: number;
  'United States': number;
  Europe: number;
  India: number;
  China: number;
  'Rest of World': number;
}

interface RegMilestone {
  date: string;
  label: string;
  detail: string;
}

interface AtlasData {
  shortages: ShortageYear[];
  recallsWarnings: RecallWarningYear[];
  recessions: Recession[];
  usdInr: RateYear[];
  freight: FreightYear[];
  geoEvents: GeoEvent[];
  mfgGeo: MfgGeoYear[];
  regulatory: RegMilestone[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0a0e1a',
  panel: '#0f1629',
  border: '#1e293b',
  green: '#00ff88',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#a855f7',
  cyan: '#06b6d4',
  muted: '#64748b',
  text: '#e2e8f0',
  dimText: '#94a3b8',
  white: '#f8fafc',
  // Geo event types
  conflict: '#ef4444',
  sanctions: '#f59e0b',
  pandemic: '#a855f7',
  economic: '#3b82f6',
  natural_disaster: '#06b6d4',
  quality: '#f97316',
  // Mfg regions
  us: '#3b82f6',
  europe: '#06b6d4',
  india: '#f59e0b',
  china: '#ef4444',
  row: '#64748b',
};

const YEAR_START = 1995;
const YEAR_END = 2025;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DisruptionAtlas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<AtlasData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch all data
  useEffect(() => {
    async function load() {
      try {
        const [shortageRes, macroRes, geoRes, mfgRes, regRes] = await Promise.all([
          fetch('/data/atlas-shortage-history.json'),
          fetch('/data/atlas-macro.json'),
          fetch('/data/atlas-geopolitical.json'),
          fetch('/data/atlas-manufacturing-geo.json'),
          fetch('/data/atlas-regulatory.json'),
        ]);

        const shortageData = await shortageRes.json();
        const macroData = await macroRes.json();
        const geoData = await geoRes.json();
        const mfgData = await mfgRes.json();
        const regData = await regRes.json();

        setData({
          shortages: shortageData.shortages_per_year,
          recallsWarnings: shortageData.recalls_warnings_per_year,
          recessions: macroData.recessions,
          usdInr: macroData.usd_inr,
          freight: macroData.freight_index,
          geoEvents: geoData.events,
          mfgGeo: mfgData.data,
          regulatory: regData.milestones,
        });
      } catch (e) {
        console.error('Failed to load atlas data', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Tooltip helper
  const showTooltip = useCallback(
    (html: string, event: MouseEvent) => {
      const tip = tooltipRef.current;
      if (!tip) return;
      tip.innerHTML = html;
      tip.style.opacity = '1';
      tip.style.left = `${event.pageX + 14}px`;
      tip.style.top = `${event.pageY - 28}px`;
    },
    []
  );

  const hideTooltip = useCallback(() => {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.style.opacity = '0';
  }, []);

  // D3 render
  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const totalWidth = Math.max(container.clientWidth, 1200);
    const margin = { top: 40, right: 30, bottom: 50, left: 70 };
    const trackGap = 12;
    const trackHeights = [130, 110, 130, 100, 130, 80]; // 6 tracks
    const totalTrackHeight = trackHeights.reduce((a, b) => a + b, 0) + trackGap * (trackHeights.length - 1);
    const totalHeight = margin.top + totalTrackHeight + margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', totalWidth).attr('height', totalHeight);

    const chartWidth = totalWidth - margin.left - margin.right;

    // Shared x-scale
    const x = d3
      .scaleLinear()
      .domain([YEAR_START, YEAR_END])
      .range([0, chartWidth]);

    const xTime = (dateStr: string) => {
      const [y, m] = dateStr.split('-').map(Number);
      return x(y + (m - 1) / 12);
    };

    // Compute track y-offsets
    const trackY: number[] = [];
    let yOff = margin.top;
    for (let i = 0; i < trackHeights.length; i++) {
      trackY.push(yOff);
      yOff += trackHeights[i] + trackGap;
    }

    const g = svg.append('g').attr('transform', `translate(${margin.left}, 0)`);

    // Shared x-axis at bottom
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0, ${totalHeight - margin.bottom})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(d3.range(YEAR_START, YEAR_END + 1, 5))
          .tickFormat((d) => String(d))
      );
    xAxisG.selectAll('text').attr('fill', COLORS.dimText).attr('font-size', '11px').attr('font-family', 'monospace');
    xAxisG.selectAll('line').attr('stroke', COLORS.border);
    xAxisG.select('.domain').attr('stroke', COLORS.border);

    // Grid lines
    const gridYears = d3.range(YEAR_START, YEAR_END + 1, 5);
    g.selectAll('.grid-line')
      .data(gridYears)
      .enter()
      .append('line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', margin.top - 10)
      .attr('y2', totalHeight - margin.bottom)
      .attr('stroke', COLORS.border)
      .attr('stroke-dasharray', '2,4')
      .attr('opacity', 0.5);

    // Helper: track label
    function drawTrackLabel(trackIndex: number, label: string) {
      svg
        .append('text')
        .attr('x', 8)
        .attr('y', trackY[trackIndex] + 14)
        .attr('fill', COLORS.green)
        .attr('font-size', '10px')
        .attr('font-family', 'monospace')
        .attr('font-weight', '600')
        .attr('letter-spacing', '0.05em')
        .text(label.toUpperCase());
    }

    // Helper: track border
    function drawTrackBorder(trackIndex: number) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', chartWidth)
        .attr('y1', trackY[trackIndex] - 4)
        .attr('y2', trackY[trackIndex] - 4)
        .attr('stroke', COLORS.border)
        .attr('stroke-width', 0.5);
    }

    // -----------------------------------------------------------------------
    // TRACK 1: FDA Drug Shortage Volume (area chart, red)
    // -----------------------------------------------------------------------
    {
      const tIdx = 0;
      const h = trackHeights[tIdx];
      const yTop = trackY[tIdx];
      drawTrackLabel(tIdx, 'FDA Drug Shortages');
      drawTrackBorder(tIdx);

      const yScale = d3
        .scaleLinear()
        .domain([0, d3.max(data.shortages, (d) => d.count)! * 1.1])
        .range([yTop + h, yTop + 18]);

      const area = d3
        .area<ShortageYear>()
        .x((d) => x(d.year))
        .y0(yTop + h)
        .y1((d) => yScale(d.count))
        .curve(d3.curveMonotoneX);

      const line = d3
        .line<ShortageYear>()
        .x((d) => x(d.year))
        .y((d) => yScale(d.count))
        .curve(d3.curveMonotoneX);

      // Gradient
      const grad = svg.append('defs').append('linearGradient').attr('id', 'shortage-grad').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
      grad.append('stop').attr('offset', '0%').attr('stop-color', COLORS.red).attr('stop-opacity', 0.6);
      grad.append('stop').attr('offset', '100%').attr('stop-color', COLORS.red).attr('stop-opacity', 0.05);

      g.append('path').datum(data.shortages).attr('d', area).attr('fill', 'url(#shortage-grad)');
      g.append('path').datum(data.shortages).attr('d', line).attr('fill', 'none').attr('stroke', COLORS.red).attr('stroke-width', 2);

      // Dots
      g.selectAll('.shortage-dot')
        .data(data.shortages)
        .enter()
        .append('circle')
        .attr('cx', (d) => x(d.year))
        .attr('cy', (d) => yScale(d.count))
        .attr('r', 3)
        .attr('fill', COLORS.red)
        .attr('stroke', COLORS.bg)
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
          d3.select(this).attr('r', 5);
          showTooltip(`<strong>${d.year}</strong><br/>${d.count} new shortages`, event);
        })
        .on('mouseout', function () {
          d3.select(this).attr('r', 3);
          hideTooltip();
        });

      // Y-axis ticks
      const yAxis = d3.axisLeft(yScale).ticks(4).tickSize(-chartWidth);
      const yAxisG = g.append('g').attr('transform', 'translate(0,0)').call(yAxis);
      yAxisG.selectAll('text').attr('fill', COLORS.dimText).attr('font-size', '9px').attr('font-family', 'monospace');
      yAxisG.selectAll('line').attr('stroke', COLORS.border).attr('stroke-dasharray', '1,3').attr('opacity', 0.3);
      yAxisG.select('.domain').remove();
    }

    // -----------------------------------------------------------------------
    // TRACK 2: FDA Recalls + Warning Letters (bar chart, amber)
    // -----------------------------------------------------------------------
    {
      const tIdx = 1;
      const h = trackHeights[tIdx];
      const yTop = trackY[tIdx];
      drawTrackLabel(tIdx, 'Recalls & Warning Letters');
      drawTrackBorder(tIdx);

      const maxRecalls = d3.max(data.recallsWarnings, (d) => d.recalls)! * 1.1;
      const yScale = d3.scaleLinear().domain([0, maxRecalls]).range([yTop + h, yTop + 18]);

      const barWidth = Math.max(chartWidth / (YEAR_END - YEAR_START + 1) - 2, 4);

      // Recalls bars
      g.selectAll('.recall-bar')
        .data(data.recallsWarnings)
        .enter()
        .append('rect')
        .attr('x', (d) => x(d.year) - barWidth / 2)
        .attr('y', (d) => yScale(d.recalls))
        .attr('width', barWidth)
        .attr('height', (d) => yTop + h - yScale(d.recalls))
        .attr('fill', COLORS.amber)
        .attr('opacity', 0.7)
        .attr('rx', 1)
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
          d3.select(this).attr('opacity', 1);
          showTooltip(
            `<strong>${d.year}</strong><br/>Recalls: ${d.recalls.toLocaleString()}<br/>Warning Letters: ${d.warning_letters}`,
            event
          );
        })
        .on('mouseout', function () {
          d3.select(this).attr('opacity', 0.7);
          hideTooltip();
        });

      // Warning letter overlay line
      const wlMax = d3.max(data.recallsWarnings, (d) => d.warning_letters)! * 1.2;
      const yWl = d3.scaleLinear().domain([0, wlMax]).range([yTop + h, yTop + 18]);

      const wlLine = d3
        .line<RecallWarningYear>()
        .x((d) => x(d.year))
        .y((d) => yWl(d.warning_letters))
        .curve(d3.curveMonotoneX);

      g.append('path').datum(data.recallsWarnings).attr('d', wlLine).attr('fill', 'none').attr('stroke', COLORS.red).attr('stroke-width', 1.5).attr('stroke-dasharray', '4,2');

      // Y-axis
      const yAxis = d3.axisLeft(yScale).ticks(3).tickSize(-chartWidth);
      const yAxisG = g.append('g').call(yAxis);
      yAxisG.selectAll('text').attr('fill', COLORS.dimText).attr('font-size', '9px').attr('font-family', 'monospace');
      yAxisG.selectAll('line').attr('stroke', COLORS.border).attr('stroke-dasharray', '1,3').attr('opacity', 0.3);
      yAxisG.select('.domain').remove();
    }

    // -----------------------------------------------------------------------
    // TRACK 3: Macro Overlays (recession bands, USD/INR, freight index)
    // -----------------------------------------------------------------------
    {
      const tIdx = 2;
      const h = trackHeights[tIdx];
      const yTop = trackY[tIdx];
      drawTrackLabel(tIdx, 'Macro Environment');
      drawTrackBorder(tIdx);

      // Recession bands
      data.recessions.forEach((r) => {
        const x1 = xTime(r.start);
        const x2 = xTime(r.end);
        g.append('rect')
          .attr('x', x1)
          .attr('y', yTop + 14)
          .attr('width', x2 - x1)
          .attr('height', h - 14)
          .attr('fill', '#475569')
          .attr('opacity', 0.25)
          .attr('rx', 2);

        g.append('text')
          .attr('x', (x1 + x2) / 2)
          .attr('y', yTop + 26)
          .attr('text-anchor', 'middle')
          .attr('fill', COLORS.dimText)
          .attr('font-size', '8px')
          .attr('font-family', 'monospace')
          .text(r.label);
      });

      // USD/INR line (left axis)
      const yInr = d3
        .scaleLinear()
        .domain([d3.min(data.usdInr, (d) => d.rate)! * 0.9, d3.max(data.usdInr, (d) => d.rate)! * 1.05])
        .range([yTop + h, yTop + 22]);

      const inrLine = d3
        .line<RateYear>()
        .x((d) => x(d.year))
        .y((d) => yInr(d.rate))
        .curve(d3.curveMonotoneX);

      g.append('path').datum(data.usdInr).attr('d', inrLine).attr('fill', 'none').attr('stroke', COLORS.cyan).attr('stroke-width', 1.5);

      // Freight index (right axis)
      const yFreight = d3
        .scaleLinear()
        .domain([0, d3.max(data.freight, (d) => d.index)! * 1.1])
        .range([yTop + h, yTop + 22]);

      const freightLine = d3
        .line<FreightYear>()
        .x((d) => x(d.year))
        .y((d) => yFreight(d.index))
        .curve(d3.curveMonotoneX);

      g.append('path').datum(data.freight).attr('d', freightLine).attr('fill', 'none').attr('stroke', COLORS.amber).attr('stroke-width', 1.5).attr('stroke-dasharray', '6,3');

      // Legend
      const legendX = chartWidth - 260;
      const legendY = yTop + 18;
      [
        { color: '#475569', label: 'Recession', dash: false },
        { color: COLORS.cyan, label: 'USD/INR', dash: false },
        { color: COLORS.amber, label: 'Freight Index', dash: true },
      ].forEach((item, i) => {
        const lx = legendX + i * 90;
        g.append('line')
          .attr('x1', lx)
          .attr('x2', lx + 16)
          .attr('y1', legendY)
          .attr('y2', legendY)
          .attr('stroke', item.color)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', item.dash ? '4,2' : 'none')
          .attr('opacity', item.color === '#475569' ? 0.5 : 1);
        g.append('text')
          .attr('x', lx + 20)
          .attr('y', legendY + 3)
          .attr('fill', COLORS.dimText)
          .attr('font-size', '8px')
          .attr('font-family', 'monospace')
          .text(item.label);
      });

      // Y axes
      const yAxisL = d3.axisLeft(yInr).ticks(3);
      const yAxisLG = g.append('g').call(yAxisL);
      yAxisLG.selectAll('text').attr('fill', COLORS.cyan).attr('font-size', '8px').attr('font-family', 'monospace');
      yAxisLG.selectAll('line').remove();
      yAxisLG.select('.domain').remove();

      const yAxisR = d3.axisRight(yFreight).ticks(3);
      const yAxisRG = g.append('g').attr('transform', `translate(${chartWidth}, 0)`).call(yAxisR);
      yAxisRG.selectAll('text').attr('fill', COLORS.amber).attr('font-size', '8px').attr('font-family', 'monospace');
      yAxisRG.selectAll('line').remove();
      yAxisRG.select('.domain').remove();
    }

    // -----------------------------------------------------------------------
    // TRACK 4: Geopolitical Event Markers (annotated vertical lines)
    // -----------------------------------------------------------------------
    {
      const tIdx = 3;
      const h = trackHeights[tIdx];
      const yTop = trackY[tIdx];
      drawTrackLabel(tIdx, 'Geopolitical Events');
      drawTrackBorder(tIdx);

      const eventColor = (type: string) =>
        (COLORS as Record<string, string>)[type] || COLORS.muted;

      // Stagger labels to avoid overlap
      const sorted = [...data.geoEvents].sort((a, b) => a.date.localeCompare(b.date));
      let lastLabelX = -999;
      let row = 0;

      sorted.forEach((ev) => {
        const ex = xTime(ev.date);
        const color = eventColor(ev.type);

        // Vertical line
        g.append('line')
          .attr('x1', ex)
          .attr('x2', ex)
          .attr('y1', yTop + 18)
          .attr('y2', yTop + h)
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
          .attr('opacity', 0.7);

        // Diamond marker
        g.append('path')
          .attr('d', d3.symbol().type(d3.symbolDiamond).size(30)() as string)
          .attr('transform', `translate(${ex}, ${yTop + 18})`)
          .attr('fill', color)
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select(this).attr('d', d3.symbol().type(d3.symbolDiamond).size(60)() as string);
            showTooltip(
              `<strong>${ev.label}</strong><br/><span style="color:${color}">${ev.type.replace('_', ' ').toUpperCase()}</span> · ${ev.date}<br/>${ev.detail}`,
              event
            );
          })
          .on('mouseout', function () {
            d3.select(this).attr('d', d3.symbol().type(d3.symbolDiamond).size(30)() as string);
            hideTooltip();
          });

        // Staggered label
        if (ex - lastLabelX > 55) {
          row = 0;
          lastLabelX = ex;
        } else {
          row = (row + 1) % 4;
        }

        g.append('text')
          .attr('x', ex)
          .attr('y', yTop + h - 4 - row * 11)
          .attr('text-anchor', 'middle')
          .attr('fill', COLORS.dimText)
          .attr('font-size', '7px')
          .attr('font-family', 'monospace')
          .text(ev.label.length > 18 ? ev.label.slice(0, 16) + '…' : ev.label);
      });

      // Event type legend
      const types = ['conflict', 'sanctions', 'pandemic', 'economic', 'natural_disaster', 'quality'];
      types.forEach((t, i) => {
        const lx = i * 95;
        g.append('path')
          .attr('d', d3.symbol().type(d3.symbolDiamond).size(20)() as string)
          .attr('transform', `translate(${lx + 5}, ${yTop + 10})`)
          .attr('fill', eventColor(t));
        g.append('text')
          .attr('x', lx + 14)
          .attr('y', yTop + 13)
          .attr('fill', COLORS.dimText)
          .attr('font-size', '7px')
          .attr('font-family', 'monospace')
          .text(t.replace('_', ' '));
      });
    }

    // -----------------------------------------------------------------------
    // TRACK 5: Manufacturing Geography Share (stacked area)
    // -----------------------------------------------------------------------
    {
      const tIdx = 4;
      const h = trackHeights[tIdx];
      const yTop = trackY[tIdx];
      drawTrackLabel(tIdx, 'Manufacturing Geography');
      drawTrackBorder(tIdx);

      const regions: (keyof MfgGeoYear)[] = ['Rest of World', 'China', 'India', 'Europe', 'United States'];
      const regionColors: Record<string, string> = {
        'United States': COLORS.us,
        Europe: COLORS.europe,
        India: COLORS.india,
        China: COLORS.china,
        'Rest of World': COLORS.row,
      };

      const yScale = d3.scaleLinear().domain([0, 100]).range([yTop + h, yTop + 18]);

      const stack = d3
        .stack<MfgGeoYear>()
        .keys(regions as string[])
        .order(d3.stackOrderNone)
        .offset(d3.stackOffsetNone);

      const series = stack(data.mfgGeo);

      const areaGen = d3
        .area<d3.SeriesPoint<MfgGeoYear>>()
        .x((d) => x(d.data.year))
        .y0((d) => yScale(d[0]))
        .y1((d) => yScale(d[1]))
        .curve(d3.curveMonotoneX);

      series.forEach((s) => {
        g.append('path')
          .datum(s)
          .attr('d', areaGen)
          .attr('fill', regionColors[s.key] || COLORS.muted)
          .attr('opacity', 0.75)
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select(this).attr('opacity', 1);
            const year = Math.round(x.invert(event.offsetX - margin.left));
            const yearData = data.mfgGeo.find((m) => m.year === year);
            if (yearData) {
              showTooltip(
                `<strong>${year} — ${s.key}</strong><br/>${(yearData as unknown as Record<string, number>)[s.key]}% of global mfg`,
                event
              );
            }
          })
          .on('mouseout', function () {
            d3.select(this).attr('opacity', 0.75);
            hideTooltip();
          });
      });

      // Legend
      const legendRegions = ['United States', 'Europe', 'India', 'China', 'Rest of World'];
      legendRegions.forEach((r, i) => {
        const lx = chartWidth - 380 + i * 80;
        g.append('rect')
          .attr('x', lx)
          .attr('y', yTop + 7)
          .attr('width', 10)
          .attr('height', 8)
          .attr('fill', regionColors[r])
          .attr('opacity', 0.85)
          .attr('rx', 1);
        g.append('text')
          .attr('x', lx + 14)
          .attr('y', yTop + 14)
          .attr('fill', COLORS.dimText)
          .attr('font-size', '7px')
          .attr('font-family', 'monospace')
          .text(r === 'United States' ? 'US' : r === 'Rest of World' ? 'RoW' : r);
      });

      // Y-axis
      const yAxis = d3.axisLeft(yScale).ticks(3).tickFormat((d) => `${d}%`);
      const yAxisG = g.append('g').call(yAxis);
      yAxisG.selectAll('text').attr('fill', COLORS.dimText).attr('font-size', '8px').attr('font-family', 'monospace');
      yAxisG.selectAll('line').remove();
      yAxisG.select('.domain').remove();
    }

    // -----------------------------------------------------------------------
    // TRACK 6: Regulatory/Policy Markers (annotated)
    // -----------------------------------------------------------------------
    {
      const tIdx = 5;
      const h = trackHeights[tIdx];
      const yTop = trackY[tIdx];
      drawTrackLabel(tIdx, 'Regulatory & Policy');
      drawTrackBorder(tIdx);

      let lastX = -999;
      let row = 0;

      data.regulatory.forEach((m) => {
        const mx = xTime(m.date);

        // Tick mark
        g.append('line')
          .attr('x1', mx)
          .attr('x2', mx)
          .attr('y1', yTop + 16)
          .attr('y2', yTop + h)
          .attr('stroke', COLORS.green)
          .attr('stroke-width', 1)
          .attr('opacity', 0.5);

        g.append('circle')
          .attr('cx', mx)
          .attr('cy', yTop + 16)
          .attr('r', 3)
          .attr('fill', COLORS.green)
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select(this).attr('r', 5);
            showTooltip(`<strong>${m.label}</strong><br/>${m.date}<br/>${m.detail}`, event);
          })
          .on('mouseout', function () {
            d3.select(this).attr('r', 3);
            hideTooltip();
          });

        // Staggered label
        if (mx - lastX > 60) {
          row = 0;
          lastX = mx;
        } else {
          row = (row + 1) % 3;
        }

        g.append('text')
          .attr('x', mx)
          .attr('y', yTop + h - 2 - row * 10)
          .attr('text-anchor', 'middle')
          .attr('fill', COLORS.dimText)
          .attr('font-size', '6.5px')
          .attr('font-family', 'monospace')
          .text(m.label.length > 20 ? m.label.slice(0, 18) + '…' : m.label);
      });
    }

    // Title
    svg
      .append('text')
      .attr('x', totalWidth / 2)
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('fill', COLORS.white)
      .attr('font-size', '16px')
      .attr('font-family', 'monospace')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.15em')
      .text('PHARMAVIEW DISRUPTION ATLAS · 1995–2025');

    svg
      .append('text')
      .attr('x', totalWidth / 2)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', COLORS.dimText)
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .text('30 Years of Pharmaceutical Supply Chain Disruptions, Macro Trends & Regulatory Shifts');
  }, [data, showTooltip, hideTooltip]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-accent-green font-mono animate-pulse">LOADING DISRUPTION ATLAS...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-400 font-mono">FAILED TO LOAD ATLAS DATA</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed pointer-events-none z-50 bg-terminal-panel border border-terminal-border rounded px-3 py-2 text-xs font-mono text-primary shadow-lg transition-opacity duration-150"
        style={{ opacity: 0 }}
      />
      <div className="overflow-x-auto" id="atlas-svg-container">
        <svg ref={svgRef} className="block" style={{ minWidth: 1200 }} />
      </div>
    </div>
  );
}
