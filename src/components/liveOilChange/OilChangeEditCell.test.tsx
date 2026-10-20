import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OilChangeEditCell } from './OilChangeEditCell';
afterEach(cleanup);
it('opens the invoice in a large editor and saves only after explicit Save',async()=>{
  const save=vi.fn(async()=>{});
  render(<OilChangeEditCell value="TA #019" label="Last OC invoice" multiline onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Edit Last OC invoice'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Last OC invoice'}),{target:{value:'TA #020\nPaid'}});
  fireEvent.blur(screen.getByRole('textbox'));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(save).toHaveBeenCalledWith('TA #020\nPaid');
});
it('Cancel discards the draft and reopening restores the stored value',()=>{
  const save=vi.fn();
  render(<OilChangeEditCell value="Original" label="Note" onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Edit Note'}));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Discard'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Edit Note'}));
  expect(screen.getByRole('textbox')).toHaveValue('Original');
});
it('retains the draft and displays a save error',async()=>{
  render(<OilChangeEditCell value={123} label="Odometer" type="number" onSave={async()=>{throw new Error('Update denied');}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Edit Odometer'}));
  fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'456'}});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Update denied');
  expect(screen.getByRole('spinbutton')).toHaveValue(456);
});
it('does not expose an editor for read-only fields',()=>{
  render(<OilChangeEditCell value="Private invoice" label="Invoice" readOnly onSave={vi.fn()}/>);
  expect(screen.getByText('Private invoice')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
