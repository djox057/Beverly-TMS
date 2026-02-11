-- Step 1: Move all FK references from ghost truck to real truck
UPDATE public.orders SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.orders SET original_truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE original_truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.assignment_history SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.assignment_history SET old_truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE old_truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.recovery_history SET recovery_truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE recovery_truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.recovery_history SET original_truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE original_truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.late_notifications SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.order_transfers SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.proximity_tracking SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.repairs SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.truck_files SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.truck_locations SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.truck_note_history SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.truck_notes SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';
UPDATE public.truck_termination_notes SET truck_id = '71976bdd-2060-4e47-9c3e-cba0417ff0a3' WHERE truck_id = 'c87f8b7f-01af-433c-92dc-518821273965';

-- Step 2: Delete the ghost truck
DELETE FROM public.trucks WHERE id = 'c87f8b7f-01af-433c-92dc-518821273965';

-- Step 3: Trim all remaining truck_numbers with trailing whitespace
UPDATE public.trucks SET truck_number = trim(truck_number) WHERE truck_number != trim(truck_number);