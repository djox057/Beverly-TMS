import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,describe,it,expect } from 'vitest';
import { HosLoadLight } from './HosLoadLight';
afterEach(cleanup);
describe('HOS booking light',()=>{
  it('shows an accessible red result beside the booking action',()=>{
    render(<HosLoadLight assessment={{color:'red',summary:'Pickup is too late',reasons:[],assessedAt:new Date().toISOString()}} />);
    expect(screen.getByRole('button',{name:'HOS red: Pickup is too late'})).toHaveAttribute('type','button');
  });
  it('cannot keep showing an old green while a changed draft is being checked',()=>{
    render(<HosLoadLight loading assessment={{color:'green',summary:'Fits',reasons:[],assessedAt:new Date().toISOString()}} />);
    expect(screen.getByRole('button',{name:/HOS yellow: Checking/})).toBeInTheDocument();
  });
  it('opens the explanation on click, including on touch devices',()=>{
    render(<HosLoadLight assessment={{color:'yellow',summary:'Schedule needs confirmation',reasons:['Remaining work on the current load needs confirmation.'],assessedAt:new Date().toISOString()}} />);
    const button=screen.getByRole('button',{name:/HOS yellow/});
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toHaveTextContent('Remaining work on the current load needs confirmation.');
    expect(button).toHaveAttribute('aria-expanded','true');
  });
  it('exposes a failed request without retaining a previous green result',()=>{
    render(<HosLoadLight error={new Error('unavailable')} assessment={{color:'green',summary:'Fits',reasons:[],assessedAt:new Date().toISOString()}} />);
    fireEvent.click(screen.getByRole('button',{name:/HOS yellow: HOS check unavailable/}));
    expect(screen.getByRole('dialog')).toHaveTextContent('HOS check unavailable. Try again shortly.');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Fits');
  });
});
