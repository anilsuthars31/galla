import type { Analysis, CategoryId, MonthIndex } from '../../engine';
import type { MonthView } from '../model';
import { CashFlowChart, ChartLegend } from '../components/CashFlowChart';
import { MonthDetail } from '../components/MonthDetail';
import { BalanceChart } from '../components/BalanceChart';
import { CardHead } from '../components/PageHeader';

interface Props {
  analysis: Analysis;
  months: MonthView[];
  selected: MonthIndex;
  onSelect: (m: MonthIndex) => void;
  onShowCategory: (c: CategoryId, m: MonthIndex) => void;
}

export function CashFlow({ analysis, months, selected, onSelect, onShowCategory }: Props) {
  return (
    <div className="page">
      <div className="grid-detail">
        <section className="panel">
          <CardHead title="Money in and out" sub="Click a month to see where the money came from and went." />
          <CashFlowChart months={months} height={320} selected={selected} onSelect={onSelect} />
          <ChartLegend />
        </section>
        <MonthDetail months={months} selected={selected} onSelect={onSelect} onShowCategory={onShowCategory} />
      </div>
      <BalanceChart analysis={analysis} months={months} />
    </div>
  );
}
