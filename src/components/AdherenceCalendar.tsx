import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface DayStatus {
  date: string;
  completed: number;
  total: number;
}

interface Props {
  monthStatuses: DayStatus[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onMonthChange?: (year: number, month: number) => void;
  futureDisabled?: boolean;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function AdherenceCalendar({ monthStatuses, selectedDate, onSelectDate, onMonthChange, futureDisabled }: Props) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const initial = new Date(selectedDate || todayKey);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const statusMap = useMemo(() => {
    const map: Record<string, DayStatus> = {};
    for (const s of monthStatuses) map[s.date] = s;
    return map;
  }, [monthStatuses]);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    setViewMonth(m); setViewYear(y);
    onMonthChange?.(y, m);
  }

  function nextMonth() {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    setViewMonth(m); setViewYear(y);
    onMonthChange?.(y, m);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded text-ink-dim hover:bg-surface-2 transition-colors" aria-label="Previous month"><ChevronLeft size={18} /></button>
        <h4 className="text-base font-semibold text-ink">{new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
        <button onClick={nextMonth} className="p-2 rounded text-ink-dim hover:bg-surface-2 transition-colors" aria-label="Next month"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-smallall font-medium text-ink-faint py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;
          const key = dateKey(viewYear, viewMonth, day);
          const status = statusMap[key];
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const isFuture = futureDisabled && key > todayKey;
          const ratio = status && status.total > 0 ? status.completed / status.total : 0;
          const allDone = status && status.total > 0 && status.completed === status.total;
          const partial = status && status.completed > 0 && status.completed < status.total;
          const none = status && status.completed === 0 && status.total > 0;
          return (
            <button
              key={key}
              onClick={() => !isFuture && onSelectDate(key)}
              disabled={isFuture}
              className={`relative aspect-square rounded flex flex-col items-center justify-center text-small transition-all
                ${isSelected ? 'ring-2 ring-accent' : ''}
                ${isFuture ? 'opacity-30 cursor-not-allowed bg-surface-2' : 'hover:bg-surface-3 cursor-pointer'}
                ${allDone ? 'bg-emerald-100 text-emerald-800 font-semibold' : ''}
                ${partial ? 'bg-amber-100 text-amber-800 font-semibold' : ''}
                ${none ? 'bg-risk-very-high/10 text-risk-very-high' : ''}
                ${!status && !isFuture ? 'bg-surface-2 border border-hairline text-ink-dim' : ''}
                ${isToday && !isSelected ? 'border-2 border-accent' : ''}
              `}
            >
              <span>{day}</span>
              {status && status.total > 0 && (
                <span className="text-[10px] text-ink-dim mt-0.5">{status.completed}/{status.total}</span>
              )}
              {allDone && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-risk-low/100" />}
              {partial && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-risk-moderate/100" />}
              {none && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-400" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 text-smallall text-ink-dim">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> All done</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-100 border border-amber-300" /> Partial</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-risk-very-high/10 border border-risk-very-high/30" /> Missed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-surface-2 border border-hairline" /> No tasks</span>
      </div>
    </div>
  );
}
