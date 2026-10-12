import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PretripFormCell, type PretripSubmission } from "./PretripFormSubmissions";
vi.mock("@/integrations/supabase/client",()=>({supabase:{storage:{from:()=>({createSignedUrls:async(paths:string[])=>({data:paths.map(path=>({path,signedUrl:`https://example.com/${path}`}))})})}}}));
// jsdom has no layout/scroll API; keep the real Radix selector in this test.
HTMLElement.prototype.scrollIntoView = vi.fn();
const response:PretripSubmission={id:"one",truck_id:"truck",truck_number:"2405",trailer_number:"T123",driver_name:"John Doe",email:"driver@example.com",inspection_date:"2026-10-05",submitted_at:"2026-10-05T09:30:00",source_timezone:"America/Chicago",answers:{"Additional compliance check":"Confirmed"},complaints:"Tire is low",files:[{category:"Steering axle tires",drive_id:"file12345",status:"error",error:"Private file access denied"}],status:"pending",import_error:"A photo needs attention"};
describe("pretrip form details",()=>{
 it("displays actual form identity, inspection date, complaints, extra answers and photo failures",()=>{
  render(<PretripFormCell submissions={[response]}/>);fireEvent.click(screen.getByRole("button",{name:"Form (1)"}));
  expect(screen.getByText("John Doe")).toBeInTheDocument();expect(screen.getByText("driver@example.com")).toBeInTheDocument();expect(screen.getByText("T123")).toBeInTheDocument();expect(screen.getByText("Tire is low")).toBeInTheDocument();expect(screen.getByText("Steering axle tires")).toBeInTheDocument();expect(screen.getByText("Private file access denied")).toBeInTheDocument();expect(screen.getByText("Additional compliance check")).toBeInTheDocument();
 });
 it("keeps submissions from different inspection days selectable",async()=>{
  render(<PretripFormCell submissions={[response,{...response,id:"two",driver_name:"Second driver",inspection_date:"2026-10-06",submitted_at:"2026-10-06T12:00:00"}]}/>);fireEvent.click(screen.getByRole("button",{name:"Form (2)"}));
  fireEvent.keyDown(screen.getByRole("combobox",{name:"Select form submission"}),{key:"ArrowDown"});
  expect(await screen.findByRole("option",{name:/Form 2 · Oct 6, 2026 · 12:00 PM · Second driver/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option",{name:/Form 2 · Oct 6, 2026 · 12:00 PM · Second driver/}));
  expect(screen.getByText("Second driver")).toBeInTheDocument();
 });
});

it("shows only the latest form for the same truck/day",()=>{
 render(<PretripFormCell submissions={[response,{...response,id:"latest",driver_name:"Latest driver",submitted_at:"2026-10-05T12:00:00",complaints:"Latest note"}]}/>);
 fireEvent.click(screen.getByRole("button",{name:"Form (1)"}));
 expect(screen.getByText("Latest driver")).toBeInTheDocument();expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
 expect(screen.getByText("Latest note")).toBeInTheDocument();expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("shows imported MOV uploads in a player inside the form",async()=>{
 render(<PretripFormCell submissions={[{...response,status:"imported",import_error:null,files:[{category:"Truck front headlights and turn signals",drive_id:"video",status:"imported",file_path:"front.mov",file_name:"Front.mov",content_type:"video/quicktime"}]}]}/>);
 fireEvent.click(screen.getByRole("button",{name:"Form (1)"}));
 await waitFor(()=>expect(document.querySelector("video")).toHaveAttribute("src","https://example.com/front.mov"));
 expect(document.querySelector("video")).toHaveAttribute("controls");expect(document.querySelector("img")).toBeNull();
});
