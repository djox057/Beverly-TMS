import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpcomingDrivers from "@/pages/UpcomingDrivers";
import { CandidateEditor } from "./CandidateEditor";
import { addDays, chicagoToday, EMPTY_CANDIDATE, mondayOf, type Candidate, type References } from "./model";
import { fetchCandidate, saveCandidate, useUpcomingDrivers } from "./useUpcomingDrivers";

vi.mock("@/contexts/AuthContext",()=>({useAuthContext:()=>({user:{id:"test-user"},getPrimaryRole:()=>"admin"})}));
vi.mock("./useUpcomingDrivers",async original=>({
  ...await original<typeof import("./useUpcomingDrivers")>(),
  useUpcomingDrivers:vi.fn(),fetchCandidate:vi.fn(),saveCandidate:vi.fn(),
  useCandidateHistory:()=>({data:[],isPending:false,isError:false}),
}));
const week=mondayOf(chicagoToday());
const refs:References={staff:[{user_id:"recruiter",full_name:"Recruiter One",role:"recruiting"}],trucks:[],companies:[]};
const candidate:Candidate={...EMPTY_CANDIDATE,id:"00000000-0000-4000-8000-000000000001",driver_name:"Alex Example",phone:"312-555-0123",
  recruiter_id:"recruiter",arrival_date:addDays(week,1),arrival_time:"14:30:00",version:2,archived:false,
  description:"Full comment with details that should only appear when the comment is opened.",description_preview:"Full comment…",
  created_by:null,updated_by:null,created_at:"2026-09-15T12:00:00Z",updated_at:"2026-09-15T12:00:00Z",
  transport_preview:"",mvr_preview:"",psp_preview:"",ticket_preview:""};
const acceptSaved=vi.fn();
const provider=(node:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{node}</QueryClientProvider>);
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();
  vi.mocked(fetchCandidate).mockResolvedValue(candidate);
  vi.mocked(saveCandidate).mockResolvedValue({...candidate,version:3});
  vi.mocked(useUpcomingDrivers).mockReturnValue({query:{data:[candidate],isPending:false,isFetching:false,refetch:vi.fn()},references:{data:refs,refetch:vi.fn()},live:"Live",canEdit:true,canArchive:true,acceptSaved} as unknown as ReturnType<typeof useUpcomingDrivers>);
});
afterEach(cleanup);
describe("Weekly board",()=>{
  it("shows all seven days, an unscheduled group and Chicago arrival times",()=>{
    provider(<UpcomingDrivers/>);
    expect(screen.getByRole("button",{name:/Monday,/})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:/Sunday,/})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:/Unscheduled · all weeks/})).toBeInTheDocument();
    expect(screen.getByText("2:30 PM")).toBeInTheDocument();
    expect(screen.queryByText(candidate.description)).not.toBeInTheDocument();
  });
  it("navigates whole weeks and returns to This Week",()=>{
    provider(<UpcomingDrivers/>);
    fireEvent.click(screen.getByRole("button",{name:"Next week"}));
    expect(screen.getByLabelText("Choose week")).toHaveValue(addDays(week,7));
    fireEvent.click(screen.getByRole("button",{name:"Previous week"}));
    expect(screen.getByLabelText("Choose week")).toHaveValue(week);
    fireEvent.change(screen.getByLabelText("Choose week"),{target:{value:"2026-11-01"}});
    expect(screen.getByLabelText("Choose week")).toHaveValue("2026-10-26");
    fireEvent.click(screen.getByRole("button",{name:"This Week"}));
    expect(screen.getByLabelText("Choose week")).toHaveValue(week);
  });
  it("opens the full comment from its compact cell",async()=>{
    provider(<UpcomingDrivers/>);
    fireEvent.click(screen.getByRole("button",{name:"Description / Comments for Alex Example"}));
    expect(await screen.findByDisplayValue(candidate.description)).toBeInTheDocument();
    expect(fetchCandidate).toHaveBeenCalledWith(candidate.id);
  });
  it("filters names and formatted phone numbers",()=>{
    provider(<UpcomingDrivers/>);
    fireEvent.change(screen.getByLabelText("Search upcoming drivers"),{target:{value:"3125550123"}});
    expect(screen.getByRole("button",{name:"Driver for Alex Example"})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search upcoming drivers"),{target:{value:"No match"}});
    expect(screen.queryByRole("button",{name:"Driver for Alex Example"})).not.toBeInTheDocument();
  });
  it("does not show editing actions to a read-only role",()=>{
    const value=vi.mocked(useUpcomingDrivers)(week,false);
    vi.mocked(useUpcomingDrivers).mockReturnValue({...value,canEdit:false,canArchive:false});
    provider(<UpcomingDrivers/>);
    expect(screen.queryByRole("button",{name:"Add Driver"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Archive Alex Example"})).not.toBeInTheDocument();
  });
});
describe("Candidate editing",()=>{
  it("saves only the edited comment with the loaded version",async()=>{
    provider(<CandidateEditor selection={{id:candidate.id,field:"description"}} refs={refs} canEdit defaultRecruiter={null} onClose={vi.fn()} onSaved={acceptSaved}/>);
    const input=await screen.findByDisplayValue(candidate.description);
    fireEvent.change(input,{target:{value:"Updated comment"}});
    fireEvent.click(screen.getByRole("button",{name:"Save"}));
    await waitFor(()=>expect(saveCandidate).toHaveBeenCalledWith(candidate.id,{description:"Updated comment"},2));
  });
  it("retains the draft when a concurrent update prevents saving",async()=>{
    vi.mocked(saveCandidate).mockRejectedValue(new Error("This entry changed while you were editing."));
    provider(<CandidateEditor selection={{id:candidate.id,field:"description"}} refs={refs} canEdit defaultRecruiter={null} onClose={vi.fn()} onSaved={acceptSaved}/>);
    fireEvent.change(await screen.findByDisplayValue(candidate.description),{target:{value:"My unsaved draft"}});
    fireEvent.click(screen.getByRole("button",{name:"Save"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed while you were editing");
    expect(screen.getByDisplayValue("My unsaved draft")).toBeInTheDocument();
    expect(acceptSaved).not.toHaveBeenCalled();
  });
  it("creates a candidate with literal Chicago date/time and no existing driver ID",async()=>{
    provider(<CandidateEditor selection={{id:null,createId:"create-once",date:"2026-11-01"}} refs={refs} canEdit defaultRecruiter={null} onClose={vi.fn()} onSaved={acceptSaved}/>);
    fireEvent.change(screen.getByLabelText("Driver *"),{target:{value:"New Candidate"}});
    fireEvent.change(screen.getByLabelText("Phone *"),{target:{value:"312-555-0150"}});
    fireEvent.change(screen.getByLabelText("Arrival time (Chicago)"),{target:{value:"01:30"}});
    fireEvent.click(screen.getByRole("button",{name:"Save"}));
    await waitFor(()=>expect(saveCandidate).toHaveBeenCalledWith("create-once",expect.objectContaining({driver_name:"New Candidate",arrival_date:"2026-11-01",arrival_time:"01:30"}),undefined));
    expect(vi.mocked(saveCandidate).mock.calls[0][1]).not.toHaveProperty("driver_id");
  });
});
