import { MessageSquare, Pencil } from "lucide-react";
import { ServiceLogCell } from "@/components/ServiceLogCell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { columns, displayValue, highlightStyles, webLink, type RoadRecord, type Sheet } from "@/lib/roadsides";

const gridBorder = "border border-[#dce3f3]";
const action = "inline-flex items-center justify-center p-1 rounded-sm hover:bg-blue-100 dark:hover:bg-slate-700";

// Widths follow the two workbook sheets, including the wider comment and court-date columns.
const widths: Record<Sheet, number[]> = {
  ALL: [168, 144, 144, 140, 144, 140, 204, 180, 160, 166, 140, 380],
  Lawyers: [184, 92, 64, 104, 192, 76, 144, 144, 128, 148, 124, 284, 130, 180],
};

export function RoadsideGrid({ sheet, rows, editable, editRow, saveCell, emptyMessage }: {
  sheet: Sheet;
  rows: RoadRecord[];
  editable: boolean;
  editRow: (row: RoadRecord) => void;
  saveCell: (row: RoadRecord, key: string, value: string) => Promise<void>;
  emptyMessage: string;
}) {
  const schema = columns[sheet];
  const sizes = widths[sheet];
  return <div className="service-log-sheet min-w-0 rounded-sm border-2 border-[#233c85] bg-white text-slate-900 shadow-sm">
    <h2 className="service-log-light-title bg-[#233c85] px-4 py-2 text-center text-sm font-bold uppercase tracking-wide text-white">
      {sheet === "ALL" ? "Roadside inspections" : "Lawyer cases"}
    </h2>
    <div className="service-log-table max-h-[65vh] overflow-auto">
      <table aria-label={sheet === "ALL" ? "Roadside inspections" : "Lawyer cases"} className="w-full table-fixed border-collapse text-xs"
        style={{ minWidth: sizes.reduce((sum, width) => sum + width, editable ? 42 : 0) }}>
        <colgroup>{schema.map((col, i) => <col key={col.key} style={{ width: sizes[i] }} />)}{editable && <col style={{ width: 42 }} />}</colgroup>
        <thead className="sticky top-0 z-10 bg-[#233c85] text-white"><tr>
          {schema.map(col => <th key={col.key} scope="col" className={`${gridBorder} px-2 py-2 text-center font-semibold`}>{col.label}</th>)}
          {editable && <th scope="col" className={gridBorder}><span className="sr-only">Row details</span></th>}
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="even:bg-[#f7f9fd]">
          {schema.map(col => {
            const value = row.fields[col.key] ?? "";
            const text = displayValue(col.key, value);
            const label = `${col.label} · ${row.fields.truck || row.fields.driver || "record"}`;
            const url = webLink(row.links[col.key]);
            const note = row.notes[col.key];
            const options = col.options && ["", ...col.options, ...(value && !col.options.includes(value) ? [value] : [])];
            return <td key={col.key} className={`${gridBorder} h-7 p-0 text-center ${highlightStyles[row.highlights[col.key]] ?? ""}`}>
              <div className="flex h-7 min-w-0 items-center [&:has([data-cell-editor])>a]:hidden">
                {url && <a href={url} target="_blank" rel="noopener noreferrer" title={text || "Open document"}
                  className="min-w-0 flex-1 truncate px-1 text-blue-700 underline dark:text-blue-300">{text || "Open document"}</a>}
                {(!url || editable) && <div className={`relative h-full min-w-0 overflow-hidden focus-within:ring-1 focus-within:ring-inset focus-within:ring-[#217346] [&:has([data-cell-editor])]:shadow-[inset_0_0_0_2px_#217346] ${url ? "w-6 has-[[data-cell-editor]]:flex-1" : "flex-1"}`}>
                  <ServiceLogCell label={label} value={value}
                    display={url ? <Pencil className="mx-auto h-3 w-3" /> : text}
                    compact={!!url} editable={editable}
                    type={col.key === "inspection_date" ? "date" : "text"} options={options}
                    onSave={next => saveCell(row, col.key, next)} />
                </div>}
                {note && <Popover><PopoverTrigger asChild><button type="button" className={action}
                  title={note} aria-label={`Cell note · ${label}`}><MessageSquare className="h-3.5 w-3.5" /></button></PopoverTrigger>
                  <PopoverContent className="max-w-xs whitespace-pre-line break-words text-sm">{note}</PopoverContent></Popover>}
              </div>
            </td>;
          })}
          {editable && <td className={`${gridBorder} h-7 p-0 text-center`}><button type="button" className={action}
            title="Edit row details" aria-label={`Edit ${row.fields.driver || "record"}`} onClick={() => editRow(row)}>
            <Pencil className="h-3.5 w-3.5" /></button></td>}
        </tr>)}
          {!rows.length && <tr><td colSpan={schema.length + Number(editable)} className="p-5 text-center">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}
