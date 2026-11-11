import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HolidayReportTable } from '@/components/holidays/HolidayReportTable';
import { currentHolidayYear, getHolidays, MAX_HOLIDAY_YEAR, MIN_HOLIDAY_YEAR, parseHolidayYear, type Holiday } from '@/lib/holidays';
import { ChristmasDecorations } from '@/components/ChristmasDecorations';
import './holidays.css';

function YearPicker({ year, slug }: { year: number; slug?: string }) {
  const navigate = useNavigate();
  const go = (next: number) => {
    const exists = slug && getHolidays(next).some(holiday => holiday.slug === slug);
    navigate(`/holidays/${next}${exists ? `/${slug}` : ''}`);
  };
  return <div className="holiday-year-picker">
    <Button variant="ghost" size="icon" aria-label="Previous year" disabled={year <= MIN_HOLIDAY_YEAR} onClick={() => go(year - 1)}><ChevronLeft className="h-4 w-4" /></Button>
    <select aria-label="Year" value={year} onChange={event => go(Number(event.target.value))}>
      {Array.from({ length: MAX_HOLIDAY_YEAR - MIN_HOLIDAY_YEAR + 1 }, (_, index) => MIN_HOLIDAY_YEAR + index).map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    <Button variant="ghost" size="icon" aria-label="Next year" disabled={year >= MAX_HOLIDAY_YEAR} onClick={() => go(year + 1)}><ChevronRight className="h-4 w-4" /></Button>
  </div>;
}

function MonthCalendar({ year, month, holidays }: { year: number; month: number; holidays: Holiday[] }) {
  const offset = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const highlighted = new Set(holidays.map(holiday => holiday.date.getDate()));
  return <div className="holiday-mini-calendar" aria-hidden="true">
    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span className="weekday" key={`weekday-${index}`}>{day}</span>)}
    {Array.from({ length: 42 }, (_, index) => {
      const day = index - offset + 1;
      return <span key={index} className={highlighted.has(day) ? 'is-holiday' : ''}>{day > 0 && day <= days ? day : ''}</span>;
    })}
  </div>;
}

function HolidayCard({ holiday, year }: { holiday: Holiday; year: number }) {
  return <Link to={`/holidays/${year}/${holiday.slug}`} className="holiday-card" data-holiday-theme={holiday.theme}>
    <div className="holiday-card-top"><span>{format(holiday.date, 'EEE, MMM d')}</span><ArrowUpRight size={14} /></div>
    <div className="holiday-card-name"><span className="holiday-motif" aria-hidden="true">{holiday.motif}</span><h3>{holiday.name}</h3></div>
    {holiday.observedDate && <span className="holiday-observed">Observed {format(holiday.observedDate, 'MMM d, yyyy')}</span>}
    <span className="holiday-card-spark" aria-hidden="true">✧</span>
  </Link>;
}

export default function Holidays() {
  const { year: yearParam, holidaySlug } = useParams();
  const year = yearParam === undefined ? currentHolidayYear() : parseHolidayYear(yearParam);
  if (year === null) return <div className="holiday-page p-8"><h1 className="text-2xl font-semibold">Year not found</h1><p className="mt-2 text-muted-foreground">Choose a year from {MIN_HOLIDAY_YEAR} to {MAX_HOLIDAY_YEAR}.</p><Button asChild variant="outline" className="mt-4"><Link to="/holidays">Back to Holidays</Link></Button></div>;
  const holidays = getHolidays(year);
  const holiday = holidaySlug ? holidays.find(item => item.slug === holidaySlug) : undefined;
  if (holidaySlug && !holiday) return <div className="holiday-page p-8"><h1 className="text-2xl font-semibold">Holiday not found</h1><Button asChild variant="outline" className="mt-4"><Link to={`/holidays/${year}`}>Back to {year} Holidays</Link></Button></div>;

  if (holiday) return <div className="holiday-page holiday-detail" data-holiday-theme={holiday.theme}>
    {holiday.slug === 'christmas' ? <ChristmasDecorations /> : <div className="holiday-themed-decoration" aria-hidden="true">{holiday.motif} ✦ {holiday.motif}</div>}
    <header className="holiday-detail-hero">
      <Link className="holiday-back" to={`/holidays/${year}`} aria-label="All holidays"><ArrowLeft size={16} /></Link>
      <span className="holiday-detail-motif" aria-hidden="true">{holiday.motif}</span>
      <div className="holiday-detail-title"><h1>{holiday.name}</h1><p className="holiday-detail-date">{format(holiday.date, 'EEEE, MMMM d, yyyy')}
        {holiday.observedDate && <span> · Observed {format(holiday.observedDate, 'MMM d, yyyy')}</span>}
      </p></div>
      <YearPicker year={year} slug={holiday.slug} />
    </header>
    <HolidayReportTable key={`${year}-${holiday.slug}`} year={year} holidaySlug={holiday.slug} />
  </div>;

  return <div className="holiday-page">
    <header className="holiday-overview-hero"><h1 className="sr-only">{year}</h1><YearPicker year={year} /></header>
    <div className="holiday-months">
      {Array.from({ length: 12 }, (_, month) => {
        const monthHolidays = holidays.filter(item => item.date.getMonth() === month);
        if (!monthHolidays.length) return null;
        return <section className="holiday-month" key={month} aria-label={format(new Date(year, month, 1), 'MMMM')}>
          <div className="holiday-month-heading"><h2>{format(new Date(year, month, 1), 'MMMM')}</h2><span>{String(month + 1).padStart(2, '0')}</span></div>
          <MonthCalendar year={year} month={month} holidays={monthHolidays} />
          <div className="holiday-month-events">{monthHolidays.map(item => <HolidayCard key={item.slug} holiday={item} year={year} />)}
            {!monthHolidays.length && <p className="holiday-quiet-month">No holidays</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
