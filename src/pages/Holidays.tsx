import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HolidayReportTable } from '@/components/holidays/HolidayReportTable';
import { currentHolidayYear, getHolidays, MAX_HOLIDAY_YEAR, MIN_HOLIDAY_YEAR, parseHolidayYear, type Holiday } from '@/lib/holidays';
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
    <div className="holiday-toolbar"><Link className="holiday-back" to={`/holidays/${year}`}><ArrowLeft size={16} /> All holidays</Link><YearPicker year={year} slug={holiday.slug} /></div>
    <header className="holiday-detail-hero">
      <div className="holiday-hero-copy"><p className="holiday-eyebrow">{year} / {holiday.federal ? 'US federal holiday' : 'Common occasion'}</p><h1>{holiday.name}</h1><p className="holiday-detail-date">{format(holiday.date, 'EEEE, MMMM d, yyyy')}</p>
        {holiday.observedDate && <p className="holiday-detail-observed">Federal observance: {format(holiday.observedDate, 'EEEE, MMMM d, yyyy')}</p>}
        <p className="holiday-detail-description">{holiday.detail}</p>
      </div><div className="holiday-detail-art" aria-hidden="true"><span className="holiday-art-spark one">✦</span><span className="holiday-art-main">{holiday.motif}</span><span className="holiday-art-spark two">✧</span></div>
    </header>
    <HolidayReportTable key={`${year}-${holiday.slug}`} year={year} holidaySlug={holiday.slug} />
  </div>;

  return <div className="holiday-page">
    <header className="holiday-overview-hero">
      <div className="holiday-hero-copy"><p className="holiday-eyebrow"><CalendarDays size={15} /> Beverly calendar</p><h1>A year of <span>little celebrations.</span></h1><p>Plan ahead, keep everyone in the loop, and make room for the moments that matter.</p></div>
      <div className="holiday-year-art" aria-hidden="true"><span>✦</span><strong>{year}</strong><span>🍂 &nbsp; ☘️ &nbsp; 🎄</span></div>
    </header>
    <div className="holiday-toolbar"><div><h2 className="text-xl font-semibold">Holidays <span className="text-muted-foreground font-normal">/ {year}</span></h2><p className="text-sm text-muted-foreground mt-1">US federal holidays & common occasions · Open a holiday to add truck notes.</p></div><YearPicker year={year} /></div>
    <div className="holiday-months">
      {Array.from({ length: 12 }, (_, month) => {
        const monthHolidays = holidays.filter(item => item.date.getMonth() === month);
        return <section className="holiday-month" key={month} aria-label={format(new Date(year, month, 1), 'MMMM')}>
          <div className="holiday-month-heading"><h2>{format(new Date(year, month, 1), 'MMMM')}</h2><span>{String(month + 1).padStart(2, '0')}</span></div>
          <MonthCalendar year={year} month={month} holidays={monthHolidays} />
          <div className="holiday-month-events">{monthHolidays.map(item => <HolidayCard key={item.slug} holiday={item} year={year} />)}
            {!monthHolidays.length && <div className="holiday-quiet-month"><span aria-hidden="true">☀️</span><p>A little breathing room.</p><small>No holidays this month</small></div>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
