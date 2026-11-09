import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe,it,expect,vi } from "vitest";
import { useChatRecord, useChatRecordLink } from "./useChatRecord";

describe("assistant record navigation",()=>{
  it("opens the requested record/files tab after records finish loading",async()=>{
    const open=vi.fn(),tab=vi.fn();
    function Target({ records }: { records?: { id: string }[] }) { useChatRecordLink(records,open,tab);return null; }
    const ui=(records?: { id: string }[]) => <MemoryRouter initialEntries={["/trucks?record=truck-id&tab=files"]}><Target records={records} /></MemoryRouter>;
    const view=render(ui());expect(open).not.toHaveBeenCalled();
    view.rerender(ui([{id:"truck-id"} ]));await waitFor(()=>expect(open).toHaveBeenCalledWith({id:"truck-id"}));expect(tab).toHaveBeenCalledWith("files");
    view.rerender(ui([{id:"truck-id"} ]));expect(open).toHaveBeenCalledTimes(1);
  });
  it("does not open a record the page cannot find",()=>{
    const open=vi.fn();function Target(){useChatRecordLink([{id:"different"}],open,vi.fn());return null;}
    render(<MemoryRouter initialEntries={["/drivers?record=missing&tab=files"]}><Target /></MemoryRouter>);expect(open).not.toHaveBeenCalled();
  });
  it("publishes identity only, then clears context when a dialog closes",()=>{
    const events: unknown[]=[];const listener=(e:Event)=>events.push((e as CustomEvent).detail);window.addEventListener("tms-chat-context",listener);
    function Target({open}:{open:boolean}) { useChatRecord("driver",{id:"driver-id",salary:1000} as any,open,"Demo Driver");return null; }
    const view=render(<Target open />);expect(events[events.length-1]).toEqual({kind:"driver",id:"driver-id",label:"Demo Driver"});
    view.rerender(<Target open={false} />);expect(events[events.length-1]).toBeNull();expect(JSON.stringify(events)).not.toContain("salary");window.removeEventListener("tms-chat-context",listener);
  });
});
