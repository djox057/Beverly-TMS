import { render,screen } from '@testing-library/react';
import { describe,it,expect } from 'vitest';
import { HosLoadLight } from './HosLoadLight';
describe('HOS booking light',()=>{
  it('shows an accessible red result beside the booking action',()=>{
    render(<HosLoadLight assessment={{color:'red',summary:'Pickup is too late',reasons:[],assessedAt:new Date().toISOString()}} />);
    expect(screen.getByRole('button',{name:'HOS red: Pickup is too late'})).toHaveAttribute('type','button');
  });
  it('cannot keep showing an old green while a changed draft is being checked',()=>{
    render(<HosLoadLight loading assessment={{color:'green',summary:'Fits',reasons:[],assessedAt:new Date().toISOString()}} />);
    expect(screen.getByRole('button',{name:/HOS yellow: Checking/})).toBeInTheDocument();
  });
});
