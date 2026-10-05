import * as React from 'react';
import * as echarts from 'echarts';
import { useTheme } from '../../stores/theme';

/** Theme-aware Apache ECharts wrapper (free, offline). */
export function Chart({ option, height = 280 }: { option: echarts.EChartsCoreOption; height?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const resolved = useTheme((s) => s.resolved);

  React.useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
    const dark = resolved === 'dark';
    const text = dark ? '#cbd5e1' : '#475569';
    chart.setOption({
      textStyle: { color: text, fontFamily: 'Inter, system-ui, sans-serif' },
      ...option,
    } as echarts.EChartsCoreOption);
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [resolved, option]);

  return <div ref={ref} style={{ height, width: '100%' }} role="img" />;
}
