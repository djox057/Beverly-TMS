import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi,describe,it,expect,beforeEach } from 'vitest';
import { ChatbotPanel } from './ChatbotPanel';
const mocks=vi.hoisted(()=>({ state:null as any,request:vi.fn(),toast:vi.fn() }));
vi.mock('@/contexts/ChatbotContext',()=>({useChatbot:()=>mocks.state}));
vi.mock('@/lib/chatbot',()=>({chatbotRequest:(...args:any[])=>mocks.request(...args)}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:mocks.toast})}));
beforeEach(()=>{
 Element.prototype.scrollIntoView=vi.fn();
 mocks.state={enabled:true,open:true,setOpen:vi.fn(),context:{kind:'truck',id:'unit-id',label:'6270'},messages:[],busy:false,send:vi.fn(),clear:vi.fn()};
 mocks.request.mockReset();mocks.toast.mockReset();
});
const mount=()=>render(<MemoryRouter><ChatbotPanel /></MemoryRouter>);
describe('TMS assistant panel',()=>{
 it('hides entirely without the access toggle',()=>{mocks.state.enabled=false;mount();expect(screen.queryByRole('dialog')).toBeNull();});
 it('shows current context and sends a question',()=>{mount();expect(screen.getByText(/truck · 6270/)).toBeInTheDocument();fireEvent.change(screen.getByLabelText('Message'),{target:{value:'Cab card please'}});fireEvent.click(screen.getByRole('button',{name:'Send'}));expect(mocks.state.send).toHaveBeenCalledWith('Cab card please');expect(screen.getByLabelText('Message')).toHaveValue('');});
 it('renders saved fields, expired labels, file actions, manual steps and real record link',()=>{
  mocks.state.messages=[{id:'answer',role:'assistant',text:'Files',reply:{record:{kind:'driver',id:'d',label:'Test Driver'},facts:[{label:'CDL expiration',value:'2025-01-01',expired:true}],files:[{id:'f',kind:'driver',recordId:'d',name:'CDL.pdf'}],links:[{label:'Open in TMS',href:'/drivers?record=d&tab=files'}],steps:['Drivers','Driver Files','CDL']}}];mount();
  expect(screen.getByText(/Expired/)).toBeInTheDocument();expect(screen.getByRole('link',{name:'Open in TMS'})).toHaveAttribute('href','/drivers?record=d&tab=files');expect(screen.getByText(/Drivers → Driver Files → CDL/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Download'})).toBeInTheDocument();
 });
 it('preserves original question when selecting an ambiguous record',()=>{
  const selected={kind:'driver',id:'d',label:'Test Driver'};mocks.state.messages=[{id:'u',role:'user',text:'CDL for truck 6270'},{id:'a',role:'assistant',text:'Select a record',reply:{choices:[selected]}}];mount();fireEvent.click(screen.getByRole('button',{name:'Test Driver'}));expect(mocks.state.send).toHaveBeenCalledWith('CDL for truck 6270',selected);
 });
 it('requests a fresh backend file URL and reports revoked access',async()=>{
  mocks.state.messages=[{id:'a',role:'assistant',text:'Files',reply:{files:[{id:'f',kind:'driver',recordId:'d',name:'CDL.pdf'}]}}];const close=vi.fn();vi.spyOn(window,'open').mockReturnValue({opener:null,close,location:{href:''}} as any);mocks.request.mockRejectedValue(new Error('Chatbot access is disabled'));mount();fireEvent.click(screen.getByRole('button',{name:'Open file'}));await waitFor(()=>expect(close).toHaveBeenCalled());expect(mocks.request).toHaveBeenCalledWith({action:'file',kind:'driver',recordId:'d',fileId:'f',download:false});expect(mocks.toast).toHaveBeenCalled();
 });
 it('clears chat on demand',()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Clear chat'}));expect(mocks.state.clear).toHaveBeenCalled();});
});
